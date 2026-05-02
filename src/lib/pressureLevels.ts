import type {
  PressureConfidence,
  PressureCoverage,
  PressureFlowSide,
  PressureLevel,
  PressureLevelSide,
  PressurePayload,
  PressureZoneType,
  SupportResistanceLevel,
} from "@/types";
import type { MarketSetupSignal } from "@/lib/tradePlan";

export const LFX_MAJOR_COINS = ["BTC", "ETH", "SOL", "HYPE"] as const;

const LFX_MAJOR_SET = new Set<string>(LFX_MAJOR_COINS);
const DEFAULT_MAX_LEVELS = 8;
const MARKET_ONLY_COVERAGE: PressureCoverage = "market_only";
const LFX_TIER_WEIGHTS = [0.38, 0.27, 0.2, 0.15];
const LOCAL_PROJECTION_TIER_WEIGHTS = [0.6, 0.4];
const LOCAL_PROJECTION_MIN_FLOW_SHARE = 0.18;
const LOCAL_PROJECTION_MIN_CANDIDATES = 5;
const LOCAL_PROJECTION_MIN_SCORE = 38;
const LOCAL_PROJECTION_STRONG_SHARE = 0.3;
const LOCAL_PROJECTION_STRONG_SCORE = 32;

type MarketPressureArgs = Pick<
  PressurePayload["market"],
  "fundingAPR" | "openInterestUsd" | "maxLeverage" | "topBookImbalancePct"
>;

type BookLevel = {
  px?: string | number;
  sz?: string | number;
};

export type LfxBookDepth = {
  bids?: BookLevel[] | null;
  asks?: BookLevel[] | null;
};

type MarketInferredLfxArgs = MarketPressureArgs & {
  coin: string;
  currentPrice: number;
  atrPct?: number | null;
  book?: LfxBookDepth | null;
  maxLevels?: number;
};

export type LfxProjectionCandle = {
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type LocalProjectedLfxArgs = MarketPressureArgs & {
  coin: string;
  currentPrice: number;
  candles: LfxProjectionCandle[];
  atrPct?: number | null;
  book?: LfxBookDepth | null;
  maxLevels?: number;
};

type LocalProjectionBucket = {
  side: PressureLevelSide;
  price: number;
  weight: number;
  weightedLeverageTotal: number;
  entryLow: number;
  entryHigh: number;
  candidateCount: number;
  candleKeys: Set<string>;
};

type LocalProjectedPressureLevel = PressureLevel & {
  localFlowShare: number;
  localCandidateCount: number;
  localCandleCount: number;
};

function isPositiveFinite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundPrice(value: number): number {
  if (value >= 1000) return Number(value.toFixed(1));
  if (value >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(8));
}

function formatLevelPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value >= 100
    ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function compactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function formatSignedDistance(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function comparePressureLevels(a: PressureLevel, b: PressureLevel): number {
  const scoreDelta = b.lfxScore - a.lfxScore;
  if (scoreDelta !== 0) return scoreDelta;
  return Math.abs(a.distancePct) - Math.abs(b.distancePct);
}

function isActionableLevel(level: PressureLevel, currentPrice?: number | null): boolean {
  if (!Number.isFinite(level.price) || level.price <= 0) return false;
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return level.side === "short_liq" ? level.distancePct > 0 : level.distancePct < 0;
  }
  if (level.side === "short_liq") return level.price > currentPrice;
  return level.price < currentPrice;
}

export function isLfxMajorCoin(coin: string | null | undefined): boolean {
  return Boolean(coin && LFX_MAJOR_SET.has(coin.toUpperCase()));
}

function buildLeverageTiers(maxLeverage: number | null | undefined): number[] {
  const effectiveMax = clamp(maxLeverage ?? 25, 3, 100);
  const rawTiers = [effectiveMax, effectiveMax * 0.7, effectiveMax * 0.45, effectiveMax * 0.25];
  const tiers: number[] = [];

  for (const rawTier of rawTiers) {
    const tier = Math.max(3, Math.round(rawTier));
    if (!tiers.some((existing) => Math.abs(existing - tier) <= 1)) tiers.push(tier);
    if (tiers.length === LFX_TIER_WEIGHTS.length) break;
  }

  return tiers.length > 0 ? tiers : [25, 15, 10, 5];
}

function liquidationDistancePct(weightedLeverage: number): number {
  if (!Number.isFinite(weightedLeverage) || weightedLeverage <= 0) return 8;
  return Number(clamp((100 / weightedLeverage) * 0.9, 0.45, 18).toFixed(2));
}

export function calculateLeverageMultiplier(weightedLeverage: number): number {
  if (!Number.isFinite(weightedLeverage) || weightedLeverage <= 0) return 1;
  return Number(clamp(weightedLeverage / 10, 1, 5).toFixed(2));
}

function sumDepthBetween(levels: BookLevel[] | null | undefined, fromPrice: number, toPrice: number): number | null {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const lower = Math.min(fromPrice, toPrice);
  const upper = Math.max(fromPrice, toPrice);
  const total = levels.reduce((sum, level) => {
    const price = parseNumber(level.px);
    const size = parseNumber(level.sz);
    if (!isPositiveFinite(price) || !isPositiveFinite(size)) return sum;
    if (price < lower || price > upper) return sum;
    return sum + price * size;
  }, 0);
  return total > 0 ? total : null;
}

function visibleDepthUsd({
  side,
  price,
  currentPrice,
  book,
}: {
  side: PressureLevelSide;
  price: number;
  currentPrice: number;
  book?: LfxBookDepth | null;
}): number | null {
  if (side === "long_liq") return sumDepthBetween(book?.bids, price, currentPrice);
  return sumDepthBetween(book?.asks, currentPrice, price);
}

function calculateDistanceDecay(absDistancePct: number): number {
  if (!Number.isFinite(absDistancePct)) return 0.2;
  return Number(clamp(Math.exp(-absDistancePct / 7), 0.12, 1).toFixed(4));
}

function calculateVolatilityReach(absDistancePct: number, atrPct: number | null | undefined): number {
  if (!Number.isFinite(absDistancePct) || absDistancePct <= 0) return 1;
  if (isPositiveFinite(atrPct)) {
    return Number(clamp((atrPct * 2.8) / absDistancePct, 0.08, 1).toFixed(4));
  }
  return Number(clamp(1 / (1 + absDistancePct / 5), 0.16, 0.72).toFixed(4));
}

function localProjectionWindowPct(atrPct: number | null | undefined): number {
  if (isPositiveFinite(atrPct)) return Number(clamp(atrPct * 2.1, 0.75, 1.85).toFixed(2));
  return 1.25;
}

export function classifyLfxZone({
  flowSide,
  depthAdjustedImpact,
  volatilityReach,
  absDistancePct,
}: {
  flowSide: PressureFlowSide;
  depthAdjustedImpact: number | null;
  volatilityReach: number;
  absDistancePct: number;
}): PressureZoneType {
  if (volatilityReach < 0.12 || absDistancePct > 22) return "dead_zone";
  if (depthAdjustedImpact == null) return absDistancePct <= 4 ? "magnet" : "dead_zone";
  if (absDistancePct <= 1.2 && depthAdjustedImpact >= 2.5) return "magnet";
  if (flowSide === "forced_sell") {
    return depthAdjustedImpact >= 6 ? "downside_cascade" : "absorption_support";
  }
  return depthAdjustedImpact >= 6 ? "upside_squeeze" : "absorption_resistance";
}

function confidenceFor({
  lfxScore,
  depthAdjustedImpact,
  openInterestUsd,
}: {
  lfxScore: number;
  depthAdjustedImpact: number | null;
  openInterestUsd: number | null | undefined;
}): PressureConfidence {
  if (lfxScore >= 70 && depthAdjustedImpact != null && (openInterestUsd ?? 0) >= 100_000_000) return "high";
  if (lfxScore >= 38 || depthAdjustedImpact != null) return "medium";
  return "low";
}

function zoneLabel(zoneType: PressureZoneType): string {
  switch (zoneType) {
    case "downside_cascade":
      return "Downside cascade";
    case "upside_squeeze":
      return "Upside squeeze";
    case "absorption_support":
      return "Bid absorption";
    case "absorption_resistance":
      return "Ask absorption";
    case "magnet":
      return "Magnet";
    case "dead_zone":
      return "Dead zone";
  }
}

function flowRankPhrase(flowRank: number | undefined, flowRelative: number | undefined, side: PressureLevelSide): string {
  const sideLabel = side === "long_liq" ? "downside" : "upside";
  if (flowRank != null && flowRank <= 2) return `Top #${flowRank} ${sideLabel} flow`;
  if ((flowRelative ?? 0) >= 1.15) return "Above-average flow";
  return "Average flow";
}

function stressTierPhrase(side: PressureLevelSide): string {
  return side === "long_liq" ? "Estimated downside stress" : "Estimated upside stress";
}

function bookDepthPhrase(side: PressureLevelSide, depthAdjustedImpact: number | null): string {
  const bookSide = side === "long_liq" ? "bids" : "asks";
  if (depthAdjustedImpact == null) return `${bookSide} unknown`;
  return depthAdjustedImpact >= 6 ? `thin ${bookSide}` : `deep ${bookSide}`;
}

function leverageBucket(weightedLeverage: number): string {
  if (weightedLeverage >= 30) return "high leverage";
  if (weightedLeverage >= 18) return "elevated leverage";
  return "moderate leverage";
}

function reachPhrase(volatilityReach: number): string {
  if (volatilityReach >= 0.7) return "high reach";
  if (volatilityReach >= 0.35) return "medium reach";
  return "low reach";
}

function buildLevelExplanation(zoneType: PressureZoneType): string {
  switch (zoneType) {
    case "downside_cascade":
      return "Longs crowded below mark; thin bids make this downside flow risk.";
    case "absorption_support":
      return "Longs crowded below mark; bids look deep enough to absorb first touch.";
    case "upside_squeeze":
      return "Shorts crowded above mark; thin asks make this upside squeeze risk.";
    case "absorption_resistance":
      return "Shorts crowded above mark; asks look deep enough to absorb first touch.";
    case "magnet":
      return "Close flow cluster; tape decides whether it pulls or rejects.";
    case "dead_zone":
      return "Low-priority flow pocket; reach is weak right now.";
  }
}

function buildLocalProjectionExplanation(side: PressureLevelSide, zoneType: PressureZoneType): string {
  const direction =
    side === "short_liq"
      ? "Shorts opened lower can start stressing here; acceptance above it can add buy flow."
      : "Longs opened higher can start stressing here; acceptance below it can add sell flow.";
  const zoneContext =
    zoneType === "magnet"
      ? "It is close enough to mark to matter before the larger outer LFX pockets."
      : "Use it as near-mark decision context, not as a confirmed liquidation wall.";
  return `${direction} ${zoneContext}`;
}

function buildLevelEvidence({
  side,
  notionalUsd,
  weightedLeverage,
  depthAdjustedImpact,
  volatilityReach,
  flowSide,
  flowRank,
  flowRelative,
}: {
  side: PressureLevelSide;
  notionalUsd: number;
  weightedLeverage: number;
  depthAdjustedImpact: number | null;
  volatilityReach: number;
  flowSide: PressureFlowSide;
  flowRank?: number;
  flowRelative?: number;
}): string[] {
  return [
    flowRankPhrase(flowRank, flowRelative, side),
    `${compactUsd(notionalUsd)} ${flowSide === "forced_sell" ? "sell-risk" : "buy-risk"}`,
    bookDepthPhrase(side, depthAdjustedImpact),
    leverageBucket(weightedLeverage),
    reachPhrase(volatilityReach),
  ];
}

function buildStressEvidence({
  side,
  notionalUsd,
  weightedLeverage,
  depthAdjustedImpact,
  volatilityReach,
  flowSide,
}: {
  side: PressureLevelSide;
  notionalUsd: number;
  weightedLeverage: number;
  depthAdjustedImpact: number | null;
  volatilityReach: number;
  flowSide: PressureFlowSide;
}): string[] {
  return [
    stressTierPhrase(side),
    `${compactUsd(notionalUsd)} est. ${flowSide === "forced_sell" ? "sell-stress" : "buy-stress"}`,
    bookDepthPhrase(side, depthAdjustedImpact),
    leverageBucket(weightedLeverage),
    reachPhrase(volatilityReach),
  ];
}

function annotateLfxLevels(levels: PressureLevel[]): PressureLevel[] {
  const averages: Record<PressureLevelSide, number> = {
    long_liq: 0,
    short_liq: 0,
  };
  const ranks = new Map<string, number>();

  for (const side of ["long_liq", "short_liq"] as const) {
    const sideLevels = levels.filter((level) => level.side === side);
    averages[side] =
      sideLevels.length > 0
        ? sideLevels.reduce((sum, level) => sum + level.notionalUsd, 0) / sideLevels.length
        : 0;
    [...sideLevels]
      .sort((a, b) => b.notionalUsd - a.notionalUsd)
      .forEach((level, index) => ranks.set(level.id, index + 1));
  }

  return levels.map((level) => {
    const flowRank = ranks.get(level.id);
    const flowRelative =
      averages[level.side] > 0 ? Number((level.notionalUsd / averages[level.side]).toFixed(2)) : undefined;
    const nextLeverageBucket = leverageBucket(level.weightedLeverage);
    const explanation = buildLevelExplanation(level.zoneType);
    const evidence =
      level.source === "estimated_leverage" && level.evidence?.length
        ? level.evidence
        : level.source === "market_inferred"
          ? buildStressEvidence({
              side: level.side,
              notionalUsd: level.notionalUsd,
              weightedLeverage: level.weightedLeverage,
              depthAdjustedImpact: level.depthAdjustedImpact,
              volatilityReach: level.volatilityReach,
              flowSide: level.flowSide,
            })
          : buildLevelEvidence({
              side: level.side,
              notionalUsd: level.notionalUsd,
              weightedLeverage: level.weightedLeverage,
              depthAdjustedImpact: level.depthAdjustedImpact,
              volatilityReach: level.volatilityReach,
              flowSide: level.flowSide,
              flowRank,
              flowRelative,
            });

    return {
      ...level,
      explanation,
      evidence,
      flowRank,
      flowRelative,
      leverageBucket: nextLeverageBucket,
    };
  });
}

export function calculateMarketPressureScore({
  fundingAPR,
  openInterestUsd,
  maxLeverage,
  topBookImbalancePct,
}: MarketPressureArgs): number {
  const fundingTerm = fundingAPR == null ? 0 : clamp(Math.abs(fundingAPR) / 100, 0, 1);
  const oiTerm =
    openInterestUsd == null || openInterestUsd <= 0
      ? 0
      : clamp(Math.log10(openInterestUsd / 100_000_000 + 1) / 2, 0, 1);
  const leverageTerm = maxLeverage == null ? 0 : clamp(maxLeverage / 100, 0, 1);
  const imbalanceTerm =
    topBookImbalancePct == null ? 0 : clamp(Math.abs(topBookImbalancePct) / 60, 0, 1);

  return Math.round(fundingTerm * 35 + oiTerm * 30 + leverageTerm * 20 + imbalanceTerm * 15);
}

export function nearestPressureLevel(levels: PressureLevel[]): PressureLevel | null {
  if (levels.length === 0) return null;
  return [...levels].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0] ?? null;
}

export function dominantPressureLevel(levels: PressureLevel[]): PressureLevel | null {
  if (levels.length === 0) return null;
  return [...levels].sort(comparePressureLevels)[0] ?? null;
}

export function strongestPressureLevel(
  levels: PressureLevel[],
  side: PressureLevelSide,
  currentPrice?: number | null,
): PressureLevel | null {
  return (
    levels
      .filter((level) => level.side === side && isActionableLevel(level, currentPrice))
      .sort(comparePressureLevels)[0] ?? null
  );
}

export function buildMarketInferredLfxLevels({
  coin,
  currentPrice,
  fundingAPR,
  openInterestUsd,
  maxLeverage,
  topBookImbalancePct,
  atrPct,
  book,
  maxLevels = DEFAULT_MAX_LEVELS,
}: MarketInferredLfxArgs): PressureLevel[] {
  if (!isPositiveFinite(currentPrice)) return [];

  const normalizedCoin = coin.toUpperCase();
  const tiers = buildLeverageTiers(maxLeverage).slice(0, Math.max(1, Math.ceil(maxLevels / 2)));
  const referenceOpenInterestUsd =
    openInterestUsd != null && openInterestUsd > 0 ? openInterestUsd : Math.max(1_000_000, currentPrice * 1_000);
  const fundingSkew = fundingAPR == null ? 0 : clamp(fundingAPR / 80, -0.25, 0.25);
  const bookSkew = topBookImbalancePct == null ? 0 : clamp(topBookImbalancePct / 250, -0.1, 0.1);
  const longShare = clamp(0.5 + fundingSkew + bookSkew, 0.24, 0.76);
  const sideShares: Record<PressureLevelSide, number> = {
    long_liq: longShare,
    short_liq: 1 - longShare,
  };
  const marketPressureScore = calculateMarketPressureScore({
    fundingAPR,
    openInterestUsd,
    maxLeverage,
    topBookImbalancePct,
  });
  const levels: PressureLevel[] = [];

  for (const side of ["long_liq", "short_liq"] as const) {
    tiers.forEach((weightedLeverage, index) => {
      const distance = liquidationDistancePct(weightedLeverage);
      const signedDistancePct = side === "long_liq" ? -distance : distance;
      const price = roundPrice(currentPrice * (1 + signedDistancePct / 100));
      const leverageMultiplier = calculateLeverageMultiplier(weightedLeverage);
      const tierWeight = LFX_TIER_WEIGHTS[index] ?? 0.1;
      const expectedForcedFraction = side === "long_liq" ? 0.12 : 0.1;
      const notionalUsd = Math.round(
        referenceOpenInterestUsd * sideShares[side] * tierWeight * expectedForcedFraction,
      );
      const flowSide: PressureFlowSide = side === "long_liq" ? "forced_sell" : "forced_buy";
      const absDistancePct = Math.abs(signedDistancePct);
      const depthUsd = visibleDepthUsd({ side, price, currentPrice, book });
      const depthAdjustedImpact = depthUsd != null ? Number((notionalUsd / Math.max(depthUsd, 1)).toFixed(2)) : null;
      const distanceDecay = calculateDistanceDecay(absDistancePct);
      const volatilityReach = calculateVolatilityReach(absDistancePct, atrPct);
      const impactTerm =
        depthAdjustedImpact == null
          ? 16
          : clamp(Math.log10(depthAdjustedImpact + 1) * 42, 0, 55);
      const notionalTerm = clamp(Math.log10(notionalUsd / 1_000_000 + 1) * 15, 0, 30);
      const leverageTerm = clamp(leverageMultiplier * 4, 4, 18);
      const lfxScore = Math.round(
        clamp(
          (impactTerm + notionalTerm + leverageTerm) *
            distanceDecay *
            volatilityReach *
            (1 + marketPressureScore / 140),
          1,
          100,
        ),
      );
      const zoneType = classifyLfxZone({
        flowSide,
        depthAdjustedImpact,
        volatilityReach,
        absDistancePct,
      });
      levels.push({
        id: `${normalizedCoin}-${side}-lfx-tier-${weightedLeverage}`,
        price,
        side,
        source: "market_inferred",
        distancePct: signedDistancePct,
        notionalUsd,
        weightedLeverage,
        leverageMultiplier,
        pressureScore: lfxScore,
        lfxScore,
        depthAdjustedImpact,
        volatilityReach,
        distanceDecay,
        flowSide,
        zoneType,
        coverage: MARKET_ONLY_COVERAGE,
        confidence: confidenceFor({ lfxScore, depthAdjustedImpact, openInterestUsd }),
        walletCount: 0,
      });
    });
  }

  const maxPerSide = Math.max(1, Math.ceil(maxLevels / 2));
  const longLevels = levels
    .filter((level) => level.side === "long_liq")
    .sort(comparePressureLevels)
    .slice(0, maxPerSide);
  const shortLevels = levels
    .filter((level) => level.side === "short_liq")
    .sort(comparePressureLevels)
    .slice(0, maxPerSide);

  return annotateLfxLevels([...longLevels, ...shortLevels].sort(comparePressureLevels).slice(0, maxLevels));
}

function isStrongLocalProjection(level: LocalProjectedPressureLevel): boolean {
  if (level.zoneType === "dead_zone") return false;
  if (level.localCandidateCount < LOCAL_PROJECTION_MIN_CANDIDATES) return false;
  if (level.localFlowShare < LOCAL_PROJECTION_MIN_FLOW_SHARE) return false;
  if (level.lfxScore >= LOCAL_PROJECTION_MIN_SCORE) return true;
  return level.localFlowShare >= LOCAL_PROJECTION_STRONG_SHARE && level.lfxScore >= LOCAL_PROJECTION_STRONG_SCORE;
}

function compareLocalProjectedLevels(a: LocalProjectedPressureLevel, b: LocalProjectedPressureLevel): number {
  const aQuality = a.lfxScore * 0.72 + a.localFlowShare * 100 * 0.24 + Math.min(a.localCandleCount, 12) * 0.35;
  const bQuality = b.lfxScore * 0.72 + b.localFlowShare * 100 * 0.24 + Math.min(b.localCandleCount, 12) * 0.35;
  const qualityDelta = bQuality - aQuality;
  if (Math.abs(qualityDelta) >= 0.01) return qualityDelta;
  return Math.abs(a.distancePct) - Math.abs(b.distancePct);
}

export function buildLocalProjectedLfxLevels({
  coin,
  currentPrice,
  candles,
  fundingAPR,
  openInterestUsd,
  maxLeverage,
  topBookImbalancePct,
  atrPct,
  book,
  maxLevels = 4,
}: LocalProjectedLfxArgs): PressureLevel[] {
  if (!isPositiveFinite(currentPrice) || !Array.isArray(candles) || candles.length < 8) return [];

  const normalizedCoin = coin.toUpperCase();
  const scopedCandles = candles.slice(-96).filter((candle) =>
    [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value) && value > 0),
  );
  if (scopedCandles.length < 8) return [];

  const tiers = buildLeverageTiers(maxLeverage).slice(0, 2);
  const nearWindowPct = localProjectionWindowPct(atrPct);
  const bucketSize = Math.max(currentPrice * 0.0012, currentPrice * ((atrPct ?? 0.65) / 100) * 0.18);
  const fundingSkew = fundingAPR == null ? 0 : clamp(fundingAPR / 80, -0.2, 0.2);
  const bookSkew = topBookImbalancePct == null ? 0 : clamp(topBookImbalancePct / 250, -0.08, 0.08);
  const longShare = clamp(0.5 + fundingSkew + bookSkew, 0.28, 0.72);
  const sideShares: Record<PressureLevelSide, number> = {
    long_liq: longShare,
    short_liq: 1 - longShare,
  };
  const referenceOpenInterestUsd =
    openInterestUsd != null && openInterestUsd > 0 ? openInterestUsd : Math.max(1_000_000, currentPrice * 1_000);
  const buckets = new Map<string, LocalProjectionBucket>();

  const addCandidate = ({
    side,
    entry,
    leverage,
    tierWeight,
    candleWeight,
    candleKey,
  }: {
    side: PressureLevelSide;
    entry: number;
    leverage: number;
    tierWeight: number;
    candleWeight: number;
    candleKey: string;
  }) => {
    const distance = liquidationDistancePct(leverage);
    const projectedPrice = side === "short_liq" ? entry * (1 + distance / 100) : entry * (1 - distance / 100);
    const signedDistancePct = ((projectedPrice - currentPrice) / currentPrice) * 100;
    if (side === "short_liq" && signedDistancePct <= 0) return;
    if (side === "long_liq" && signedDistancePct >= 0) return;
    if (Math.abs(signedDistancePct) > nearWindowPct) return;

    const bucketPrice = roundPrice(Math.round(projectedPrice / bucketSize) * bucketSize);
    const key = `${side}-${bucketPrice}`;
    const existing =
      buckets.get(key) ??
      ({
        side,
        price: bucketPrice,
        weight: 0,
        weightedLeverageTotal: 0,
        entryLow: entry,
        entryHigh: entry,
        candidateCount: 0,
        candleKeys: new Set<string>(),
      } satisfies LocalProjectionBucket);
    const weight = candleWeight * tierWeight;
    existing.weight += weight;
    existing.weightedLeverageTotal += leverage * weight;
    existing.entryLow = Math.min(existing.entryLow, entry);
    existing.entryHigh = Math.max(existing.entryHigh, entry);
    existing.candidateCount += 1;
    existing.candleKeys.add(candleKey);
    buckets.set(key, existing);
  };

  scopedCandles.forEach((candle, index) => {
    const candleKey = String(candle.time ?? index);
    const typical = (candle.high + candle.low + candle.close) / 3;
    const bodyMid = (candle.open + candle.close) / 2;
    const volumeUsd = Math.max(1, (candle.volume ?? 0) * typical);
    const recencyWeight = 0.35 + 0.65 * ((index + 1) / scopedCandles.length);
    const candleWeight = Math.log10(volumeUsd + 10) * recencyWeight;
    const entries = [typical, bodyMid, candle.close];

    entries.forEach((entry) => {
      if (!isPositiveFinite(entry)) return;
      tiers.forEach((leverage, tierIndex) => {
        const tierWeight = LOCAL_PROJECTION_TIER_WEIGHTS[tierIndex] ?? 0.25;
        if (entry < currentPrice) {
          addCandidate({ side: "short_liq", entry, leverage, tierWeight, candleWeight, candleKey });
        } else if (entry > currentPrice) {
          addCandidate({ side: "long_liq", entry, leverage, tierWeight, candleWeight, candleKey });
        }
      });
    });
  });

  const sideWeightTotals: Record<PressureLevelSide, number> = {
    long_liq: 0,
    short_liq: 0,
  };
  for (const bucket of buckets.values()) {
    sideWeightTotals[bucket.side] += bucket.weight;
  }

  const levels: LocalProjectedPressureLevel[] = [...buckets.values()]
    .filter((bucket) => bucket.weight > 0)
    .map((bucket): LocalProjectedPressureLevel => {
      const signedDistancePct = Number((((bucket.price - currentPrice) / currentPrice) * 100).toFixed(2));
      const absDistancePct = Math.abs(signedDistancePct);
      const sidePool = referenceOpenInterestUsd * sideShares[bucket.side] * 0.035;
      const sideTotal = Math.max(sideWeightTotals[bucket.side], 1);
      const localFlowShare = bucket.weight / sideTotal;
      const notionalUsd = Math.round(clamp(localFlowShare * sidePool, 0, sidePool * 0.72));
      const weightedLeverage = Math.max(3, Math.round(bucket.weightedLeverageTotal / bucket.weight));
      const leverageMultiplier = calculateLeverageMultiplier(weightedLeverage);
      const flowSide: PressureFlowSide = bucket.side === "long_liq" ? "forced_sell" : "forced_buy";
      const depthUsd = visibleDepthUsd({ side: bucket.side, price: bucket.price, currentPrice, book });
      const depthAdjustedImpact = depthUsd != null ? Number((notionalUsd / Math.max(depthUsd, 1)).toFixed(2)) : null;
      const distanceDecay = calculateDistanceDecay(absDistancePct);
      const volatilityReach = calculateVolatilityReach(absDistancePct, atrPct);
      const impactTerm =
        depthAdjustedImpact == null
          ? 12
          : clamp(Math.log10(depthAdjustedImpact + 1) * 36, 0, 48);
      const notionalTerm = clamp(Math.log10(notionalUsd / 1_000_000 + 1) * 13, 0, 24);
      const leverageTerm = clamp(leverageMultiplier * 4.2, 4, 18);
      const lfxScore = Math.round(
        clamp((impactTerm + notionalTerm + leverageTerm) * distanceDecay * Math.max(volatilityReach, 0.58), 1, 82),
      );
      const zoneType = classifyLfxZone({
        flowSide,
        depthAdjustedImpact,
        volatilityReach,
        absDistancePct,
      });
      const explanation = buildLocalProjectionExplanation(bucket.side, zoneType);
      const evidence = [
        `${bucket.candleKeys.size} recent candles`,
        `${bucket.candidateCount} projected entries`,
        `${compactUsd(notionalUsd)} ${flowSide === "forced_sell" ? "sell-risk" : "buy-risk"}`,
        `${Math.round(localFlowShare * 100)}% of nearby ${flowSide === "forced_sell" ? "sell-risk" : "buy-risk"}`,
        leverageBucket(weightedLeverage),
        `entries ${formatLevelPrice(bucket.entryLow)}-${formatLevelPrice(bucket.entryHigh)}`,
      ];

      return {
        id: `${normalizedCoin}-${bucket.side}-local-${Math.round(bucket.price)}`,
        price: bucket.price,
        side: bucket.side,
        source: "estimated_leverage",
        distancePct: signedDistancePct,
        notionalUsd,
        weightedLeverage,
        leverageMultiplier,
        pressureScore: lfxScore,
        lfxScore,
        depthAdjustedImpact,
        volatilityReach,
        distanceDecay,
        flowSide,
        zoneType,
        coverage: MARKET_ONLY_COVERAGE,
        explanation,
        evidence,
        leverageBucket: leverageBucket(weightedLeverage),
        confidence: confidenceFor({ lfxScore, depthAdjustedImpact, openInterestUsd }),
        walletCount: 0,
        localFlowShare,
        localCandidateCount: bucket.candidateCount,
        localCandleCount: bucket.candleKeys.size,
      };
    })
    .filter(isStrongLocalProjection);

  const maxPerSide = Math.max(1, Math.ceil(maxLevels / 2));
  const localLongs = levels
    .filter((level) => level.side === "long_liq")
    .sort(compareLocalProjectedLevels)
    .slice(0, maxPerSide);
  const localShorts = levels
    .filter((level) => level.side === "short_liq")
    .sort(compareLocalProjectedLevels)
    .slice(0, maxPerSide);

  return (annotateLfxLevels([...localLongs, ...localShorts]) as LocalProjectedPressureLevel[]).sort(
    compareLocalProjectedLevels,
  );
}

export function pressureLevelsToSupportResistanceLevels({
  levels,
  currentPrice,
  maxPerSide = 3,
}: {
  levels: PressureLevel[];
  currentPrice: number | null;
  maxPerSide?: number;
}): SupportResistanceLevel[] {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const toStructureLevel = (level: PressureLevel): SupportResistanceLevel => {
    const kind = level.side === "long_liq" ? "support" : "resistance";
    const halfRange = Math.max(level.price * 0.001, currentPrice * 0.0007);
    const label =
      level.source === "estimated_leverage"
        ? level.side === "short_liq"
          ? "Near buy flow"
          : "Near sell flow"
        : level.source === "market_inferred"
          ? level.side === "short_liq"
            ? "Buy stress"
            : "Sell stress"
          : level.source === "tracked_liquidation"
            ? level.side === "short_liq"
              ? "Tracked buy flow"
              : "Tracked sell flow"
            : zoneLabel(level.zoneType);

    return {
      id: `lfx-${level.id}`,
      label,
      kind,
      source: "leverage_liquidation",
      price: level.price,
      zoneLow: roundPrice(level.price - halfRange),
      zoneHigh: roundPrice(level.price + halfRange),
      strength: level.lfxScore,
      touches: undefined,
      distancePct: level.distancePct,
      confidence: level.confidence,
      status: "active",
      reason: level.explanation ?? "Market-inferred forced-flow zone from OI, funding, visible depth, leverage tiers, and distance.",
      explanation: level.explanation,
      evidence: level.evidence,
      notionalUsd: level.notionalUsd,
      weightedLeverage: level.weightedLeverage,
      leverageMultiplier: level.leverageMultiplier,
      pressureScore: level.pressureScore,
      lfxScore: level.lfxScore,
      depthAdjustedImpact: level.depthAdjustedImpact,
      volatilityReach: level.volatilityReach,
      distanceDecay: level.distanceDecay,
      flowSide: level.flowSide,
      zoneType: level.zoneType,
      coverage: level.coverage,
      flowRank: level.flowRank,
      flowRelative: level.flowRelative,
      leverageBucket: level.leverageBucket,
      walletCount: level.walletCount,
      pressureSide: level.side,
      pressureSource: level.source,
    };
  };

  const downside = levels
    .filter((level) => level.side === "long_liq" && isActionableLevel(level, currentPrice))
    .sort(comparePressureLevels)
    .slice(0, maxPerSide)
    .map(toStructureLevel);
  const upside = levels
    .filter((level) => level.side === "short_liq" && isActionableLevel(level, currentPrice))
    .sort(comparePressureLevels)
    .slice(0, maxPerSide)
    .map(toStructureLevel);

  return [...downside, ...upside].sort((a, b) => {
    const aScore = (a.lfxScore ?? a.strength) / Math.max(Math.abs(a.distancePct ?? Infinity), 0.5);
    const bScore = (b.lfxScore ?? b.strength) / Math.max(Math.abs(b.distancePct ?? Infinity), 0.5);
    return bScore - aScore;
  });
}

export function buildLfxSetupSignal(payload: PressurePayload): MarketSetupSignal {
  const downside =
    payload.summary.strongestLongLiquidationLevel ??
    strongestPressureLevel(payload.levels, "long_liq", payload.currentPrice);
  const upside =
    payload.summary.strongestShortLiquidationLevel ??
    strongestPressureLevel(payload.levels, "short_liq", payload.currentPrice);
  const dominant =
    payload.summary.dominantPressureLevel ??
    [downside, upside].filter((level): level is PressureLevel => Boolean(level)).sort(comparePressureLevels)[0] ??
    null;

  if (!downside && !upside) {
    return {
      type: "none",
      label: "No LFX",
      detail: "Market data missing",
      tone: "neutral",
      level: null,
      distancePct: null,
      isActive: false,
    };
  }

  const detail =
    downside && upside
      ? `Down ${formatLevelPrice(downside.price)} / Up ${formatLevelPrice(upside.price)}`
      : downside
        ? `${formatLevelPrice(downside.price)} ${formatSignedDistance(downside.distancePct)} ${compactUsd(downside.notionalUsd)}`
        : upside
          ? `${formatLevelPrice(upside.price)} ${formatSignedDistance(upside.distancePct)} ${compactUsd(upside.notionalUsd)}`
          : "n/a";
  const tone =
    dominant?.zoneType === "upside_squeeze" || dominant?.zoneType === "absorption_resistance"
      ? "red"
      : dominant?.zoneType === "magnet"
        ? "amber"
        : dominant?.zoneType === "downside_cascade" || dominant?.zoneType === "absorption_support"
          ? "green"
          : "neutral";
  const active = (dominant?.lfxScore ?? 0) >= 70 || Math.abs(dominant?.distancePct ?? Infinity) <= 1.2;

  return {
    type: dominant?.side === "short_liq" ? "near-resistance" : "near-support",
    label: dominant ? zoneLabel(dominant.zoneType) : "LFX zones",
    detail,
    tone,
    level: dominant?.price ?? null,
    distancePct: dominant?.distancePct ?? null,
    isActive: active,
  };
}

export const buildLeverageSetupSignal = buildLfxSetupSignal;
