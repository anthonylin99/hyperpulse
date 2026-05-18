import type { SupportResistanceLevel } from "@/types";
import type { ChartInterval, LevelCandle } from "@/lib/supportResistance";

type NormalizedCandle = LevelCandle & {
  timeMs: number;
  index: number;
};

const INTERVAL_MS: Record<ChartInterval, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const DEFAULT_LIMIT = 8;
const MAX_DISTANCE_PCT = 18;

function normalizeTimestamp(time: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  return time > 10_000_000_000 ? time : time * 1000;
}

function normalizeCandles(candles: LevelCandle[]): NormalizedCandle[] {
  return candles
    .map((candle) => ({
      ...candle,
      timeMs: normalizeTimestamp(candle.time),
    }))
    .filter(
      (candle) =>
        candle.timeMs > 0 &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.open > 0 &&
        candle.high > 0 &&
        candle.low > 0 &&
        candle.close > 0 &&
        candle.high >= candle.low,
    )
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((candle, index) => ({ ...candle, index }));
}

function averageTrueRange(candles: NormalizedCandle[], length = 14): number {
  const scoped = candles.slice(-length);
  if (scoped.length === 0) return 0;

  return (
    scoped.reduce((sum, candle, index) => {
      const previousClose = index === 0 ? candle.close : scoped[index - 1].close;
      const trueRange = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
      return sum + Math.max(trueRange, 0);
    }, 0) / scoped.length
  );
}

function pivotWindow(interval: ChartInterval): number {
  if (interval === "5m" || interval === "15m") return 4;
  if (interval === "1h") return 3;
  return 2;
}

function consolidationWindow(interval: ChartInterval): number {
  if (interval === "5m" || interval === "15m") return 16;
  if (interval === "1h") return 12;
  return 8;
}

function isLocalHigh(candles: NormalizedCandle[], index: number, width: number): boolean {
  const high = candles[index].high;
  for (let offset = 1; offset <= width; offset += 1) {
    if (candles[index - offset].high >= high || candles[index + offset].high > high) return false;
  }
  return true;
}

function isLocalLow(candles: NormalizedCandle[], index: number, width: number): boolean {
  const low = candles[index].low;
  for (let offset = 1; offset <= width; offset += 1) {
    if (candles[index - offset].low <= low || candles[index + offset].low < low) return false;
  }
  return true;
}

function bodyHigh(candle: NormalizedCandle): number {
  return Math.max(candle.open, candle.close);
}

function bodyLow(candle: NormalizedCandle): number {
  return Math.min(candle.open, candle.close);
}

function isLocalBodyHigh(candles: NormalizedCandle[], index: number, width: number): boolean {
  const high = bodyHigh(candles[index]);
  for (let offset = 1; offset <= width; offset += 1) {
    if (bodyHigh(candles[index - offset]) >= high || bodyHigh(candles[index + offset]) > high) return false;
  }
  return true;
}

function isLocalBodyLow(candles: NormalizedCandle[], index: number, width: number): boolean {
  const low = bodyLow(candles[index]);
  for (let offset = 1; offset <= width; offset += 1) {
    if (bodyLow(candles[index - offset]) <= low || bodyLow(candles[index + offset]) < low) return false;
  }
  return true;
}

function distancePct(price: number, currentPrice: number): number {
  return ((price - currentPrice) / currentPrice) * 100;
}

function confidenceFor(score: number): "low" | "medium" | "high" {
  if (score >= 8) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function levelStatus(args: {
  candles: NormalizedCandle[];
  startIndex: number;
  price: number;
  kind: "support" | "resistance";
  atr: number;
}): "active" | "tested" | "broken" {
  const buffer = Math.max(args.atr * 0.14, args.price * 0.0006);
  const after = args.candles.slice(args.startIndex + 1);
  const tested = after.some((candle) => candle.low <= args.price + buffer && candle.high >= args.price - buffer);

  if (args.kind === "support") {
    const broken = after.some((candle) => candle.close < args.price - buffer);
    return broken ? "broken" : tested ? "tested" : "active";
  }

  const broken = after.some((candle) => candle.close > args.price + buffer);
  return broken ? "broken" : tested ? "tested" : "active";
}

function buildReversalPivots(
  candles: NormalizedCandle[],
  interval: ChartInterval,
  currentPrice: number,
  atr: number,
): SupportResistanceLevel[] {
  const width = pivotWindow(interval);
  const levels: SupportResistanceLevel[] = [];
  const reactionBars = Math.max(2, width + 1);

  for (let index = width; index < candles.length - reactionBars; index += 1) {
    const candle = candles[index];
    const next = candles.slice(index + 1, index + 1 + reactionBars);
    const previous = candles.slice(Math.max(0, index - width - 2), index);
    const previousLow = Math.min(...previous.map((item) => item.low));
    const previousHigh = Math.max(...previous.map((item) => item.high));
    const nextLow = Math.min(...next.map((item) => item.low));
    const nextHigh = Math.max(...next.map((item) => item.high));

    if (isLocalHigh(candles, index, width)) {
      const price = candle.high;
      const moveIntoLevel = price - previousLow;
      const rejectionMove = price - nextLow;
      const rejectionPct = (rejectionMove / price) * 100;
      const score = rejectionMove / Math.max(atr, price * 0.002) + moveIntoLevel / Math.max(atr * 2, price * 0.004);
      if (rejectionMove >= Math.max(atr * 0.6, price * 0.0045) && Math.abs(distancePct(price, currentPrice)) <= MAX_DISTANCE_PCT) {
        levels.push({
          id: `pivot-reversal-high-${candle.timeMs}-${price.toFixed(4)}`,
          label: "Reversal pivot",
          kind: "resistance",
          source: "swing_pivot",
          price,
          strength: score,
          distancePct: distancePct(price, currentPrice),
          pivotTimeMs: candle.timeMs,
          discoveredTimeMs: next[next.length - 1].timeMs + (INTERVAL_MS[interval] ?? 0),
          updatedAtMs: next[next.length - 1].timeMs,
          confidence: confidenceFor(score),
          status: levelStatus({ candles, startIndex: index + reactionBars, price, kind: "resistance", atr }),
          confirmationBars: reactionBars,
          reason: `Price rejected ${rejectionPct.toFixed(1)}% from this swing high within ${reactionBars} candles.`,
          evidence: [
            "Reversal pivot",
            `High ${price.toLocaleString(undefined, { maximumFractionDigits: price >= 100 ? 0 : 4 })}`,
            `${rejectionPct.toFixed(1)}% rejection`,
          ],
        });
      }
    }

    if (isLocalLow(candles, index, width)) {
      const price = candle.low;
      const moveIntoLevel = previousHigh - price;
      const rejectionMove = nextHigh - price;
      const rejectionPct = (rejectionMove / price) * 100;
      const score = rejectionMove / Math.max(atr, price * 0.002) + moveIntoLevel / Math.max(atr * 2, price * 0.004);
      if (rejectionMove >= Math.max(atr * 0.6, price * 0.0045) && Math.abs(distancePct(price, currentPrice)) <= MAX_DISTANCE_PCT) {
        levels.push({
          id: `pivot-reversal-low-${candle.timeMs}-${price.toFixed(4)}`,
          label: "Reversal pivot",
          kind: "support",
          source: "swing_pivot",
          price,
          strength: score,
          distancePct: distancePct(price, currentPrice),
          pivotTimeMs: candle.timeMs,
          discoveredTimeMs: next[next.length - 1].timeMs + (INTERVAL_MS[interval] ?? 0),
          updatedAtMs: next[next.length - 1].timeMs,
          confidence: confidenceFor(score),
          status: levelStatus({ candles, startIndex: index + reactionBars, price, kind: "support", atr }),
          confirmationBars: reactionBars,
          reason: `Price bounced ${rejectionPct.toFixed(1)}% from this swing low within ${reactionBars} candles.`,
          evidence: [
            "Reversal pivot",
            `Low ${price.toLocaleString(undefined, { maximumFractionDigits: price >= 100 ? 0 : 4 })}`,
            `${rejectionPct.toFixed(1)}% bounce`,
          ],
        });
      }
    }
  }

  return levels;
}

function buildBodyReversalPivots(
  candles: NormalizedCandle[],
  interval: ChartInterval,
  currentPrice: number,
  atr: number,
): SupportResistanceLevel[] {
  const width = pivotWindow(interval);
  const reactionBars = Math.max(2, width + 1);
  const levels: SupportResistanceLevel[] = [];

  for (let index = width; index < candles.length - reactionBars; index += 1) {
    const candle = candles[index];
    const next = candles.slice(index + 1, index + 1 + reactionBars);
    const previous = candles.slice(Math.max(0, index - width - 2), index);
    const previousBodyLow = Math.min(...previous.map(bodyLow));
    const previousBodyHigh = Math.max(...previous.map(bodyHigh));
    const nextLow = Math.min(...next.map((item) => item.low));
    const nextHigh = Math.max(...next.map((item) => item.high));

    if (isLocalBodyHigh(candles, index, width)) {
      const price = bodyHigh(candle);
      const moveIntoLevel = price - previousBodyLow;
      const rejectionMove = price - nextLow;
      const rejectionPct = (rejectionMove / price) * 100;
      const score = 1.4 + rejectionMove / Math.max(atr, price * 0.002) + moveIntoLevel / Math.max(atr * 2, price * 0.004);
      if (rejectionMove >= Math.max(atr * 0.45, price * 0.0035) && Math.abs(distancePct(price, currentPrice)) <= MAX_DISTANCE_PCT) {
        levels.push({
          id: `pivot-body-reversal-high-${candle.timeMs}-${price.toFixed(4)}`,
          label: "Reversal pivot",
          kind: "resistance",
          source: "swing_pivot",
          price,
          strength: score,
          distancePct: distancePct(price, currentPrice),
          pivotTimeMs: candle.timeMs,
          discoveredTimeMs: next[next.length - 1].timeMs + (INTERVAL_MS[interval] ?? 0),
          updatedAtMs: next[next.length - 1].timeMs,
          confidence: confidenceFor(score),
          status: levelStatus({ candles, startIndex: index + reactionBars, price, kind: "resistance", atr }),
          confirmationBars: reactionBars,
          reason: `Price rejected ${rejectionPct.toFixed(1)}% after this ${interval} body pivot.`,
          evidence: [
            "Body reversal pivot",
            `Body high ${price.toLocaleString(undefined, { maximumFractionDigits: price >= 100 ? 0 : 4 })}`,
            `${rejectionPct.toFixed(1)}% rejection`,
          ],
        });
      }
    }

    if (isLocalBodyLow(candles, index, width)) {
      const price = bodyLow(candle);
      const moveIntoLevel = previousBodyHigh - price;
      const rejectionMove = nextHigh - price;
      const rejectionPct = (rejectionMove / price) * 100;
      const score = 1.4 + rejectionMove / Math.max(atr, price * 0.002) + moveIntoLevel / Math.max(atr * 2, price * 0.004);
      if (rejectionMove >= Math.max(atr * 0.45, price * 0.0035) && Math.abs(distancePct(price, currentPrice)) <= MAX_DISTANCE_PCT) {
        levels.push({
          id: `pivot-body-reversal-low-${candle.timeMs}-${price.toFixed(4)}`,
          label: "Reversal pivot",
          kind: "support",
          source: "swing_pivot",
          price,
          strength: score,
          distancePct: distancePct(price, currentPrice),
          pivotTimeMs: candle.timeMs,
          discoveredTimeMs: next[next.length - 1].timeMs + (INTERVAL_MS[interval] ?? 0),
          updatedAtMs: next[next.length - 1].timeMs,
          confidence: confidenceFor(score),
          status: levelStatus({ candles, startIndex: index + reactionBars, price, kind: "support", atr }),
          confirmationBars: reactionBars,
          reason: `Price bounced ${rejectionPct.toFixed(1)}% after this ${interval} body pivot.`,
          evidence: [
            "Body reversal pivot",
            `Body low ${price.toLocaleString(undefined, { maximumFractionDigits: price >= 100 ? 0 : 4 })}`,
            `${rejectionPct.toFixed(1)}% bounce`,
          ],
        });
      }
    }
  }

  return levels;
}

function buildBreakoutRetestLevels(
  candles: NormalizedCandle[],
  interval: ChartInterval,
  currentPrice: number,
  atr: number,
): SupportResistanceLevel[] {
  const windowSize = consolidationWindow(interval);
  const levels: SupportResistanceLevel[] = [];
  const compactRangeLimitPct = interval === "4h" || interval === "1d" ? 4.8 : 3.2;

  for (let index = windowSize; index < candles.length; index += 1) {
    const candle = candles[index];
    const base = candles.slice(index - windowSize, index);
    const closeHigh = Math.max(...base.map((item) => item.close));
    const closeLow = Math.min(...base.map((item) => item.close));
    const rangePct = ((closeHigh - closeLow) / candle.close) * 100;
    if (!Number.isFinite(rangePct) || rangePct > compactRangeLimitPct) continue;

    const breakoutBuffer = Math.max(atr * 0.08, candle.close * 0.0007);
    const brokeUp = candle.close > closeHigh + breakoutBuffer;
    const brokeDown = candle.close < closeLow - breakoutBuffer;
    if (!brokeUp && !brokeDown) continue;

    const levelPrice = brokeUp ? closeHigh : closeLow;
    const breakoutMove = Math.abs(candle.close - levelPrice);
    const score = breakoutMove / Math.max(atr * 0.2, candle.close * 0.001) + Math.max(0, compactRangeLimitPct - rangePct) * 0.7;
    if (Math.abs(distancePct(levelPrice, currentPrice)) > MAX_DISTANCE_PCT) continue;

    levels.push({
      id: `pivot-breakout-${brokeUp ? "up" : "down"}-${candle.timeMs}-${levelPrice.toFixed(4)}`,
      label: "Breakout close",
      kind: brokeUp ? "support" : "resistance",
      source: "swing_pivot",
      price: levelPrice,
      strength: score,
      distancePct: distancePct(levelPrice, currentPrice),
      pivotTimeMs: candle.timeMs,
      discoveredTimeMs: candle.timeMs + (INTERVAL_MS[interval] ?? 0),
      updatedAtMs: candle.timeMs,
      confidence: confidenceFor(score),
      status: levelStatus({ candles, startIndex: index, price: levelPrice, kind: brokeUp ? "support" : "resistance", atr }),
      confirmationBars: windowSize,
      reason: brokeUp
        ? `Breakout line from the highest close of the prior ${windowSize} candles.`
        : `Breakdown line from the lowest close of the prior ${windowSize} candles.`,
      evidence: [
        brokeUp ? "Breakout retest line" : "Breakdown retest line",
        `Prior ${windowSize}-candle ${brokeUp ? "high close" : "low close"}`,
        `Range ${rangePct.toFixed(1)}%`,
      ],
    });
  }

  return levels;
}

function dedupeLevels(levels: SupportResistanceLevel[], currentPrice: number): SupportResistanceLevel[] {
  const tolerance = Math.max(currentPrice * 0.0012, 1);
  const priority = (level: SupportResistanceLevel) =>
    level.strength * (level.evidence?.[0]?.includes("Body reversal") ? 2.3 : level.label === "Reversal pivot" ? 1.35 : 1);
  const sorted = [...levels].sort((a, b) => priority(b) - priority(a));
  const output: SupportResistanceLevel[] = [];

  for (const level of sorted) {
    const match = output.find((existing) => Math.abs(existing.price - level.price) <= tolerance);
    if (!match) {
      output.push(level);
      continue;
    }

    if (priority(level) > priority(match)) {
      const index = output.indexOf(match);
      output[index] = level;
    }
  }

  return output;
}

function rankLevels(levels: SupportResistanceLevel[]): SupportResistanceLevel[] {
  return [...levels].sort((a, b) => {
    const aDistance = Math.abs(a.distancePct ?? Infinity);
    const bDistance = Math.abs(b.distancePct ?? Infinity);
    const aScore = a.strength / Math.max(aDistance, 0.35);
    const bScore = b.strength / Math.max(bDistance, 0.35);
    return bScore - aScore;
  });
}

export function calculatePivotLiquidityLevels(
  candles: LevelCandle[],
  interval: ChartInterval,
  limit = DEFAULT_LIMIT,
): SupportResistanceLevel[] {
  const normalized = normalizeCandles(candles);
  if (normalized.length < 30) return [];

  const currentPrice = normalized[normalized.length - 1].close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const atr = averageTrueRange(normalized);
  const reversalPivots = buildReversalPivots(normalized, interval, currentPrice, atr);
  const bodyReversalPivots = buildBodyReversalPivots(normalized, interval, currentPrice, atr);
  const breakoutLevels = buildBreakoutRetestLevels(normalized, interval, currentPrice, atr);

  const candidates = dedupeLevels([...reversalPivots, ...bodyReversalPivots, ...breakoutLevels], currentPrice)
    .filter((level) => level.status === "active");
  const reversalLimit = Math.max(2, Math.floor(limit / 2));
  const breakoutLimit = Math.max(2, limit - reversalLimit);
  const selected = [
    ...rankLevels(candidates.filter((level) => level.label === "Reversal pivot")).slice(0, reversalLimit),
    ...rankLevels(candidates.filter((level) => level.label !== "Reversal pivot")).slice(0, breakoutLimit),
  ];

  return rankLevels(dedupeLevels(selected, currentPrice))
    .slice(0, limit)
    .sort((a, b) => a.price - b.price);
}
