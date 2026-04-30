import type { SupportResistanceLevel } from "@/types";

export type ChartInterval = "5m" | "15m" | "1h" | "4h" | "1d";

export type LevelCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type NormalizedCandle = LevelCandle & {
  timeMs: number;
  index: number;
};

type Pivot = {
  price: number;
  kind: "support" | "resistance";
  timeMs: number;
  confirmedTimeMs: number;
  index: number;
  confirmedIndex: number;
  volume: number;
  wickRejection: number;
};

const LUX_STYLE_PIVOT_LENGTH = 14;
const BREAK_ATR_MULTIPLIER = 0.18;

const INTERVAL_MS: Record<ChartInterval, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

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
        candle.high >= candle.low &&
        candle.close > 0,
    )
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((candle, index) => ({ ...candle, index }));
}

function averageTrueRange(candles: NormalizedCandle[], length = LUX_STYLE_PIVOT_LENGTH): number {
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

function pivotLengthForInterval(interval: ChartInterval, candleCount: number): number {
  const base =
    interval === "5m" || interval === "15m"
      ? LUX_STYLE_PIVOT_LENGTH
      : interval === "1h"
        ? 10
        : 6;
  return Math.max(3, Math.min(base, Math.floor((candleCount - 1) / 3)));
}

function isPivotHigh(candles: NormalizedCandle[], index: number, length: number): boolean {
  const high = candles[index].high;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].high >= high || candles[index + offset].high > high) return false;
  }
  return true;
}

function isPivotLow(candles: NormalizedCandle[], index: number, length: number): boolean {
  const low = candles[index].low;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].low <= low || candles[index + offset].low < low) return false;
  }
  return true;
}

function candleRejection(candle: NormalizedCandle, kind: "support" | "resistance"): number {
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  const range = Math.max(candle.high - candle.low, 1e-9);

  if (kind === "support") return Math.max(bodyLow - candle.low, 0) / range;
  return Math.max(candle.high - bodyHigh, 0) / range;
}

function findConfirmedPivots(candles: NormalizedCandle[], interval: ChartInterval): Pivot[] {
  const length = pivotLengthForInterval(interval, candles.length);
  const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS["15m"];
  if (candles.length < length * 2 + 5) return [];

  const pivots: Pivot[] = [];

  for (let index = length; index < candles.length - length; index += 1) {
    const candle = candles[index];
    if (isPivotHigh(candles, index, length)) {
      pivots.push({
        price: candle.high,
        kind: "resistance",
        timeMs: candle.timeMs,
        confirmedTimeMs: candles[index + length].timeMs + intervalMs,
        index,
        confirmedIndex: index + length,
        volume: candle.volume,
        wickRejection: candleRejection(candle, "resistance"),
      });
    }

    if (isPivotLow(candles, index, length)) {
      pivots.push({
        price: candle.low,
        kind: "support",
        timeMs: candle.timeMs,
        confirmedTimeMs: candles[index + length].timeMs + intervalMs,
        index,
        confirmedIndex: index + length,
        volume: candle.volume,
        wickRejection: candleRejection(candle, "support"),
      });
    }
  }

  return pivots;
}

function levelBand(price: number, atr: number, kind: "support" | "resistance") {
  const halfWidth = Math.max(price * 0.0009, atr * 0.22);
  return {
    zoneLow: kind === "support" ? price - halfWidth : price - halfWidth * 0.65,
    zoneHigh: kind === "support" ? price + halfWidth * 0.65 : price + halfWidth,
  };
}

function confidenceFor(strength: number): "low" | "medium" | "high" {
  if (strength >= 8) return "high";
  if (strength >= 5) return "medium";
  return "low";
}

function expiryFor(discoveredTimeMs: number, interval: ChartInterval): number {
  const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS["15m"];
  const bars =
    interval === "5m" ? 36 :
      interval === "15m" ? 32 :
        interval === "1h" ? 36 :
          interval === "4h" ? 30 :
            20;
  return discoveredTimeMs + intervalMs * bars;
}

function isLevelBroken(
  candles: NormalizedCandle[],
  pivot: Pick<Pivot, "kind" | "price" | "index">,
  atr: number,
): boolean {
  const breakBuffer = Math.max(atr * BREAK_ATR_MULTIPLIER, pivot.price * 0.0008);
  const afterPivot = candles.slice(pivot.index + 1);

  if (pivot.kind === "support") {
    return afterPivot.some((candle) => candle.close < pivot.price - breakBuffer);
  }

  return afterPivot.some((candle) => candle.close > pivot.price + breakBuffer);
}

function buildStructureZones(
  candles: NormalizedCandle[],
  interval: ChartInterval,
  currentPrice: number,
): SupportResistanceLevel[] {
  const pivots = findConfirmedPivots(candles, interval);
  const atr = averageTrueRange(candles);
  const averageVolume =
    candles.reduce((sum, candle) => sum + Math.max(candle.volume || 0, 0), 0) / Math.max(candles.length, 1);
  const tolerance = Math.max(currentPrice * 0.0012, atr * 0.45);

  const activePivots = pivots.filter((pivot) => !isLevelBroken(candles, pivot, atr));
  const clusters: Array<{
    price: number;
    kind: "support" | "resistance";
    touches: number;
    firstTimeMs: number;
    lastTimeMs: number;
    discoveredTimeMs: number;
    score: number;
  }> = [];

  for (const pivot of activePivots) {
    const match = clusters.find(
      (cluster) => cluster.kind === pivot.kind && Math.abs(cluster.price - pivot.price) <= tolerance,
    );
    const ageRatio = (pivot.timeMs - candles[0].timeMs) / Math.max(candles[candles.length - 1].timeMs - candles[0].timeMs, 1);
    const volumeBoost = averageVolume > 0 ? Math.min(Math.max(pivot.volume / averageVolume, 0), 3) : 0;
    const pivotScore = 1 + ageRatio * 2 + pivot.wickRejection * 1.5 + volumeBoost * 0.5;

    if (!match) {
      clusters.push({
        price: pivot.price,
        kind: pivot.kind,
        touches: 1,
        firstTimeMs: pivot.timeMs,
        lastTimeMs: pivot.timeMs,
        discoveredTimeMs: pivot.confirmedTimeMs,
        score: pivotScore,
      });
      continue;
    }

    match.price = (match.price * match.touches + pivot.price) / (match.touches + 1);
    match.touches += 1;
    match.firstTimeMs = Math.min(match.firstTimeMs, pivot.timeMs);
    match.lastTimeMs = Math.max(match.lastTimeMs, pivot.timeMs);
    match.discoveredTimeMs = Math.max(match.discoveredTimeMs, pivot.confirmedTimeMs);
    match.score += pivotScore;
  }

  return clusters.map((cluster) => {
    const strength = cluster.score + cluster.touches;
    const expiresAtMs = expiryFor(cluster.discoveredTimeMs, interval);
    return {
      id: `structure-zone-${cluster.kind}-${cluster.price.toFixed(4)}`,
      label: cluster.kind === "support" ? "Forecast Support" : "Forecast Resistance",
      kind: cluster.kind,
      source: "structure_pivot",
      price: cluster.price,
      ...levelBand(cluster.price, atr, cluster.kind),
      strength,
      touches: cluster.touches,
      pivotTimeMs: cluster.firstTimeMs,
      discoveredTimeMs: cluster.discoveredTimeMs,
      updatedAtMs: cluster.lastTimeMs,
      expiresAtMs,
      confidence: confidenceFor(strength),
      status: candles[candles.length - 1].timeMs > expiresAtMs ? "expired" : "active",
      confirmationBars: pivotLengthForInterval(interval, candles.length),
      reason: `${cluster.touches} confirmed pivot${cluster.touches === 1 ? "" : "s"}; visible only after confirmation candles closed.`,
    } satisfies SupportResistanceLevel;
  });
}

function buildTrendlineLevels(
  candles: NormalizedCandle[],
  interval: ChartInterval,
  currentPrice: number,
): SupportResistanceLevel[] {
  const pivots = findConfirmedPivots(candles, interval);
  const atr = averageTrueRange(candles);
  const averageVolume =
    candles.reduce((sum, candle) => sum + Math.max(candle.volume || 0, 0), 0) / Math.max(candles.length, 1);
  const levels: SupportResistanceLevel[] = [];
  const currentIndex = candles.length - 1;

  for (const kind of ["support", "resistance"] as const) {
    const relevant = pivots.filter((pivot) => pivot.kind === kind).slice(-4);
    if (relevant.length < 2) continue;

    const [first, second] = relevant.slice(-2);
    const indexDelta = Math.max(second.index - first.index, 1);
    const rawSlope = (second.price - first.price) / indexDelta;
    const atrSlopeCap = atr / Math.max(LUX_STYLE_PIVOT_LENGTH, 1);
    const slope =
      atrSlopeCap > 0
        ? Math.max(Math.min(rawSlope, atrSlopeCap), -atrSlopeCap)
        : rawSlope;
    const projected = second.price + slope * (currentIndex - second.index);

    if (!Number.isFinite(projected) || projected <= 0) continue;
    if (kind === "support" && projected >= currentPrice) continue;
    if (kind === "resistance" && projected <= currentPrice) continue;
    if (isLevelBroken(candles, { kind, price: projected, index: second.index }, atr)) continue;
    const strength = 4 + second.wickRejection + (averageVolume > 0 ? Math.min(second.volume / averageVolume, 2) : 0);

    levels.push({
      id: `structure-trendline-${kind}-${projected.toFixed(4)}`,
      label: kind === "support" ? "Trend Support" : "Trend Resistance",
      kind,
      source: "structure_trendline",
      price: projected,
      ...levelBand(projected, atr, kind),
      strength,
      touches: 2,
      pivotTimeMs: first.timeMs,
      discoveredTimeMs: second.confirmedTimeMs,
      updatedAtMs: second.timeMs,
      expiresAtMs: expiryFor(second.confirmedTimeMs, interval),
      confidence: confidenceFor(strength),
      status: "active",
      confirmationBars: pivotLengthForInterval(interval, candles.length),
      reason: "Projected from the two latest confirmed pivots; not drawn before the second pivot was confirmed.",
    });
  }

  return levels;
}

export function calculateSupportResistanceLevels(
  candles: LevelCandle[],
  interval: ChartInterval,
): SupportResistanceLevel[] {
  const normalized = normalizeCandles(candles);
  if (normalized.length < 20) return [];

  const currentPrice = normalized[normalized.length - 1].close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const structureZones = buildStructureZones(normalized, interval, currentPrice);
  const trendlineLevels = buildTrendlineLevels(normalized, interval, currentPrice);
  const combined = [...structureZones, ...trendlineLevels]
    .map((level) => ({
      ...level,
      distancePct: ((level.price - currentPrice) / currentPrice) * 100,
    }))
    .filter((level) => {
      if (level.kind === "support") return level.price < currentPrice && Math.abs(level.distancePct ?? 0) <= 18;
      if (level.kind === "resistance") return level.price > currentPrice && Math.abs(level.distancePct ?? 0) <= 18;
      return true;
    });

  return combined
    .sort((a, b) => {
      const aDistance = Math.abs(a.distancePct ?? Infinity);
      const bDistance = Math.abs(b.distancePct ?? Infinity);
      const aScore = a.strength / Math.max(aDistance, 0.15);
      const bScore = b.strength / Math.max(bDistance, 0.15);
      return bScore - aScore;
    })
    .slice(0, 8);
}

export function nearestLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
): SupportResistanceLevel | null {
  return (
    levels
      .filter((level) => level.kind === kind)
      .sort((a, b) => {
        const aDistance = Math.abs(a.distancePct ?? Infinity);
        const bDistance = Math.abs(b.distancePct ?? Infinity);
        const aScore = a.strength / Math.max(aDistance, 0.15);
        const bScore = b.strength / Math.max(bDistance, 0.15);
        return bScore - aScore;
      })[0] ?? null
  );
}
