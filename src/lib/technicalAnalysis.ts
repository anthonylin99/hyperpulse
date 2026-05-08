import type { SupportResistanceLevel } from "@/types";
import type { LevelCandle } from "@/lib/supportResistance";

export type MovingAveragePoint = {
  time: number;
  value: number;
};

export type MovingAveragePack = {
  ema9: MovingAveragePoint[];
  ema21: MovingAveragePoint[];
  sma50: MovingAveragePoint[];
  sma200: MovingAveragePoint[];
  latest: {
    ema9: number | null;
    ema21: number | null;
    sma50: number | null;
    sma200: number | null;
  };
};

export type TaGuideBias =
  | "momentum-long"
  | "pullback-long"
  | "rejection-risk"
  | "breakdown-risk"
  | "no-trade";

export type TaGuide = {
  bias: TaGuideBias;
  biasLabel: string;
  tone: "green" | "red" | "amber" | "neutral";
  confidence: "low" | "medium" | "high";
  trendLabel: string;
  trendDetail: string;
  entryCondition: string;
  trimText: string;
  invalidationText: string;
  why: string[];
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
  nextResistance: SupportResistanceLevel | null;
  nextSupport: SupportResistanceLevel | null;
  movingAverages: MovingAveragePack;
};

function normalizeTimestamp(time: number): number {
  return time > 10_000_000_000 ? time : time * 1000;
}

function sortCandles(candles: LevelCandle[]): LevelCandle[] {
  return [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => normalizeTimestamp(a.time) - normalizeTimestamp(b.time));
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function averageTrueRange(candles: LevelCandle[], length = 14): number {
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

function buildEma(candles: LevelCandle[], length: number): MovingAveragePoint[] {
  if (candles.length === 0) return [];
  const multiplier = 2 / (length + 1);
  let ema = candles[0].close;

  return candles.map((candle, index) => {
    ema = index === 0 ? candle.close : candle.close * multiplier + ema * (1 - multiplier);
    return { time: candle.time, value: ema };
  });
}

function buildSma(candles: LevelCandle[], length: number): MovingAveragePoint[] {
  if (candles.length < length) return [];
  const output: MovingAveragePoint[] = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= length) sum -= candles[index - length].close;
    if (index >= length - 1) {
      output.push({ time: candle.time, value: sum / length });
    }
  });

  return output;
}

function lastValue(points: MovingAveragePoint[]): number | null {
  return points.at(-1)?.value ?? null;
}

export function buildMovingAverages(candles: LevelCandle[]): MovingAveragePack {
  const sorted = sortCandles(candles);
  const ema9 = buildEma(sorted, 9);
  const ema21 = buildEma(sorted, 21);
  const sma50 = buildSma(sorted, 50);
  const sma200 = buildSma(sorted, 200);

  return {
    ema9,
    ema21,
    sma50,
    sma200,
    latest: {
      ema9: lastValue(ema9),
      ema21: lastValue(ema21),
      sma50: lastValue(sma50),
      sma200: lastValue(sma200),
    },
  };
}

function nearestLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
  currentPrice: number,
): SupportResistanceLevel | null {
  return (
    levels
      .filter((level) => level.kind === kind && level.status !== "expired" && level.status !== "broken")
      .filter((level) => (kind === "support" ? level.price < currentPrice : level.price > currentPrice))
      .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))[0] ?? null
  );
}

function nextLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
  fromPrice: number,
  excludePrice?: number,
): SupportResistanceLevel | null {
  const sorted = levels
    .filter((level) => level.kind === kind && level.status !== "expired" && level.status !== "broken")
    .filter((level) =>
      kind === "support"
        ? level.price < fromPrice
        : level.price > fromPrice,
    )
    .filter((level) => excludePrice == null || Math.abs(level.price - excludePrice) / Math.max(fromPrice, 1e-9) > 0.002)
    .sort((a, b) => (kind === "support" ? b.price - a.price : a.price - b.price));
  return sorted[0] ?? null;
}

function pctDistance(from: number, to: number | null | undefined): number | null {
  if (to == null || !Number.isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function isSlopeUp(points: MovingAveragePoint[], lookback = 5): boolean {
  const latest = points.at(-1)?.value;
  const previous = points.at(-lookback)?.value;
  return latest != null && previous != null && latest > previous;
}

function isSlopeDown(points: MovingAveragePoint[], lookback = 5): boolean {
  const latest = points.at(-1)?.value;
  const previous = points.at(-lookback)?.value;
  return latest != null && previous != null && latest < previous;
}

function trendRead(currentPrice: number, averages: MovingAveragePack): { label: string; detail: string; up: boolean; down: boolean } {
  const { ema9, ema21, sma50, sma200 } = averages.latest;
  const ema9Up = isSlopeUp(averages.ema9);
  const ema9Down = isSlopeDown(averages.ema9);
  const aboveFastStack = ema9 != null && ema21 != null && currentPrice > ema9 && ema9 > ema21;
  const belowFastStack = ema9 != null && ema21 != null && currentPrice < ema9 && ema9 < ema21;
  const fullBullStack = aboveFastStack && sma50 != null && ema21 > sma50 && (sma200 == null || sma50 > sma200);
  const fullBearStack = belowFastStack && sma50 != null && ema21 < sma50 && (sma200 == null || sma50 < sma200);

  if (fullBullStack && ema9Up) return { label: "Trend up", detail: "EMA 9 > 21 > SMA 50", up: true, down: false };
  if (fullBearStack && ema9Down) return { label: "Trend down", detail: "EMA 9 < 21 < SMA 50", up: false, down: true };
  if (aboveFastStack) return { label: "Constructive", detail: "Price above EMA 9/21", up: true, down: false };
  if (belowFastStack) return { label: "Weak", detail: "Price below EMA 9/21", up: false, down: true };
  return { label: "Chop", detail: "MA stack mixed", up: false, down: false };
}

export function buildTaGuide({
  candles,
  levels,
  fundingAPR,
  fundingPercentile,
}: {
  candles: LevelCandle[];
  levels: SupportResistanceLevel[];
  fundingAPR?: number | null;
  fundingPercentile?: number | null;
}): TaGuide {
  const sorted = sortCandles(candles);
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  const movingAverages = buildMovingAverages(sorted);

  if (!latest || !previous) {
    return {
      bias: "no-trade",
      biasLabel: "Warming up",
      tone: "neutral",
      confidence: "low",
      trendLabel: "Warming up",
      trendDetail: "Need more candles",
      entryCondition: "Wait for candle history.",
      trimText: "n/a",
      invalidationText: "n/a",
      why: ["No clean setup yet."],
      nearestSupport: null,
      nearestResistance: null,
      nextResistance: null,
      nextSupport: null,
      movingAverages,
    };
  }

  const currentPrice = latest.close;
  const atr = averageTrueRange(sorted);
  const breakBuffer = Math.max(atr * 0.12, currentPrice * 0.001);
  const support = nearestLevel(levels, "support", currentPrice);
  const resistance = nearestLevel(levels, "resistance", currentPrice);
  const nextResistanceLevel = resistance ? nextLevel(levels, "resistance", resistance.price, resistance.price) : null;
  const nextSupportLevel = support ? nextLevel(levels, "support", support.price, support.price) : null;
  const supportDistance = pctDistance(currentPrice, support?.price);
  const resistanceDistance = pctDistance(currentPrice, resistance?.price);
  const trend = trendRead(currentPrice, movingAverages);
  const richFunding = fundingAPR != null && fundingAPR > 25;
  const cheapFunding = fundingAPR != null && fundingAPR < -15;
  const crowdedFunding = richFunding || (fundingPercentile != null && fundingPercentile >= 85);

  const resistanceBreak = resistance != null && previous.close <= resistance.price && latest.close > resistance.price + breakBuffer;
  const supportBreak = support != null && previous.close >= support.price && latest.close < support.price - breakBuffer;
  const atSupport = supportDistance != null && supportDistance <= 0 && Math.abs(supportDistance) <= 0.85;
  const atResistance = resistanceDistance != null && resistanceDistance >= 0 && resistanceDistance <= 0.85;
  const fastInvalidation = movingAverages.latest.ema21 ?? movingAverages.latest.sma50 ?? support?.price ?? null;
  const longInvalidation = support?.price ?? fastInvalidation;
  const shortInvalidation = resistance?.price ?? movingAverages.latest.ema21 ?? null;

  const maReason = movingAverages.latest.sma200 == null
    ? `${trend.detail}; SMA 200 warming up.`
    : trend.detail;
  const fundingReason = richFunding
    ? "Funding is rich; prefer retests over chasing."
    : cheapFunding
      ? "Funding is negative; shorts can be squeeze-prone."
      : null;

  if (supportBreak && support) {
    return {
      bias: "breakdown-risk",
      biasLabel: "Breakdown risk",
      tone: "red",
      confidence: trend.down ? "medium" : "low",
      trendLabel: trend.label,
      trendDetail: trend.detail,
      entryCondition: `Watch failed reclaim below ${formatPrice(support.price)}.`,
      trimText: nextSupportLevel ? `Downside level ${formatPrice(nextSupportLevel.price)}` : "No clean downside level.",
      invalidationText: shortInvalidation ? `Invalidate above ${formatPrice(shortInvalidation)}.` : "Invalidate on reclaim.",
      why: [maReason, `Lost support at ${formatPrice(support.price)}.`].slice(0, 2),
      nearestSupport: support,
      nearestResistance: resistance,
      nextResistance: nextResistanceLevel,
      nextSupport: nextSupportLevel,
      movingAverages,
    };
  }

  if (resistanceBreak && resistance) {
    return {
      bias: "momentum-long",
      biasLabel: "Momentum long",
      tone: "green",
      confidence: trend.up && !crowdedFunding ? "high" : trend.up ? "medium" : "low",
      trendLabel: trend.label,
      trendDetail: trend.detail,
      entryCondition: `Watch retest/hold above ${formatPrice(resistance.price)}.`,
      trimText: nextResistanceLevel ? `Trim into ${formatPrice(nextResistanceLevel.price)}` : "Trail above breakout.",
      invalidationText: `Invalidate below ${formatPrice(resistance.price - Math.max(atr * 0.45, resistance.price * 0.002))}.`,
      why: [maReason, fundingReason ?? `Cleared resistance at ${formatPrice(resistance.price)}.`].slice(0, 2),
      nearestSupport: support,
      nearestResistance: resistance,
      nextResistance: nextResistanceLevel,
      nextSupport: nextSupportLevel,
      movingAverages,
    };
  }

  if (atSupport && support && trend.up) {
    return {
      bias: "pullback-long",
      biasLabel: "Pullback long",
      tone: "green",
      confidence: crowdedFunding ? "low" : "medium",
      trendLabel: trend.label,
      trendDetail: trend.detail,
      entryCondition: `Watch hold/reclaim of ${formatPrice(support.price)}.`,
      trimText: resistance ? `Trim into ${formatPrice(resistance.price)}` : "No clean resistance yet.",
      invalidationText: longInvalidation ? `Invalidate below ${formatPrice(longInvalidation)}.` : "Invalidate below support.",
      why: [maReason, fundingReason ?? `Support is ${Math.abs(supportDistance ?? 0).toFixed(2)}% below.`].slice(0, 2),
      nearestSupport: support,
      nearestResistance: resistance,
      nextResistance: nextResistanceLevel,
      nextSupport: nextSupportLevel,
      movingAverages,
    };
  }

  if (atResistance && resistance) {
    return {
      bias: "rejection-risk",
      biasLabel: "Rejection risk",
      tone: "amber",
      confidence: richFunding ? "medium" : "low",
      trendLabel: trend.label,
      trendDetail: trend.detail,
      entryCondition: `Need acceptance above ${formatPrice(resistance.price)}.`,
      trimText: `Consider trimming into ${formatPrice(resistance.price)} if rejection appears.`,
      invalidationText: `Breakout view fails below ${formatPrice(resistance.price - Math.max(atr * 0.45, resistance.price * 0.002))}.`,
      why: [maReason, fundingReason ?? `Resistance is ${Math.abs(resistanceDistance ?? 0).toFixed(2)}% above.`].slice(0, 2),
      nearestSupport: support,
      nearestResistance: resistance,
      nextResistance: nextResistanceLevel,
      nextSupport: nextSupportLevel,
      movingAverages,
    };
  }

  if (trend.up) {
    return {
      bias: "momentum-long",
      biasLabel: "Trend up",
      tone: "green",
      confidence: crowdedFunding ? "low" : "medium",
      trendLabel: trend.label,
      trendDetail: trend.detail,
      entryCondition: resistance ? `Watch reclaim/break above ${formatPrice(resistance.price)}.` : "Watch hold above EMA 21.",
      trimText: nextResistanceLevel
        ? `Next trim ${formatPrice(nextResistanceLevel.price)}`
        : resistance
          ? `Trim into ${formatPrice(resistance.price)}`
          : "No clean resistance yet.",
      invalidationText: longInvalidation ? `Invalidate below ${formatPrice(longInvalidation)}.` : "Invalidate on EMA failure.",
      why: [maReason, fundingReason ?? "Trend stack is constructive."].slice(0, 2),
      nearestSupport: support,
      nearestResistance: resistance,
      nextResistance: nextResistanceLevel,
      nextSupport: nextSupportLevel,
      movingAverages,
    };
  }

  return {
    bias: "no-trade",
    biasLabel: "No clean setup",
    tone: "neutral",
    confidence: "low",
    trendLabel: trend.label,
    trendDetail: trend.detail,
    entryCondition: resistance ? `Wait for reclaim above ${formatPrice(resistance.price)}.` : "Wait for a cleaner level.",
    trimText: resistance ? `Upside level ${formatPrice(resistance.price)}` : "n/a",
    invalidationText: support ? `Risk rises below ${formatPrice(support.price)}.` : "n/a",
    why: [maReason, "Price is between clean decision levels."].slice(0, 2),
    nearestSupport: support,
    nearestResistance: resistance,
    nextResistance: nextResistanceLevel,
    nextSupport: nextSupportLevel,
    movingAverages,
  };
}
