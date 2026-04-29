import type { SupportResistanceLevel } from "@/types";
import type { ChartInterval, LevelCandle } from "@/lib/supportResistance";

export interface TradePlan {
  bias: "wait" | "long-setup" | "short-setup";
  title: string;
  summary: string;
  trigger: string;
  invalidation: string;
  targets: string[];
  confidence: "low" | "medium" | "high";
  context: string[];
}

export interface MarketSetupSignal {
  type: "support-reclaim" | "resistance-break" | "support-break" | "near-resistance" | "near-support" | "none";
  label: string;
  detail: string;
  tone: "green" | "red" | "amber" | "neutral";
  level: number | null;
  distancePct: number | null;
  isActive: boolean;
}

function normalizeTimestamp(time: number): number {
  return time > 10_000_000_000 ? time : time * 1000;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value >= 100
    ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
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

function nearestLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
  currentPrice: number,
): SupportResistanceLevel | null {
  return (
    levels
      .filter((level) => level.kind === kind && (kind === "support" ? level.price < currentPrice : level.price > currentPrice))
      .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))[0] ?? null
  );
}

function nextResistance(
  levels: SupportResistanceLevel[],
  currentPrice: number,
  excludePrice?: number,
): SupportResistanceLevel | null {
  return (
    levels
      .filter(
        (level) =>
          level.kind === "resistance" &&
          level.price > currentPrice &&
          (excludePrice == null || Math.abs(level.price - excludePrice) / currentPrice > 0.002),
      )
      .sort((a, b) => a.price - b.price)[0] ?? null
  );
}

function nextSupport(
  levels: SupportResistanceLevel[],
  currentPrice: number,
  excludePrice?: number,
): SupportResistanceLevel | null {
  return (
    levels
      .filter(
        (level) =>
          level.kind === "support" &&
          level.price < currentPrice &&
          (excludePrice == null || Math.abs(level.price - excludePrice) / currentPrice > 0.002),
      )
      .sort((a, b) => b.price - a.price)[0] ?? null
  );
}

function fundingContext(fundingAPR?: number | null, fundingPercentile?: number | null): string | null {
  if (fundingAPR == null || !Number.isFinite(fundingAPR)) return null;
  if (fundingAPR < -8 || (fundingPercentile != null && fundingPercentile <= 20)) {
    return "Funding is negative/cheap, so shorts may be crowded. That can support long squeezes only if price reclaims a level.";
  }
  if (fundingAPR > 8 || (fundingPercentile != null && fundingPercentile >= 80)) {
    return "Funding is elevated, so longs may be crowded. Longs need cleaner confirmation and tighter invalidation.";
  }
  return "Funding is not extreme enough to drive the setup by itself.";
}

export function buildMarketSetupSignal({
  candles,
  levels,
}: {
  candles: LevelCandle[];
  levels: SupportResistanceLevel[];
}): MarketSetupSignal {
  const sorted = [...candles].sort((a, b) => normalizeTimestamp(a.time) - normalizeTimestamp(b.time));
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);

  if (!latest || !previous || levels.length === 0) {
    return {
      type: "none",
      label: "No setup",
      detail: "Waiting for structure",
      tone: "neutral",
      level: null,
      distancePct: null,
      isActive: false,
    };
  }

  const currentPrice = latest.close;
  const atr = averageTrueRange(sorted);
  const support = nearestLevel(levels, "support", currentPrice);
  const resistance = nearestLevel(levels, "resistance", currentPrice);
  const supportDistance = support ? ((currentPrice - support.price) / currentPrice) * 100 : null;
  const resistanceDistance = resistance ? ((resistance.price - currentPrice) / currentPrice) * 100 : null;
  const breakBuffer = Math.max(atr * 0.12, currentPrice * 0.001);
  const proximityPct = 0.55;

  const resistanceBreak =
    resistance != null &&
    previous.close <= resistance.price &&
    latest.close > resistance.price + breakBuffer;
  if (resistanceBreak && resistance) {
    return {
      type: "resistance-break",
      label: "Resistance break",
      detail: `Cleared ${formatPrice(resistance.price)}`,
      tone: "green",
      level: resistance.price,
      distancePct: resistanceDistance,
      isActive: true,
    };
  }

  const supportReclaim =
    support != null &&
    latest.low <= support.price + atr * 0.35 &&
    latest.close > support.price + breakBuffer &&
    latest.close > previous.close;
  if (supportReclaim && support) {
    return {
      type: "support-reclaim",
      label: "Support reclaim",
      detail: `Held ${formatPrice(support.price)}`,
      tone: "green",
      level: support.price,
      distancePct: supportDistance,
      isActive: true,
    };
  }

  const supportBreak =
    support != null &&
    previous.close >= support.price &&
    latest.close < support.price - breakBuffer;
  if (supportBreak && support) {
    return {
      type: "support-break",
      label: "Support break",
      detail: `Lost ${formatPrice(support.price)}`,
      tone: "red",
      level: support.price,
      distancePct: supportDistance,
      isActive: true,
    };
  }

  if (resistance && resistanceDistance != null && resistanceDistance <= proximityPct) {
    return {
      type: "near-resistance",
      label: "Testing resistance",
      detail: `${formatPrice(resistance.price)} is ${resistanceDistance.toFixed(2)}% above`,
      tone: "amber",
      level: resistance.price,
      distancePct: resistanceDistance,
      isActive: false,
    };
  }

  if (support && supportDistance != null && supportDistance <= proximityPct) {
    return {
      type: "near-support",
      label: "Near support",
      detail: `${formatPrice(support.price)} is ${supportDistance.toFixed(2)}% below`,
      tone: "amber",
      level: support.price,
      distancePct: supportDistance,
      isActive: false,
    };
  }

  return {
    type: "none",
    label: "Range wait",
    detail: resistance
      ? `Next trigger ${formatPrice(resistance.price)}`
      : support
        ? `Watch ${formatPrice(support.price)}`
        : "No nearby trigger",
    tone: "neutral",
    level: resistance?.price ?? support?.price ?? null,
    distancePct: resistanceDistance ?? supportDistance,
    isActive: false,
  };
}

export function buildTradePlan({
  candles,
  interval,
  levels,
  fundingAPR,
  fundingPercentile,
}: {
  candles: LevelCandle[];
  interval: ChartInterval;
  levels: SupportResistanceLevel[];
  fundingAPR?: number | null;
  fundingPercentile?: number | null;
}): TradePlan {
  const sorted = [...candles].sort((a, b) => normalizeTimestamp(a.time) - normalizeTimestamp(b.time));
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  if (!latest || !previous || levels.length === 0) {
    return {
      bias: "wait",
      title: "No clean setup yet",
      summary: "HyperPulse needs more candles or cleaner structure levels before generating a useful plan.",
      trigger: "Wait for support/resistance to populate.",
      invalidation: "n/a",
      targets: [],
      confidence: "low",
      context: ["This is decision support, not an automated trading signal."],
    };
  }

  const currentPrice = latest.close;
  const atr = averageTrueRange(sorted);
  const support = nearestLevel(levels, "support", currentPrice);
  const resistance = nearestLevel(levels, "resistance", currentPrice);
  const supportDistance = support ? ((currentPrice - support.price) / currentPrice) * 100 : null;
  const resistanceDistance = resistance ? ((resistance.price - currentPrice) / currentPrice) * 100 : null;
  const cheapFunding = fundingAPR != null && fundingAPR < -8;
  const richFunding = fundingAPR != null && fundingAPR > 8;
  const supportReclaim =
    support != null &&
    latest.low <= support.price + atr * 0.35 &&
    latest.close > support.price + atr * 0.12 &&
    latest.close > previous.close;
  const breakout =
    resistance != null &&
    previous.close <= resistance.price &&
    latest.close > resistance.price + atr * 0.12;
  const rejectedResistance =
    resistance != null &&
    latest.high >= resistance.price - atr * 0.25 &&
    latest.close < resistance.price &&
    latest.close < previous.close;

  const fundingNote = fundingContext(fundingAPR, fundingPercentile);
  const context = [
    support ? `Nearest support: ${formatPrice(support.price)} (${supportDistance?.toFixed(2)}% below).` : "No nearby support detected.",
    resistance ? `Nearest resistance: ${formatPrice(resistance.price)} (${resistanceDistance?.toFixed(2)}% above).` : "No nearby resistance detected.",
    fundingNote,
    "Use the trigger first; do not enter just because a level exists.",
  ].filter((item): item is string => Boolean(item));

  if (supportReclaim && support) {
    const firstTarget = resistance?.price ?? currentPrice + atr * 2.5;
    const secondTarget = nextResistance(levels, firstTarget, resistance?.price)?.price ?? firstTarget + atr * 2.5;
    return {
      bias: "long-setup",
      title: "Support reclaim long setup",
      summary: `Price swept or tagged support near ${formatPrice(support.price)} and reclaimed. This is the cleanest long pattern HyperPulse sees right now.`,
      trigger: `Long only while price holds above ${formatPrice(support.price)} after a reclaim close on ${interval}.`,
      invalidation: `Close back below ${formatPrice(support.price - Math.max(atr * 0.35, support.price * 0.0015))}.`,
      targets: [formatPrice(firstTarget), formatPrice(secondTarget)],
      confidence: cheapFunding ? "high" : richFunding ? "low" : "medium",
      context,
    };
  }

  if (breakout && resistance) {
    const nextTarget = nextResistance(levels, currentPrice, resistance.price)?.price ?? currentPrice + atr * 3;
    return {
      bias: "long-setup",
      title: "Breakout-and-hold long setup",
      summary: `Price broke above resistance near ${formatPrice(resistance.price)}. The better entry is usually a hold or retest, not chasing the first candle.`,
      trigger: `Long a retest/hold of ${formatPrice(resistance.price)} after breakout confirmation.`,
      invalidation: `Close back below ${formatPrice(resistance.price - Math.max(atr * 0.3, resistance.price * 0.0012))}.`,
      targets: [formatPrice(nextTarget)],
      confidence: richFunding ? "low" : "medium",
      context,
    };
  }

  if (rejectedResistance && resistance) {
    const firstTarget = support?.price ?? currentPrice - atr * 2;
    const secondTarget = nextSupport(levels, firstTarget, support?.price)?.price ?? firstTarget - atr * 2.5;
    return {
      bias: "short-setup",
      title: "Resistance rejection short setup",
      summary: `Price rejected resistance near ${formatPrice(resistance.price)}. This favors patience on longs until the level is reclaimed.`,
      trigger: `Short bias only while price stays below ${formatPrice(resistance.price)}.`,
      invalidation: `Close above ${formatPrice(resistance.price + Math.max(atr * 0.35, resistance.price * 0.0015))}.`,
      targets: [formatPrice(firstTarget), formatPrice(secondTarget)],
      confidence: richFunding ? "medium" : "low",
      context,
    };
  }

  const noTradeReason =
    supportDistance != null && resistanceDistance != null
      ? `Price is between support and resistance; R/R is cleaner near ${formatPrice(support?.price)} or after ${formatPrice(resistance?.price)} breaks.`
      : "Price is not interacting with a clean level yet.";

  return {
    bias: "wait",
    title: "Wait for level interaction",
    summary: noTradeReason,
    trigger: resistance
      ? `Long trigger: reclaim/break and hold above ${formatPrice(resistance.price)}.`
      : support
        ? `Long trigger: sweep and reclaim ${formatPrice(support.price)}.`
        : "Wait for a new confirmed support/resistance level.",
    invalidation: support
      ? `If longing support, invalidate below ${formatPrice(support.price - Math.max(atr * 0.35, support.price * 0.0015))}.`
      : "n/a",
    targets: resistance ? [formatPrice(resistance.price)] : [],
    confidence: "low",
    context,
  };
}
