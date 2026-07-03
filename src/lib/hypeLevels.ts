import type { HypeFundamentalsContext } from "@/lib/hypeFundamentals";

export type HypeLevelRole = "trigger" | "target" | "support" | "invalid" | "risk";

export type HypeTradeLevel = {
  label: string;
  price: number;
  role: HypeLevelRole;
  probability: number;
  grade: "A" | "B" | "C";
  distancePct: number;
  action: string;
  note: string;
  source?: string;
  timeframe?: string;
  evidence?: string[];
};

export type HypeLevelPlan = {
  bias: string;
  plan: string;
  risk: string;
  levels: HypeTradeLevel[];
  source?: "fallback_mark_formula" | "researched_market_structure";
  generatedAt?: number;
  evidence?: string[];
};

export type HypeResearchLevel = {
  price: number;
  kind: "support" | "resistance";
  label: string;
  source: string;
  timeframe: "15m" | "1h" | "4h" | "1d" | "volume";
  confidence?: "low" | "medium" | "high";
  strength?: number;
  touches?: number;
  distancePct?: number;
  reason?: string;
  evidence?: string[];
};

function roundLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) return Number(value.toFixed(1));
  return Number(value.toFixed(2));
}

export function formatHypeLevelPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distancePct(mark: number, price: number): number {
  if (!Number.isFinite(mark) || mark <= 0 || !Number.isFinite(price)) return 0;
  return ((price - mark) / mark) * 100;
}

function levelProbability(args: {
  role: HypeLevelRole;
  distancePct: number;
  breakoutBias: boolean;
  supportBias: boolean;
  fadeBias: boolean;
  oiExpanding: boolean;
  fundingHot: boolean;
}) {
  const distance = Math.abs(args.distancePct);
  const base =
    args.role === "trigger"
      ? 63
      : args.role === "support"
        ? 59
        : args.role === "invalid"
          ? 68
          : args.role === "risk"
            ? 48
            : 54;
  const biasBoost =
    args.role === "trigger" && args.breakoutBias
      ? 9
      : args.role === "support" && args.supportBias
        ? 8
        : args.role === "target" && args.breakoutBias
          ? 7
          : args.role === "invalid" && args.fadeBias
            ? 5
            : 0;
  const flowBoost = args.oiExpanding && (args.role === "trigger" || args.role === "target") ? 5 : 0;
  const fundingPenalty = args.fundingHot && args.role === "target" ? -7 : args.fundingHot && args.role === "invalid" ? 4 : 0;
  const distancePenalty = distance > 9 ? -10 : distance > 6 ? -6 : distance < 0.4 ? -4 : 0;
  return clamp(Math.round(base + biasBoost + flowBoost + fundingPenalty + distancePenalty), 35, 82);
}

function probabilityGrade(probability: number): "A" | "B" | "C" {
  if (probability >= 68) return "A";
  if (probability >= 56) return "B";
  return "C";
}

function researchScore(level: HypeResearchLevel, mark: number): number {
  const distance = Math.abs(distancePct(mark, level.price));
  const confidenceScore = level.confidence === "high" ? 12 : level.confidence === "medium" ? 7 : 3;
  const timeframeScore =
    level.timeframe === "4h" || level.timeframe === "1d"
      ? 9
      : level.timeframe === "1h"
        ? 7
        : level.timeframe === "15m"
          ? 5
          : 4;
  const touchScore = Math.min(level.touches ?? 1, 4) * 1.5;
  const strengthScore = Math.min(level.strength ?? 1, 12);
  const proximityScore = Math.max(0, 10 - distance);
  return confidenceScore + timeframeScore + touchScore + strengthScore + proximityScore;
}

function dedupeResearchLevels(levels: HypeResearchLevel[], mark: number): HypeResearchLevel[] {
  const sorted = levels
    .filter((level) => Number.isFinite(level.price) && level.price > 0)
    .map((level) => ({ ...level, distancePct: distancePct(mark, level.price) }))
    .sort((a, b) => researchScore(b, mark) - researchScore(a, mark));
  const selected: HypeResearchLevel[] = [];
  const tolerancePct = 0.38;

  for (const level of sorted) {
    const duplicate = selected.find(
      (existing) =>
        existing.kind === level.kind &&
        Math.abs(distancePct(existing.price, level.price)) <= tolerancePct,
    );
    if (duplicate) {
      duplicate.evidence = [...(duplicate.evidence ?? []), ...(level.evidence ?? [level.reason].filter(Boolean) as string[])].slice(0, 4);
      duplicate.touches = Math.max(duplicate.touches ?? 1, level.touches ?? 1);
      duplicate.strength = Math.max(duplicate.strength ?? 1, level.strength ?? 1);
      if (duplicate.confidence !== "high" && level.confidence === "high") duplicate.confidence = "high";
      else if (duplicate.confidence === "low" && level.confidence === "medium") duplicate.confidence = "medium";
      continue;
    }
    selected.push(level);
  }

  return selected;
}

function pickLevel(
  levels: HypeResearchLevel[],
  kind: "support" | "resistance",
  mark: number,
  options: { minDistancePct?: number; maxDistancePct?: number; abovePrice?: number; belowPrice?: number } = {},
): HypeResearchLevel | null {
  const minDistancePct = options.minDistancePct ?? 0.15;
  const maxDistancePct = options.maxDistancePct ?? 14;
  return (
    levels
      .filter((level) => {
        if (level.kind !== kind) return false;
        const dist = distancePct(mark, level.price);
        if (kind === "support" && dist >= -minDistancePct) return false;
        if (kind === "resistance" && dist <= minDistancePct) return false;
        if (Math.abs(dist) > maxDistancePct) return false;
        if (options.abovePrice != null && level.price <= options.abovePrice) return false;
        if (options.belowPrice != null && level.price >= options.belowPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const aDistance = Math.abs(distancePct(mark, a.price));
        const bDistance = Math.abs(distancePct(mark, b.price));
        const aScore = researchScore(a, mark) / Math.max(aDistance, 0.35);
        const bScore = researchScore(b, mark) / Math.max(bDistance, 0.35);
        return bScore - aScore;
      })[0] ?? null
  );
}

function researchedProbability(args: {
  level: HypeResearchLevel;
  role: HypeLevelRole;
  mark: number;
  breakoutBias: boolean;
  supportBias: boolean;
  fadeBias: boolean;
  oiExpanding: boolean;
  fundingHot: boolean;
}) {
  const dist = distancePct(args.mark, args.level.price);
  const confidenceBoost = args.level.confidence === "high" ? 8 : args.level.confidence === "medium" ? 4 : 0;
  const timeframeBoost =
    args.level.timeframe === "4h" || args.level.timeframe === "1d"
      ? 5
      : args.level.timeframe === "1h"
        ? 3
        : 0;
  const roleBias =
    args.role === "trigger" && args.breakoutBias
      ? 6
      : args.role === "support" && args.supportBias
        ? 6
        : args.role === "invalid" && args.fadeBias
          ? 5
          : 0;
  const base = levelProbability({
    role: args.role,
    distancePct: dist,
    breakoutBias: args.breakoutBias,
    supportBias: args.supportBias,
    fadeBias: args.fadeBias,
    oiExpanding: args.oiExpanding,
    fundingHot: args.fundingHot,
  });
  return clamp(base + confidenceBoost + timeframeBoost + roleBias, 42, 88);
}

function toTradeLevel(args: {
  source: HypeResearchLevel;
  mark: number;
  role: HypeLevelRole;
  label: string;
  action: string;
  note: string;
  breakoutBias: boolean;
  supportBias: boolean;
  fadeBias: boolean;
  oiExpanding: boolean;
  fundingHot: boolean;
}): HypeTradeLevel {
  const probability = researchedProbability({
    level: args.source,
    role: args.role,
    mark: args.mark,
    breakoutBias: args.breakoutBias,
    supportBias: args.supportBias,
    fadeBias: args.fadeBias,
    oiExpanding: args.oiExpanding,
    fundingHot: args.fundingHot,
  });
  return {
    label: args.label,
    price: roundLevel(args.source.price),
    role: args.role,
    probability,
    grade: probabilityGrade(probability),
    distancePct: distancePct(args.mark, args.source.price),
    action: args.action,
    note: args.note,
    source: args.source.source,
    timeframe: args.source.timeframe,
    evidence: args.source.evidence ?? [args.source.reason].filter(Boolean) as string[],
  };
}

function deriveResearchedHypeLevelPlan(args: {
  mark: number;
  priceChange24h: number | null;
  oiChangePct: number | null;
  fundingApr: number | null;
  levelBias?: HypeFundamentalsContext["levelBias"];
  researchedLevels: HypeResearchLevel[];
  allTimeHigh?: number | null;
  generatedAt?: number;
}): HypeLevelPlan | null {
  const levels = dedupeResearchLevels(args.researchedLevels, args.mark);
  if (levels.length === 0) return null;

  const momentumUp = (args.priceChange24h ?? 0) > 0.4;
  const oiExpanding = (args.oiChangePct ?? 0) > 1;
  const fundingHot = Math.abs(args.fundingApr ?? 0) >= 20;
  const breakoutBias = args.levelBias === "breakout_confirm" || (momentumUp && oiExpanding);
  const supportBias = args.levelBias === "support_bid";
  const fadeBias = args.levelBias === "resistance_fade" || args.levelBias === "mean_revert";

  const trigger = pickLevel(levels, "resistance", args.mark, { maxDistancePct: 10 });
  const targetOne = trigger
    ? pickLevel(levels, "resistance", args.mark, { abovePrice: trigger.price * 1.004, maxDistancePct: 12 })
    : null;
  const targetTwo = targetOne
    ? pickLevel(levels, "resistance", args.mark, { abovePrice: targetOne.price * 1.006, maxDistancePct: 15 })
    : null;
  const support = pickLevel(levels, "support", args.mark, { maxDistancePct: 10 });
  const invalid = support
    ? pickLevel(levels, "support", args.mark, { belowPrice: support.price * 0.996, maxDistancePct: 14 }) ?? support
    : null;

  const ath =
    args.allTimeHigh != null && Number.isFinite(args.allTimeHigh) && args.allTimeHigh > args.mark * 1.01
      ? {
          price: args.allTimeHigh,
          kind: "resistance" as const,
          label: "ATH supply",
          source: "historical_high",
          timeframe: "1d" as const,
          confidence: "high" as const,
          strength: 10,
          touches: 1,
          reason: "Highest HYPE candle high in the fetched Hyperliquid history.",
          evidence: ["All-time high / price-discovery boundary"],
        }
      : null;

  const tradeLevels: HypeTradeLevel[] = [];
  if (trigger) {
    tradeLevels.push(toTradeLevel({
      source: trigger,
      mark: args.mark,
      role: "trigger",
      label: "Breakout trigger",
      action: "Trade only on acceptance",
      note: `Needs acceptance above ${formatHypeLevelPrice(trigger.price)}. No front-run.`,
      breakoutBias,
      supportBias,
      fadeBias,
      oiExpanding,
      fundingHot,
    }));
  }
  if (targetOne) {
    tradeLevels.push(toTradeLevel({
      source: targetOne,
      mark: args.mark,
      role: "target",
      label: "TP1 / supply",
      action: "First trim zone",
      note: "First researched overhead reaction level.",
      breakoutBias,
      supportBias,
      fadeBias,
      oiExpanding,
      fundingHot,
    }));
  }
  if (targetTwo ?? ath) {
    const source = targetTwo ?? ath!;
    tradeLevels.push(toTradeLevel({
      source,
      mark: args.mark,
      role: "target",
      label: source.source === "historical_high" ? "ATH / price discovery" : "TP2 / supply",
      action: "Trim or trail",
      note: source.source === "historical_high" ? "Into ATH, unload strength or trail hard." : "Second researched overhead reaction level.",
      breakoutBias,
      supportBias,
      fadeBias,
      oiExpanding,
      fundingHot,
    }));
  }
  if (support) {
    tradeLevels.push(toTradeLevel({
      source: support,
      mark: args.mark,
      role: "support",
      label: "Support to defend",
      action: "Buy defense only",
      note: `Bulls need ${formatHypeLevelPrice(support.price)} to hold on pullbacks.`,
      breakoutBias,
      supportBias,
      fadeBias,
      oiExpanding,
      fundingHot,
    }));
  }
  if (invalid) {
    const invalidSource =
      invalid === support
        ? {
            ...invalid,
            price: invalid.price - Math.max(args.mark * 0.012, 0.45),
            label: "Invalidation buffer",
            source: `${invalid.source}_buffer`,
            reason: "Buffer below the nearest researched support.",
          }
        : invalid;
    tradeLevels.push(toTradeLevel({
      source: invalidSource,
      mark: args.mark,
      role: "invalid",
      label: "Hard invalidation",
      action: "Exit, no adding",
      note: "If price accepts below this, the long thesis is wrong for now.",
      breakoutBias,
      supportBias,
      fadeBias,
      oiExpanding,
      fundingHot,
    }));
  }

  if (tradeLevels.length === 0) return null;

  const triggerText = trigger ? formatHypeLevelPrice(trigger.price) : "the next resistance";
  const supportText = support ? formatHypeLevelPrice(support.price) : "nearest support";
  const targetText = (targetOne ?? targetTwo ?? ath) ? formatHypeLevelPrice((targetOne ?? targetTwo ?? ath)!.price) : "the next supply level";
  const bias = breakoutBias
    ? "HYPE is bid, but the trigger still has to break"
    : fadeBias
      ? "HYPE is extended into researched supply"
      : supportBias
        ? "HYPE pullbacks matter more than chasing"
        : "HYPE is level-to-level here";

  return {
    bias,
    plan: `Use ${triggerText} as the go/no-go. Above it, trade toward ${targetText}. If it rejects, wait for ${supportText}.`,
    risk: invalid
      ? `Do not add below ${formatHypeLevelPrice(tradeLevels.find((level) => level.role === "invalid")?.price)}. That is where the setup is wrong.`
      : "No clean invalidation from current structure. Size down or wait.",
    levels: tradeLevels,
    source: "researched_market_structure",
    generatedAt: args.generatedAt,
    evidence: levels.slice(0, 5).map((level) => `${level.timeframe} ${level.kind} ${formatHypeLevelPrice(level.price)}: ${level.reason ?? level.label}`),
  };
}

export function deriveHypeLevelPlan(args: {
  mark: number | null;
  priceChange24h: number | null;
  oiChangePct: number | null;
  fundingApr: number | null;
  levelBias?: HypeFundamentalsContext["levelBias"];
  researchedLevels?: HypeResearchLevel[];
  allTimeHigh?: number | null;
  generatedAt?: number;
}): HypeLevelPlan {
  const mark = args.mark && Number.isFinite(args.mark) && args.mark > 0 ? args.mark : 64;
  const researched = args.researchedLevels?.length
    ? deriveResearchedHypeLevelPlan({
        mark,
        priceChange24h: args.priceChange24h,
        oiChangePct: args.oiChangePct,
        fundingApr: args.fundingApr,
        levelBias: args.levelBias,
        researchedLevels: args.researchedLevels,
        allTimeHigh: args.allTimeHigh,
        generatedAt: args.generatedAt,
      })
    : null;
  if (researched) return researched;

  const momentumUp = (args.priceChange24h ?? 0) > 0.4;
  const oiExpanding = (args.oiChangePct ?? 0) > 1;
  const fundingHot = Math.abs(args.fundingApr ?? 0) >= 20;
  const breakoutBias = args.levelBias === "breakout_confirm" || (momentumUp && oiExpanding);
  const supportBias = args.levelBias === "support_bid";
  const fadeBias = args.levelBias === "resistance_fade" || args.levelBias === "mean_revert";

  const reclaim = roundLevel(mark * 1.012);
  const breakout = roundLevel(mark * 1.035);
  const target = roundLevel(mark * 1.065);
  const stretch = Math.max(roundLevel(mark * 1.105), 77);
  const support = roundLevel(mark * 0.978);
  const invalid = roundLevel(mark * 0.955);
  const flush = roundLevel(mark * 0.925);

  const bias = breakoutBias
    ? "Breakout bias, but only above reclaim"
    : supportBias
      ? "Support bid if the low holds"
      : fadeBias
        ? "Fade rallies until reclaim"
        : "Range trade until a level breaks";

  const plan = breakoutBias
    ? `Long only after ${formatHypeLevelPrice(reclaim)} reclaims and holds. First target ${formatHypeLevelPrice(breakout)}, then ${formatHypeLevelPrice(target)}.`
    : supportBias
      ? `Buy defense near ${formatHypeLevelPrice(support)} only if price rejects lower. No defense, no long.`
      : fadeBias
        ? `Avoid chasing. Failed reclaim near ${formatHypeLevelPrice(reclaim)} is the short-term fade area.`
        : `Let HYPE choose. Long above ${formatHypeLevelPrice(reclaim)}; defensive below ${formatHypeLevelPrice(support)}.`;

  const risk = fundingHot
    ? `Funding is stretched. Keep size smaller and do not add if ${formatHypeLevelPrice(invalid)} breaks.`
    : `Hard invalidation sits near ${formatHypeLevelPrice(invalid)}. Below that, wait for ${formatHypeLevelPrice(flush)} or a fresh reclaim.`;
  const levelInputs = [
    { label: "Reclaim trigger", price: reclaim, role: "trigger" as const, action: "Trade only on acceptance", note: "Longs need acceptance above this." },
    { label: "Breakout target", price: breakout, role: "target" as const, action: "First checkpoint", note: "First upside checkpoint." },
    { label: "Profit zone", price: target, role: "target" as const, action: "Trim or trail", note: "Trim if momentum stalls here." },
    { label: "ATH / price discovery", price: stretch, role: "target" as const, action: "Unload into strength", note: "Unload or trail if flow cools." },
    { label: "Support to defend", price: support, role: "support" as const, action: "Buy defense only", note: "Lose this and longs are on defense." },
    { label: "Hard invalidation", price: invalid, role: "invalid" as const, action: "Exit, no adding", note: "No adding below this line." },
    { label: "Flush watch", price: flush, role: "risk" as const, action: "Wait for exhaustion", note: "Next area to look for forced selling to exhaust." },
  ];

  return {
    bias,
    plan,
    risk,
    source: "fallback_mark_formula",
    generatedAt: args.generatedAt,
    levels: levelInputs.map((level) => {
      const dist = distancePct(mark, level.price);
      const probability = levelProbability({
        role: level.role,
        distancePct: dist,
        breakoutBias,
        supportBias,
        fadeBias,
        oiExpanding,
        fundingHot,
      });
      return {
        ...level,
        distancePct: dist,
        probability,
        grade: probabilityGrade(probability),
      };
    }),
  };
}
