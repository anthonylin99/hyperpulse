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
};

export type HypeLevelPlan = {
  bias: string;
  plan: string;
  risk: string;
  levels: HypeTradeLevel[];
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

export function deriveHypeLevelPlan(args: {
  mark: number | null;
  priceChange24h: number | null;
  oiChangePct: number | null;
  fundingApr: number | null;
  levelBias?: HypeFundamentalsContext["levelBias"];
}): HypeLevelPlan {
  const mark = args.mark && Number.isFinite(args.mark) && args.mark > 0 ? args.mark : 64;
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
