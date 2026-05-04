import type { SupportResistanceLevel } from "@/types";
import type { MarketSetupSignal } from "@/lib/tradePlan";

export type ReactionLabel =
  | "rejection_upside"
  | "rejection_downside"
  | "upside_continuation"
  | "downside_continuation"
  | "long_crowding_danger"
  | "short_squeeze_danger"
  | "two_way_chop";

export type ReactionDirectionBias = "up" | "down" | "two_way";
export type ReactionConfidence = "low" | "medium" | "high";
export type ReactionPrimarySource = "book" | "positioning" | "stress" | "mixed";
export type ReactionOverlayMode = "all" | "book" | "oi_holding" | "stress";
export type ReactionExposureSide = "bull" | "bear";

const DEFAULT_REACTION_ASSETS = new Set(["BTC", "ETH", "SOL", "HYPE"]);

export interface ReactionBookBucket {
  price: number;
  bucketSize: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  peakBidDepthUsd: number;
  peakAskDepthUsd: number;
  sampleCount: number;
}

export interface ReactionTradeBucket {
  price: number;
  bucketSize: number;
  buyNotionalUsd: number;
  sellNotionalUsd: number;
  tradeCount: number;
  uniqueTraderCount: number;
}

export interface ReactionTrackedLiquidationBucket {
  price: number;
  side: "long_liq" | "short_liq";
  notionalUsd: number;
  walletCount: number;
  positionCount: number;
  weightedAvgLeverage: number | null;
}

export interface ReactionMarketContext {
  fundingAPR: number | null;
  openInterestUsd: number | null;
  openInterestDeltaUsd: number | null;
  positiveOpenInterestDeltaUsd?: number | null;
}

export interface ReactionLevel {
  id: string;
  price: number;
  zoneLow?: number;
  zoneHigh?: number;
  zoneSide?: ReactionExposureSide;
  zoneRank?: number;
  distancePct: number;
  reactionLabel: ReactionLabel;
  directionBias: ReactionDirectionBias;
  confidence: ReactionConfidence;
  score: number;
  primarySource: ReactionPrimarySource;
  coverage: Array<"market_streams" | "tracked_wallet_sample">;
  evidence: string[];
  tooltip?: {
    rank?: number;
    side?: ReactionExposureSide;
    totalRecentFlowUsd?: number;
    inferredOiUsd?: number;
    buyNotionalUsd?: number;
    sellNotionalUsd?: number;
    reasonSelected?: string;
    refreshedAtMs?: number;
  };
  components: {
    bookDepthUsd: number;
    tradeNotionalUsd: number;
    oiEntryNotionalUsd: number;
    trackedLiqNotionalUsd: number;
    fundingBias: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
    bidDepthUsd: number;
    askDepthUsd: number;
    longLiqNotionalUsd: number;
    shortLiqNotionalUsd: number;
    uniqueTraderCount: number;
  };
}

export interface ReactionLevelsPayload {
  coin: string;
  currentPrice: number | null;
  windowMs: number;
  updatedAt: number;
  coverage: {
    marketStreams: boolean;
    trackedWalletSample: boolean;
    exactPositions: false;
    note: string;
  };
  levels: ReactionLevel[];
  overlayLevels: {
    oiHolding: ReactionLevel[];
    oiHoldingBull: ReactionLevel[];
    oiHoldingBear: ReactionLevel[];
  };
  overlays: {
    bookLiquidity: ReactionBookBucket[];
    tradeConcentration: ReactionTradeBucket[];
    oiEntryProfile: Array<{
      price: number;
      inferredNotionalUsd: number;
      side: "likely_long" | "likely_short" | "mixed";
    }>;
    trackedLiquidations: ReactionTrackedLiquidationBucket[];
  };
}

type BuildReactionLevelsArgs = {
  coin: string;
  currentPrice: number;
  windowMs: number;
  updatedAt: number;
  context: ReactionMarketContext;
  bookBuckets: ReactionBookBucket[];
  tradeBuckets: ReactionTradeBucket[];
  trackedLiquidations: ReactionTrackedLiquidationBucket[];
};

const MIN_REACTION_DISTANCE_PCT = 0.45;
const MIN_REACTION_SPACING_PCT = 0.55;
const MIN_REACTION_SCORE = 8;
const MAX_REACTION_LEVELS_PER_SIDE = 4;
const MAX_REACTION_LEVELS = MAX_REACTION_LEVELS_PER_SIDE * 2;
const MAX_OI_HOLDING_ZONES_PER_SIDE = 5;
const OI_HOLDING_CLUSTER_WIDTH_PCT = 0.8;
const MIN_OI_HOLDING_TRADE_NOTIONAL_USD = 250_000;

type LevelAccumulator = {
  price: number;
  bucketSize: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  peakBidDepthUsd: number;
  peakAskDepthUsd: number;
  bookSamples: number;
  buyNotionalUsd: number;
  sellNotionalUsd: number;
  tradeCount: number;
  uniqueTraderCount: number;
  longLiqNotionalUsd: number;
  shortLiqNotionalUsd: number;
  trackedWallets: number;
  trackedPositions: number;
  weightedAvgLeverage: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

export function isDefaultReactionAsset(coin: string | null | undefined): boolean {
  return DEFAULT_REACTION_ASSETS.has(String(coin ?? "").toUpperCase());
}

function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : "-"}${compactUsd(Math.abs(value))}`;
}

function formatDistance(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function levelKey(price: number): string {
  return price.toFixed(price >= 100 ? 0 : price >= 1 ? 2 : 4);
}

function normalize(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

function maxOf(values: number[]): number {
  return values.reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), 0);
}

function createAccumulator(price: number, bucketSize: number): LevelAccumulator {
  return {
    price,
    bucketSize,
    bidDepthUsd: 0,
    askDepthUsd: 0,
    peakBidDepthUsd: 0,
    peakAskDepthUsd: 0,
    bookSamples: 0,
    buyNotionalUsd: 0,
    sellNotionalUsd: 0,
    tradeCount: 0,
    uniqueTraderCount: 0,
    longLiqNotionalUsd: 0,
    shortLiqNotionalUsd: 0,
    trackedWallets: 0,
    trackedPositions: 0,
    weightedAvgLeverage: null,
  };
}

function primarySourceFor(args: {
  bookScore: number;
  tradeScore: number;
  oiScore: number;
  trackedScore: number;
}): ReactionPrimarySource {
  const { bookScore, tradeScore, oiScore, trackedScore } = args;
  const positioning = Math.max(tradeScore, oiScore);
  const max = Math.max(bookScore, positioning, trackedScore);
  const closeCount = [bookScore, positioning, trackedScore].filter((value) => max > 0 && value >= max * 0.82).length;
  if (closeCount >= 2) return "mixed";
  if (max === trackedScore) return "stress";
  if (max === positioning) return "positioning";
  return "book";
}

function reactionLabelFor(args: {
  price: number;
  currentPrice: number;
  flowBias: number;
  oiEntryNotionalUsd: number;
  fundingAPR: number | null;
  bidDepthUsd: number;
  askDepthUsd: number;
  longLiqNotionalUsd: number;
  shortLiqNotionalUsd: number;
}): ReactionLabel {
  const {
    price,
    currentPrice,
    flowBias,
    oiEntryNotionalUsd,
    fundingAPR,
    bidDepthUsd,
    askDepthUsd,
    longLiqNotionalUsd,
    shortLiqNotionalUsd,
  } = args;
  const above = price >= currentPrice;
  const likelyLongBuild = oiEntryNotionalUsd > 0 && flowBias >= 0.12;
  const likelyShortBuild = oiEntryNotionalUsd > 0 && flowBias <= -0.12;
  const askWall = askDepthUsd > bidDepthUsd * 1.2 && askDepthUsd > 0;
  const bidWall = bidDepthUsd > askDepthUsd * 1.2 && bidDepthUsd > 0;
  const positiveFunding = (fundingAPR ?? 0) > 8;
  const negativeFunding = (fundingAPR ?? 0) < -8;

  if (!above && (longLiqNotionalUsd > shortLiqNotionalUsd * 1.1 || (likelyLongBuild && positiveFunding))) {
    return "long_crowding_danger";
  }
  if (above && (shortLiqNotionalUsd > longLiqNotionalUsd * 1.1 || (likelyShortBuild && negativeFunding))) {
    return "short_squeeze_danger";
  }
  if (above && askWall && !likelyLongBuild) return "rejection_upside";
  if (!above && bidWall && !likelyShortBuild) return "rejection_downside";
  if (above && likelyLongBuild && !askWall) return "upside_continuation";
  if (!above && likelyShortBuild && !bidWall) return "downside_continuation";
  if (above && askWall) return "rejection_upside";
  if (!above && bidWall) return "rejection_downside";
  return "two_way_chop";
}

function directionFor(label: ReactionLabel): ReactionDirectionBias {
  if (label === "upside_continuation" || label === "short_squeeze_danger" || label === "rejection_downside") {
    return "up";
  }
  if (label === "downside_continuation" || label === "long_crowding_danger" || label === "rejection_upside") {
    return "down";
  }
  return "two_way";
}

function confidenceFor(args: {
  score: number;
  oiDeltaUsd: number;
  tradeNotionalUsd: number;
  bookSamples: number;
  trackedLiqNotionalUsd: number;
}): ReactionConfidence {
  const { score, oiDeltaUsd, tradeNotionalUsd, bookSamples, trackedLiqNotionalUsd } = args;
  if (score >= 70 && (oiDeltaUsd > 0 || trackedLiqNotionalUsd > 0) && tradeNotionalUsd > 0) return "high";
  if (score >= 42 && (bookSamples >= 2 || tradeNotionalUsd > 0 || trackedLiqNotionalUsd > 0)) return "medium";
  return "low";
}

function reactionLevelPriority(level: ReactionLevel): number {
  const distance = Math.abs(level.distancePct);
  const distanceBonus = clamp(distance / 4, 0, 1) * 18;
  const sourceBonus =
    level.primarySource === "stress"
      ? 10
      : level.primarySource === "mixed"
        ? 8
        : level.primarySource === "positioning"
          ? 6
          : 0;
  const trackedBonus = level.components.trackedLiqNotionalUsd > 0 ? 12 : 0;
  return level.score + distanceBonus + sourceBonus + trackedBonus;
}

function oiHoldingPriority(level: ReactionLevel): number {
  const tradeBonus = Math.log10(level.components.tradeNotionalUsd + 1) * 2;
  const traderBonus = Math.log10(level.components.uniqueTraderCount + 1) * 4;
  const directionalBonus =
    level.components.tradeNotionalUsd > 0
      ? (Math.abs(level.components.buyNotionalUsd - level.components.sellNotionalUsd) /
          level.components.tradeNotionalUsd) *
        10
      : 0;
  return level.components.oiEntryNotionalUsd + tradeBonus + traderBonus + directionalBonus;
}

function oiHoldingSide(level: ReactionLevel): ReactionExposureSide {
  if (level.distancePct < 0) return "bull";
  if (level.distancePct > 0) return "bear";
  return level.components.buyNotionalUsd >= level.components.sellNotionalUsd ? "bull" : "bear";
}

function selectDistinctReactionLevels(levels: ReactionLevel[]): ReactionLevel[] {
  const eligible = levels.filter(
    (level) =>
      Math.abs(level.distancePct) >= MIN_REACTION_DISTANCE_PCT ||
      level.components.trackedLiqNotionalUsd > 0 ||
      level.score >= 70,
  );

  const selectSide = (side: "downside" | "upside") => {
    const candidates = eligible
      .filter((level) => (side === "downside" ? level.distancePct < 0 : level.distancePct > 0))
      .sort((a, b) => reactionLevelPriority(b) - reactionLevelPriority(a));
    const selected: ReactionLevel[] = [];

    for (const candidate of candidates) {
      const tooClose = selected.some(
        (level) => Math.abs(level.distancePct - candidate.distancePct) < MIN_REACTION_SPACING_PCT,
      );
      if (tooClose) continue;
      selected.push(candidate);
      if (selected.length >= MAX_REACTION_LEVELS_PER_SIDE) break;
    }

    return selected;
  };

  const selected = [...selectSide("downside"), ...selectSide("upside")];
  if (selected.length > 0) {
    return selected.sort((a, b) => a.price - b.price);
  }

  return levels
    .filter((level) => Math.abs(level.distancePct) > 0.15)
    .sort((a, b) => reactionLevelPriority(b) - reactionLevelPriority(a))
    .slice(0, 2)
    .sort((a, b) => a.price - b.price);
}

function buildOiHoldingZones(levels: ReactionLevel[], currentPrice: number): {
  bull: ReactionLevel[];
  bear: ReactionLevel[];
} {
  const candidates = levels
    .filter(
      (level) =>
        level.components.oiEntryNotionalUsd > 0 &&
        level.components.tradeNotionalUsd >= MIN_OI_HOLDING_TRADE_NOTIONAL_USD,
    )
    .sort((a, b) => a.price - b.price);

  const buildSide = (side: ReactionExposureSide): ReactionLevel[] => {
    const sideCandidates = candidates.filter((level) => oiHoldingSide(level) === side);
    const clusters: ReactionLevel[][] = [];

    for (const candidate of sideCandidates) {
      const lastCluster = clusters[clusters.length - 1];
      const lastWeightedPrice =
        lastCluster && lastCluster.length > 0
          ? weightedPrice(lastCluster)
          : null;
      const distanceFromCluster =
        lastWeightedPrice == null ? Infinity : Math.abs(((candidate.price - lastWeightedPrice) / currentPrice) * 100);
      if (!lastCluster || distanceFromCluster > OI_HOLDING_CLUSTER_WIDTH_PCT) {
        clusters.push([candidate]);
      } else {
        lastCluster.push(candidate);
      }
    }

    return clusters
      .map((cluster) => zoneFromCluster(cluster, side, currentPrice))
      .sort((a, b) => oiHoldingPriority(b) - oiHoldingPriority(a))
      .slice(0, MAX_OI_HOLDING_ZONES_PER_SIDE)
      .map((zone, index) => withOiHoldingZoneRank(zone, side, index + 1))
      .sort((a, b) => a.price - b.price);
  };

  return {
    bull: buildSide("bull"),
    bear: buildSide("bear"),
  };
}

function weightedPrice(levels: ReactionLevel[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const level of levels) {
    const weight = Math.max(
      level.components.tradeNotionalUsd,
      level.components.oiEntryNotionalUsd,
      level.components.bookDepthUsd,
      1,
    );
    numerator += level.price * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : levels[0]?.price ?? 0;
}

function zoneFromCluster(
  cluster: ReactionLevel[],
  side: ReactionExposureSide,
  currentPrice: number,
): ReactionLevel {
  const sorted = [...cluster].sort((a, b) => oiHoldingPriority(b) - oiHoldingPriority(a));
  const dominant = sorted[0];
  const price = weightedPrice(cluster);
  const zoneLow = Math.min(...cluster.map((level) => level.zoneLow ?? level.price));
  const zoneHigh = Math.max(...cluster.map((level) => level.zoneHigh ?? level.price));
  const distancePct = ((price - currentPrice) / currentPrice) * 100;
  const components = cluster.reduce(
    (sum, level) => ({
      bookDepthUsd: sum.bookDepthUsd + level.components.bookDepthUsd,
      tradeNotionalUsd: sum.tradeNotionalUsd + level.components.tradeNotionalUsd,
      oiEntryNotionalUsd: sum.oiEntryNotionalUsd + level.components.oiEntryNotionalUsd,
      trackedLiqNotionalUsd: sum.trackedLiqNotionalUsd + level.components.trackedLiqNotionalUsd,
      fundingBias: Math.max(sum.fundingBias, level.components.fundingBias),
      buyNotionalUsd: sum.buyNotionalUsd + level.components.buyNotionalUsd,
      sellNotionalUsd: sum.sellNotionalUsd + level.components.sellNotionalUsd,
      bidDepthUsd: sum.bidDepthUsd + level.components.bidDepthUsd,
      askDepthUsd: sum.askDepthUsd + level.components.askDepthUsd,
      longLiqNotionalUsd: sum.longLiqNotionalUsd + level.components.longLiqNotionalUsd,
      shortLiqNotionalUsd: sum.shortLiqNotionalUsd + level.components.shortLiqNotionalUsd,
      uniqueTraderCount: Math.max(sum.uniqueTraderCount, level.components.uniqueTraderCount),
    }),
    {
      bookDepthUsd: 0,
      tradeNotionalUsd: 0,
      oiEntryNotionalUsd: 0,
      trackedLiqNotionalUsd: 0,
      fundingBias: 0,
      buyNotionalUsd: 0,
      sellNotionalUsd: 0,
      bidDepthUsd: 0,
      askDepthUsd: 0,
      longLiqNotionalUsd: 0,
      shortLiqNotionalUsd: 0,
      uniqueTraderCount: 0,
    },
  );
  const clusterWidthPct = ((zoneHigh - zoneLow) / currentPrice) * 100;
  const evidence = [
    formatDistance(distancePct),
    `${compactUsd(components.tradeNotionalUsd)} recent flow`,
    `${formatSignedUsd(components.oiEntryNotionalUsd)} inferred OI build`,
    `${side === "bull" ? "Bull" : "Bear"} OI holding zone`,
    `${cluster.length} clustered bucket${cluster.length === 1 ? "" : "s"} across ${clusterWidthPct.toFixed(2)}%`,
    "Not exact open positions",
  ];

  return {
    ...dominant,
    id: `${dominant.id}-${side}-zone-${levelKey(price)}`,
    price,
    zoneLow,
    zoneHigh,
    zoneSide: side,
    distancePct,
    reactionLabel: "two_way_chop",
    directionBias: "two_way",
    confidence:
      dominant.confidence === "high" || components.tradeNotionalUsd >= MIN_OI_HOLDING_TRADE_NOTIONAL_USD * 3
        ? "high"
        : dominant.confidence,
    score: Math.max(dominant.score, Math.round(clamp(components.tradeNotionalUsd / 1_000_000, 0, 1) * 100)),
    primarySource: "positioning",
    evidence,
    tooltip: {
      side,
      totalRecentFlowUsd: components.tradeNotionalUsd,
      inferredOiUsd: components.oiEntryNotionalUsd,
      buyNotionalUsd: components.buyNotionalUsd,
      sellNotionalUsd: components.sellNotionalUsd,
      reasonSelected: `Top ${side} inferred OI zone from ${cluster.length} flow bucket${cluster.length === 1 ? "" : "s"}`,
    },
    components,
  };
}

function withOiHoldingZoneRank(level: ReactionLevel, side: ReactionExposureSide, rank: number): ReactionLevel {
  return {
    ...level,
    zoneRank: rank,
    tooltip: {
      ...level.tooltip,
      rank,
      side,
    },
  };
}

function labelText(label: ReactionLabel): string {
  switch (label) {
    case "rejection_upside":
      return "Likely upside rejection";
    case "rejection_downside":
      return "Likely downside rejection";
    case "upside_continuation":
      return "Likely upside continuation";
    case "downside_continuation":
      return "Likely downside continuation";
    case "long_crowding_danger":
      return "Crowded-long danger";
    case "short_squeeze_danger":
      return "Crowded-short squeeze";
    case "two_way_chop":
      return "Two-way reaction zone";
  }
}

function buildEvidence(args: {
  label: ReactionLabel;
  distancePct: number;
  flowBias: number;
  oiEntryNotionalUsd: number;
  oiDeltaUsd: number;
  fundingAPR: number | null;
  bidDepthUsd: number;
  askDepthUsd: number;
  tradeNotionalUsd: number;
  uniqueTraderCount: number;
  longLiqNotionalUsd: number;
  shortLiqNotionalUsd: number;
}): string[] {
  const evidence: string[] = [formatDistance(args.distancePct)];
  if (args.oiEntryNotionalUsd > 0) {
    evidence.push(
      `${formatSignedUsd(args.oiEntryNotionalUsd)} inferred ${args.flowBias >= 0 ? "long" : "short"} build`,
    );
  } else if (args.oiDeltaUsd <= 0 && args.tradeNotionalUsd > 0) {
    evidence.push("OI flat/down, confidence reduced");
  }
  if (args.tradeNotionalUsd > 0) {
    const flow = args.flowBias >= 0.12 ? "buy flow" : args.flowBias <= -0.12 ? "sell flow" : "mixed flow";
    evidence.push(`${compactUsd(args.tradeNotionalUsd)} recent ${flow}`);
  }
  if (args.bidDepthUsd > 0 || args.askDepthUsd > 0) {
    evidence.push(`${compactUsd(args.bidDepthUsd)} bids / ${compactUsd(args.askDepthUsd)} asks`);
  }
  if (args.longLiqNotionalUsd > 0) evidence.push(`${compactUsd(args.longLiqNotionalUsd)} tracked long liq sample`);
  if (args.shortLiqNotionalUsd > 0) evidence.push(`${compactUsd(args.shortLiqNotionalUsd)} tracked short liq sample`);
  if (args.fundingAPR != null) {
    const fundingLabel = args.fundingAPR > 4 ? "funding positive" : args.fundingAPR < -4 ? "funding negative" : "funding neutral";
    evidence.push(fundingLabel);
  }
  if (args.uniqueTraderCount > 0) evidence.push(`${args.uniqueTraderCount} public trader ids`);
  evidence.push(labelText(args.label));
  return evidence;
}

export function buildReactionLevels({
  coin,
  currentPrice,
  windowMs,
  updatedAt,
  context,
  bookBuckets,
  tradeBuckets,
  trackedLiquidations,
}: BuildReactionLevelsArgs): ReactionLevelsPayload {
  const levelMap = new Map<string, LevelAccumulator>();
  const getLevel = (price: number, bucketSize: number) => {
    const key = levelKey(price);
    const existing = levelMap.get(key) ?? createAccumulator(price, bucketSize);
    levelMap.set(key, existing);
    return existing;
  };

  for (const bucket of bookBuckets) {
    const level = getLevel(bucket.price, bucket.bucketSize);
    level.bidDepthUsd += bucket.bidDepthUsd;
    level.askDepthUsd += bucket.askDepthUsd;
    level.peakBidDepthUsd = Math.max(level.peakBidDepthUsd, bucket.peakBidDepthUsd);
    level.peakAskDepthUsd = Math.max(level.peakAskDepthUsd, bucket.peakAskDepthUsd);
    level.bookSamples += bucket.sampleCount;
  }

  for (const bucket of tradeBuckets) {
    const level = getLevel(bucket.price, bucket.bucketSize);
    level.buyNotionalUsd += bucket.buyNotionalUsd;
    level.sellNotionalUsd += bucket.sellNotionalUsd;
    level.tradeCount += bucket.tradeCount;
    level.uniqueTraderCount = Math.max(level.uniqueTraderCount, bucket.uniqueTraderCount);
  }

  for (const bucket of trackedLiquidations) {
    const level = getLevel(bucket.price, Math.max(currentPrice * 0.0025, 1));
    if (bucket.side === "long_liq") level.longLiqNotionalUsd += bucket.notionalUsd;
    else level.shortLiqNotionalUsd += bucket.notionalUsd;
    level.trackedWallets += bucket.walletCount;
    level.trackedPositions += bucket.positionCount;
    level.weightedAvgLeverage = bucket.weightedAvgLeverage ?? level.weightedAvgLeverage;
  }

  const accumulators = [...levelMap.values()].filter((level) => {
    const distancePct = Math.abs(((level.price - currentPrice) / currentPrice) * 100);
    return distancePct <= 18;
  });
  const totalTradeNotional = tradeBuckets.reduce(
    (sum, bucket) => sum + bucket.buyNotionalUsd + bucket.sellNotionalUsd,
    0,
  );
  const oiDeltaUsd = Math.max(
    context.positiveOpenInterestDeltaUsd ?? 0,
    context.openInterestDeltaUsd ?? 0,
    0,
  );

  const maxBook = maxOf(accumulators.map((level) => Math.max(level.bidDepthUsd, level.askDepthUsd)));
  const maxTrade = maxOf(accumulators.map((level) => level.buyNotionalUsd + level.sellNotionalUsd));
  const maxTracked = maxOf(accumulators.map((level) => level.longLiqNotionalUsd + level.shortLiqNotionalUsd));
  const inferredOiByPrice = new Map<string, number>();

  for (const level of accumulators) {
    const tradeNotionalUsd = level.buyNotionalUsd + level.sellNotionalUsd;
    const flowBias =
      tradeNotionalUsd > 0 ? (level.buyNotionalUsd - level.sellNotionalUsd) / tradeNotionalUsd : 0;
    const flowConfidence = clamp(Math.abs(flowBias) * 1.25, 0.35, 1);
    const inferredOi =
      oiDeltaUsd > 0 && totalTradeNotional > 0
        ? oiDeltaUsd * (tradeNotionalUsd / totalTradeNotional) * flowConfidence
        : 0;
    inferredOiByPrice.set(levelKey(level.price), inferredOi);
  }

  const maxOi = maxOf([...inferredOiByPrice.values()]);
  const trackedAvailable = trackedLiquidations.length > 0;
  const rawLevels: ReactionLevel[] = accumulators
    .map((level) => {
      const tradeNotionalUsd = level.buyNotionalUsd + level.sellNotionalUsd;
      const trackedLiqNotionalUsd = level.longLiqNotionalUsd + level.shortLiqNotionalUsd;
      const bookDepthUsd = Math.max(level.bidDepthUsd, level.askDepthUsd);
      const oiEntryNotionalUsd = inferredOiByPrice.get(levelKey(level.price)) ?? 0;
      const flowBias =
        tradeNotionalUsd > 0 ? (level.buyNotionalUsd - level.sellNotionalUsd) / tradeNotionalUsd : 0;
      const distancePct = ((level.price - currentPrice) / currentPrice) * 100;
      const fundingPressure = clamp(Math.abs(context.fundingAPR ?? 0) / 80, 0, 1);
      const bookScore = normalize(bookDepthUsd, maxBook);
      const tradeScore = normalize(tradeNotionalUsd, maxTrade);
      const oiScore = normalize(oiEntryNotionalUsd, maxOi);
      const trackedScore = normalize(trackedLiqNotionalUsd, maxTracked);
      const score = trackedAvailable
        ? Math.round((oiScore * 0.3 + tradeScore * 0.25 + bookScore * 0.2 + trackedScore * 0.15 + fundingPressure * 0.1) * 100)
        : Math.round((oiScore * 0.36 + tradeScore * 0.3 + bookScore * 0.24 + fundingPressure * 0.1) * 100);
      const reactionLabel = reactionLabelFor({
        price: level.price,
        currentPrice,
        flowBias,
        oiEntryNotionalUsd,
        fundingAPR: context.fundingAPR,
        bidDepthUsd: level.bidDepthUsd,
        askDepthUsd: level.askDepthUsd,
        longLiqNotionalUsd: level.longLiqNotionalUsd,
        shortLiqNotionalUsd: level.shortLiqNotionalUsd,
      });
      const directionBias = directionFor(reactionLabel);
      const confidence = confidenceFor({
        score,
        oiDeltaUsd,
        tradeNotionalUsd,
        bookSamples: level.bookSamples,
        trackedLiqNotionalUsd,
      });
      const primarySource = primarySourceFor({ bookScore, tradeScore, oiScore, trackedScore });

      return {
        id: `${coin}-${levelKey(level.price)}-${reactionLabel}`,
        price: level.price,
        distancePct,
        reactionLabel,
        directionBias,
        confidence,
        score,
        primarySource,
        coverage: trackedLiqNotionalUsd > 0 ? ["market_streams", "tracked_wallet_sample"] : ["market_streams"],
        evidence: buildEvidence({
          label: reactionLabel,
          distancePct,
          flowBias,
          oiEntryNotionalUsd,
          oiDeltaUsd,
          fundingAPR: context.fundingAPR,
          bidDepthUsd: level.bidDepthUsd,
          askDepthUsd: level.askDepthUsd,
          tradeNotionalUsd,
          uniqueTraderCount: level.uniqueTraderCount,
          longLiqNotionalUsd: level.longLiqNotionalUsd,
          shortLiqNotionalUsd: level.shortLiqNotionalUsd,
        }),
        components: {
          bookDepthUsd,
          tradeNotionalUsd,
          oiEntryNotionalUsd,
          trackedLiqNotionalUsd,
          fundingBias: fundingPressure,
          buyNotionalUsd: level.buyNotionalUsd,
          sellNotionalUsd: level.sellNotionalUsd,
          bidDepthUsd: level.bidDepthUsd,
          askDepthUsd: level.askDepthUsd,
          longLiqNotionalUsd: level.longLiqNotionalUsd,
          shortLiqNotionalUsd: level.shortLiqNotionalUsd,
          uniqueTraderCount: level.uniqueTraderCount,
        },
      } satisfies ReactionLevel;
    })
    .filter((level) => level.score >= MIN_REACTION_SCORE)
    .sort((a, b) => b.score - a.score || Math.abs(a.distancePct) - Math.abs(b.distancePct));
  const levels = selectDistinctReactionLevels(rawLevels).slice(0, MAX_REACTION_LEVELS);
  const oiHoldingZones = buildOiHoldingZones(rawLevels, currentPrice);
  const oiHoldingLevels = [...oiHoldingZones.bull, ...oiHoldingZones.bear].sort((a, b) => a.price - b.price);

  const oiEntryProfile = oiHoldingLevels
    .filter((level) => level.components.oiEntryNotionalUsd > 0)
    .map((level) => ({
      price: level.price,
      inferredNotionalUsd: level.components.oiEntryNotionalUsd,
      side:
        level.components.buyNotionalUsd > level.components.sellNotionalUsd * 1.1
          ? ("likely_long" as const)
          : level.components.sellNotionalUsd > level.components.buyNotionalUsd * 1.1
            ? ("likely_short" as const)
            : ("mixed" as const),
    }));

  return {
    coin,
    currentPrice,
    windowMs,
    updatedAt,
    coverage: {
      marketStreams: bookBuckets.length > 0 || tradeBuckets.length > 0,
      trackedWalletSample: trackedLiquidations.length > 0,
      exactPositions: false,
      note: "Reaction Map uses public Hyperliquid market streams and optional tracked-wallet samples. It does not claim exact exchange-wide positions.",
    },
    levels,
    overlayLevels: {
      oiHolding: oiHoldingLevels,
      oiHoldingBull: oiHoldingZones.bull,
      oiHoldingBear: oiHoldingZones.bear,
    },
    overlays: {
      bookLiquidity: bookBuckets,
      tradeConcentration: tradeBuckets,
      oiEntryProfile,
      trackedLiquidations,
    },
  };
}

function reactionKind(level: ReactionLevel, currentPrice: number): "support" | "resistance" {
  if (level.price < currentPrice) return "support";
  return "resistance";
}

function reactionZoneType(label: ReactionLabel): SupportResistanceLevel["zoneType"] {
  switch (label) {
    case "rejection_downside":
      return "absorption_support";
    case "rejection_upside":
      return "absorption_resistance";
    case "upside_continuation":
    case "short_squeeze_danger":
      return "upside_squeeze";
    case "downside_continuation":
    case "long_crowding_danger":
      return "downside_cascade";
    case "two_way_chop":
      return "magnet";
  }
}

function reactionLabelForChart(label: ReactionLabel): string {
  switch (label) {
    case "rejection_upside":
      return "Upside rejection";
    case "rejection_downside":
      return "Downside rejection";
    case "upside_continuation":
      return "Upside continuation";
    case "downside_continuation":
      return "Downside continuation";
    case "long_crowding_danger":
      return "Long danger";
    case "short_squeeze_danger":
      return "Short squeeze";
    case "two_way_chop":
      return "Two-way";
  }
}

function reactionLabelForSignal(label: ReactionLabel): string {
  switch (label) {
    case "rejection_upside":
      return "Upside reject";
    case "rejection_downside":
      return "Downside reject";
    case "upside_continuation":
      return "Upside continue";
    case "downside_continuation":
      return "Downside continue";
    case "long_crowding_danger":
      return "Long danger";
    case "short_squeeze_danger":
      return "Short squeeze";
    case "two_way_chop":
      return "Two-way chop";
  }
}

export function buildReactionSetupSignal(payload: ReactionLevelsPayload): MarketSetupSignal {
  const dominant = payload.levels[0] ?? null;
  if (!dominant || payload.currentPrice == null) {
    return {
      type: "none",
      label: "No reaction map",
      detail: "warming up",
      tone: "neutral",
      level: null,
      distancePct: null,
      isActive: false,
    };
  }

  const downside = payload.levels
    .filter((level) => level.price < payload.currentPrice!)
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
  const upside = payload.levels
    .filter((level) => level.price > payload.currentPrice!)
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
  const detail =
    downside && upside
      ? `Down ${levelKey(downside.price)} / Up ${levelKey(upside.price)}`
      : `${levelKey(dominant.price)} ${formatDistance(dominant.distancePct)} ${compactUsd(
          Math.max(
            dominant.components.oiEntryNotionalUsd,
            dominant.components.tradeNotionalUsd,
            dominant.components.trackedLiqNotionalUsd,
            dominant.components.bookDepthUsd,
          ),
        )}`;
  const tone: MarketSetupSignal["tone"] =
    dominant.directionBias === "down" ? "red" : dominant.directionBias === "up" ? "green" : "amber";

  return {
    type: dominant.price > payload.currentPrice ? "near-resistance" : "near-support",
    label: reactionLabelForSignal(dominant.reactionLabel),
    detail,
    tone,
    level: dominant.price,
    distancePct: dominant.distancePct,
    isActive: dominant.score >= 65 || Math.abs(dominant.distancePct) <= 1.2,
  };
}

export function reactionLevelsToSupportResistanceLevels(
  payload: ReactionLevelsPayload,
  overlay: ReactionOverlayMode = "all",
): SupportResistanceLevel[] {
  const currentPrice = payload.currentPrice;
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const sourceLevels =
    overlay === "oi_holding"
      ? payload.overlayLevels?.oiHolding ?? []
      : payload.levels.filter((level) => overlay === "all" || level.primarySource === overlay);

  return sourceLevels
    .map((level, index) => {
      const kind = reactionKind(level, currentPrice);
      const halfRange = Math.max(level.price * 0.0009, currentPrice * 0.00055);
      const zoneLow = level.zoneLow ?? Number((level.price - halfRange).toFixed(level.price >= 100 ? 0 : 4));
      const zoneHigh = level.zoneHigh ?? Number((level.price + halfRange).toFixed(level.price >= 100 ? 0 : 4));
      const displayNotionalUsd =
        level.primarySource === "positioning"
          ? level.components.tradeNotionalUsd
          : Math.max(
              level.components.tradeNotionalUsd,
              level.components.oiEntryNotionalUsd,
              level.components.trackedLiqNotionalUsd,
              level.components.bookDepthUsd,
            );
      const directionalFlow =
        level.primarySource === "positioning"
          ? level.components.buyNotionalUsd >= level.components.sellNotionalUsd
            ? "forced_sell"
            : "forced_buy"
          : level.directionBias === "down"
            ? "forced_sell"
            : "forced_buy";
      const depthAdjustedImpact =
        level.components.bookDepthUsd > 0
          ? Number(
              (
                (level.components.tradeNotionalUsd +
                  level.components.oiEntryNotionalUsd +
                  level.components.trackedLiqNotionalUsd) /
                level.components.bookDepthUsd
              ).toFixed(2),
            )
          : null;

      return {
        id: `reaction-${level.id}`,
        label:
          level.primarySource === "positioning"
            ? level.zoneSide === "bull"
              ? "Bull OI holding zone"
              : level.zoneSide === "bear"
                ? "Bear OI holding zone"
                : level.components.buyNotionalUsd >= level.components.sellNotionalUsd
                  ? "Likely long holding"
                  : "Likely short holding"
            : reactionLabelForChart(level.reactionLabel),
        kind,
        source: "leverage_liquidation",
        price: level.price,
        zoneLow,
        zoneHigh,
        strength: level.score,
        distancePct: level.distancePct,
        updatedAtMs: payload.updatedAt,
        confidence: level.confidence,
        status: "active",
        reason: level.evidence.join(" / "),
        explanation: level.evidence.join(" / "),
        evidence: level.evidence,
        notionalUsd: displayNotionalUsd,
        weightedLeverage: undefined,
        leverageMultiplier: undefined,
        pressureScore: level.score,
        lfxScore: level.score,
        depthAdjustedImpact,
        volatilityReach: Number(clamp(1 / (1 + Math.abs(level.distancePct) / 5), 0.12, 1).toFixed(4)),
        distanceDecay: Number(clamp(Math.exp(-Math.abs(level.distancePct) / 7), 0.12, 1).toFixed(4)),
        flowSide: directionalFlow,
        zoneType: reactionZoneType(level.reactionLabel),
        coverage: level.coverage.includes("tracked_wallet_sample") ? "wallet_sample" : "market_only",
        flowRank: level.primarySource === "positioning" ? level.zoneRank ?? index + 1 : undefined,
        flowRelative: level.primarySource === "positioning" ? 1 : undefined,
        leverageBucket: level.primarySource,
        walletCount: level.components.uniqueTraderCount,
        pressureSide: kind === "support" ? "long_liq" : "short_liq",
        pressureSource: undefined,
        exposureSide: level.zoneSide,
        inferredOiUsd: level.components.oiEntryNotionalUsd,
        buyNotionalUsd: level.components.buyNotionalUsd,
        sellNotionalUsd: level.components.sellNotionalUsd,
        zoneTooltip: level.tooltip,
      } satisfies SupportResistanceLevel;
    });
}
