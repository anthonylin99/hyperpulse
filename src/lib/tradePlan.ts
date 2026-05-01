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

const MIN_ACTIONABLE_REWARD_PCT = 0.9;
const MIN_ACTIONABLE_RR = 1.3;

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

function minRewardPct(currentPrice: number, atr: number): number {
  const atrPct = currentPrice > 0 && atr > 0 ? (atr / currentPrice) * 100 : 0;
  return Math.max(MIN_ACTIONABLE_REWARD_PCT, atrPct * 1.35);
}

function riskBuffer(price: number, atr: number): number {
  return Math.max(atr * 0.75, price * 0.0035);
}

function hasCleanRewardRisk(args: {
  direction: "long" | "short";
  entry: number;
  target: number | null | undefined;
  stop: number | null | undefined;
  minRewardPct: number;
}): boolean {
  const { direction, entry, target, stop, minRewardPct: minimumRewardPct } = args;
  if (entry <= 0 || target == null || stop == null) return false;
  if (!Number.isFinite(entry) || !Number.isFinite(target) || !Number.isFinite(stop)) return false;

  const reward = direction === "long" ? target - entry : entry - target;
  const risk = direction === "long" ? entry - stop : stop - entry;
  if (reward <= 0 || risk <= 0) return false;

  const rewardPct = (reward / entry) * 100;
  if (rewardPct < minimumRewardPct) return false;
  return reward / risk >= MIN_ACTIONABLE_RR;
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
    return "Funding is negative/cheap, so shorts may be crowded. Upside squeezes still need price confirmation.";
  }
  if (fundingAPR > 8 || (fundingPercentile != null && fundingPercentile >= 80)) {
    return "Funding is elevated, so longs may be crowded. Downside flow can accelerate if mark breaks lower.";
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
  const minimumRewardPct = minRewardPct(currentPrice, atr);
  const proximityPct = 0.55;
  const resistanceTarget = resistance ? nextResistance(levels, resistance.price, resistance.price)?.price ?? currentPrice + atr * 2.5 : null;
  const supportTarget = support ? nextSupport(levels, support.price, support.price)?.price ?? currentPrice - atr * 2.5 : null;

  const resistanceBreak =
    resistance != null &&
    previous.close <= resistance.price &&
    latest.close > resistance.price + breakBuffer;
  if (
    resistanceBreak &&
    resistance &&
    hasCleanRewardRisk({
      direction: "long",
      entry: currentPrice,
      target: resistanceTarget,
      stop: resistance.price - riskBuffer(resistance.price, atr),
      minRewardPct: minimumRewardPct,
    })
  ) {
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
  if (
    supportReclaim &&
    support &&
    hasCleanRewardRisk({
      direction: "long",
      entry: currentPrice,
      target: resistance?.price,
      stop: support.price - riskBuffer(support.price, atr),
      minRewardPct: minimumRewardPct,
    })
  ) {
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
  if (
    supportBreak &&
    support &&
    hasCleanRewardRisk({
      direction: "short",
      entry: currentPrice,
      target: supportTarget,
      stop: support.price + riskBuffer(support.price, atr),
      minRewardPct: minimumRewardPct,
    })
  ) {
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
    label:
      support &&
      resistance &&
      resistanceDistance != null &&
      supportDistance != null &&
      resistanceDistance + supportDistance < minimumRewardPct
        ? "Range too tight"
        : "Range wait",
    detail: resistance
      ? `Need clean hold above ${formatPrice(resistance.price)}`
      : support
        ? `Need sweep/reclaim near ${formatPrice(support.price)}`
        : "No nearby confirmation",
    tone: "neutral",
    level: null,
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
  const lfxMode =
    levels.length === 0 ||
    levels.every((level) => level.source === "leverage_liquidation" || level.pressureSource === "market_inferred");
  const lowerLevelName = lfxMode ? "downside flow zone" : "support";
  const upperLevelName = lfxMode ? "upside flow zone" : "resistance";

  if (!latest || !previous || levels.length === 0) {
    return {
      bias: "wait",
      title: "No clean setup yet",
      summary: lfxMode
        ? "HyperPulse needs more candles or cleaner LFX zones before generating a useful plan."
        : "HyperPulse needs more candles or cleaner structure levels before generating a useful plan.",
      trigger: lfxMode ? "Wait for LFX map to populate." : "Wait for support/resistance to populate.",
      invalidation: "n/a",
      targets: [],
      confidence: "low",
      context: [lfxMode ? "This is a decision aid, not an automated trading signal." : "This is decision support, not an automated trading signal."],
    };
  }

  const currentPrice = latest.close;
  const atr = averageTrueRange(sorted);
  const support = nearestLevel(levels, "support", currentPrice);
  const resistance = nearestLevel(levels, "resistance", currentPrice);
  const supportDistance = support ? ((currentPrice - support.price) / currentPrice) * 100 : null;
  const resistanceDistance = resistance ? ((resistance.price - currentPrice) / currentPrice) * 100 : null;
  const minimumRewardPct = minRewardPct(currentPrice, atr);
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
    support
      ? `Nearest ${lowerLevelName}: ${formatPrice(support.price)} (${supportDistance?.toFixed(2)}% below).`
      : `No nearby ${lowerLevelName} detected.`,
    resistance
      ? `Nearest ${upperLevelName}: ${formatPrice(resistance.price)} (${resistanceDistance?.toFixed(2)}% above).`
      : `No nearby ${upperLevelName} detected.`,
    fundingNote,
    "Use confirmation first; do not enter just because a level exists.",
  ].filter((item): item is string => Boolean(item));

  if (
    supportReclaim &&
    support &&
    hasCleanRewardRisk({
      direction: "long",
      entry: currentPrice,
      target: resistance?.price,
      stop: support.price - riskBuffer(support.price, atr),
      minRewardPct: minimumRewardPct,
    })
  ) {
    const firstTarget = resistance?.price ?? currentPrice + atr * 2.5;
    const secondTarget = nextResistance(levels, firstTarget, resistance?.price)?.price ?? firstTarget + atr * 2.5;
    return {
      bias: "long-setup",
      title: lfxMode ? "Downside flow reclaim" : "Support reclaim long setup",
      summary: `Price swept or tagged ${lowerLevelName} near ${formatPrice(support.price)} and reclaimed. This is the cleanest long pattern HyperPulse sees right now.`,
      trigger: `Long only while price holds above ${formatPrice(support.price)} after a reclaim close on ${interval}.`,
      invalidation: `Close back below ${formatPrice(support.price - riskBuffer(support.price, atr))}.`,
      targets: [formatPrice(firstTarget), formatPrice(secondTarget)],
      confidence: cheapFunding ? "high" : richFunding ? "low" : "medium",
      context,
    };
  }

  if (breakout && resistance) {
    const nextTarget = nextResistance(levels, currentPrice, resistance.price)?.price ?? currentPrice + atr * 3;
    const breakoutStop = resistance.price - riskBuffer(resistance.price, atr);
    if (
      !hasCleanRewardRisk({
        direction: "long",
        entry: currentPrice,
        target: nextTarget,
        stop: breakoutStop,
        minRewardPct: minimumRewardPct,
      })
    ) {
      return {
        bias: "wait",
        title: "Breakout target too close",
        summary: `Price cleared ${formatPrice(resistance.price)}, but the next target is not far enough to justify the risk buffer.`,
        trigger: `Wait for a retest to improve R/R or a cleaner target above ${formatPrice(nextTarget)}.`,
        invalidation: "Defined after confirmation.",
        targets: [],
        confidence: "low",
        context,
      };
    }
    return {
      bias: "long-setup",
      title: lfxMode ? "Upside flow break-and-hold" : "Breakout-and-hold long setup",
      summary: `Price broke above ${upperLevelName} near ${formatPrice(resistance.price)}. The better entry is usually a hold or retest, not chasing the first candle.`,
      trigger: `Long a retest/hold of ${formatPrice(resistance.price)} after breakout confirmation.`,
      invalidation: `Close back below ${formatPrice(breakoutStop)}.`,
      targets: [formatPrice(nextTarget)],
      confidence: richFunding ? "low" : "medium",
      context,
    };
  }

  if (
    rejectedResistance &&
    resistance &&
    hasCleanRewardRisk({
      direction: "short",
      entry: currentPrice,
      target: support?.price,
      stop: resistance.price + riskBuffer(resistance.price, atr),
      minRewardPct: minimumRewardPct,
    })
  ) {
    const firstTarget = support?.price ?? currentPrice - atr * 2;
    const secondTarget = nextSupport(levels, firstTarget, support?.price)?.price ?? firstTarget - atr * 2.5;
    return {
      bias: "short-setup",
      title: lfxMode ? "Upside flow rejection" : "Resistance rejection short setup",
      summary: `Price rejected ${upperLevelName} near ${formatPrice(resistance.price)}. This favors patience on longs until the level is reclaimed.`,
      trigger: `Short bias only while price stays below ${formatPrice(resistance.price)}.`,
      invalidation: `Close above ${formatPrice(resistance.price + riskBuffer(resistance.price, atr))}.`,
      targets: [formatPrice(firstTarget), formatPrice(secondTarget)],
      confidence: richFunding ? "medium" : "low",
      context,
    };
  }

  const rangePct =
    supportDistance != null && resistanceDistance != null
      ? supportDistance + resistanceDistance
      : null;
  const noTradeReason =
    rangePct != null && rangePct < minimumRewardPct
      ? lfxMode
        ? `Nearest LFX zones are only ${rangePct.toFixed(2)}% apart, so the setup is too tight for a useful risk/reward plan.`
        : `Nearest support/resistance are only ${rangePct.toFixed(2)}% apart, so the setup is too tight for a useful risk/reward plan.`
      : supportDistance != null && resistanceDistance != null
        ? lfxMode
          ? `Price is between LFX zones; R/R is cleaner near ${formatPrice(support?.price)} or after ${formatPrice(resistance?.price)} breaks.`
          : `Price is between support and resistance; R/R is cleaner near ${formatPrice(support?.price)} or after ${formatPrice(resistance?.price)} breaks.`
        : "Price is not interacting with a clean level yet.";

  return {
    bias: "wait",
    title: "No trade yet",
    summary: noTradeReason,
    trigger: resistance
      ? `Watch reclaim or break-and-hold above ${formatPrice(resistance.price)}.`
      : support
        ? `Watch sweep and reclaim near ${formatPrice(support.price)}.`
        : lfxMode
          ? "Wait for a new LFX zone."
          : "Wait for a new confirmed support/resistance level.",
    invalidation: support
      ? lfxMode
        ? `If taking the reclaim, invalidate below ${formatPrice(support.price - Math.max(atr * 0.35, support.price * 0.0015))}.`
        : `If longing support, invalidate below ${formatPrice(support.price - Math.max(atr * 0.35, support.price * 0.0015))}.`
      : "n/a",
    targets: resistance ? [formatPrice(resistance.price)] : [],
    confidence: "low",
    context,
  };
}
