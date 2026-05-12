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
export type ReactionOverlayMode = "confluence" | "book" | "oi_holding" | "stress";
export type ReactionExposureSide = "bull" | "bear";
export type ReactionOrderBookSide = "bid" | "ask";
export type ReactionPositioningAggressorSide = "buyer_initiated" | "seller_initiated" | "mixed";
export type ReactionPositioningRole =
  | "long_defense"
  | "trapped_longs"
  | "short_defense"
  | "trapped_shorts"
  | "active_test"
  | "unknown"
  | "stale";
export type ReactionHiddenReason =
  | "low_confidence"
  | "stale"
  | "too_close_noisy"
  | "insufficient_oi_change"
  | "insufficient_flow"
  | "not_available";

export interface ReactionSourceCaveat {
  exactPositions: false;
  source: "hyperliquid_public_streams" | "worker_exposure_zones" | "combined";
  text: string;
}

export interface ReactionOrderBookShelf {
  id: string;
  side: ReactionOrderBookSide;
  price: number;
  zoneLow: number;
  zoneHigh: number;
  distancePct: number;
  notionalUsd: number;
  peakNotionalUsd: number;
  sampleCount: number;
  confidence: ReactionConfidence;
  ageMs: number | null;
  windowMs: number;
  sourceCaveat: ReactionSourceCaveat;
  hiddenReason?: ReactionHiddenReason;
}

export interface ReactionPositioningZone {
  id: string;
  levelId: string;
  rank: number;
  side: ReactionExposureSide;
  aggressorSide: ReactionPositioningAggressorSide;
  inferenceType: "buyer_initiated_oi_build" | "seller_initiated_oi_build" | "mixed_oi_build";
  role: ReactionPositioningRole;
  roleLabel: string;
  price: number;
  zoneLow: number;
  zoneHigh: number;
  distancePct: number;
  inferredOiUsd: number;
  tradeNotionalUsd: number;
  buyNotionalUsd: number;
  sellNotionalUsd: number;
  confidence: ReactionConfidence;
  confidenceReason: string;
  ageMs: number | null;
  windowMs: number;
  sourceCaveat: ReactionSourceCaveat;
  hiddenReason?: ReactionHiddenReason;
}

export interface ReactionPositioningHiddenSlot {
  aggressorSide: Exclude<ReactionPositioningAggressorSide, "mixed">;
  rank: number;
  hiddenReason: ReactionHiddenReason;
  detail: string;
  windowMs: number;
  sourceCaveat: ReactionSourceCaveat;
}

export interface ReactionZone {
  id: string;
  levelId: string;
  price: number;
  zoneLow: number;
  zoneHigh: number;
  distancePct: number;
  directionBias: ReactionDirectionBias;
  confidence: ReactionConfidence;
  confidenceReason: string;
  score: number;
  primarySource: ReactionPrimarySource;
  ageMs: number | null;
  windowMs: number;
  sourceCaveat: ReactionSourceCaveat;
  evidence: string[];
  hiddenReason?: ReactionHiddenReason;
}

export const REACTION_MAP_ASSETS = [
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "XRP",
  "DOGE",
  "ZEC",
  "TON",
  "SUI",
  "ONDO",
  "AAVE",
  "LINK",
  "BNB",
  "AVAX",
  "LTC",
  "ADA",
  "TRX",
  "UNI",
  "ENA",
  "WIF",
] as const;

const DEFAULT_REACTION_ASSETS = new Set<string>(REACTION_MAP_ASSETS);

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
    aggressorSide?: ReactionPositioningAggressorSide;
    role?: ReactionPositioningRole;
    roleLabel?: string;
    confidenceReason?: string;
    sourceCaveat?: string;
    ageMs?: number | null;
    windowMs?: number;
    hiddenReason?: ReactionHiddenReason;
    dynamicZoneWidthPct?: number;
  };
  positioning?: {
    inferenceType: ReactionPositioningZone["inferenceType"];
    aggressorSide: ReactionPositioningAggressorSide;
    role: ReactionPositioningRole;
    roleLabel: string;
    confidenceReason: string;
    ageMs: number | null;
    windowMs: number;
    sourceCaveat: ReactionSourceCaveat;
    hiddenReason?: ReactionHiddenReason;
  };
  ageMs?: number | null;
  windowMs?: number;
  sourceCaveat?: ReactionSourceCaveat;
  hiddenReason?: ReactionHiddenReason;
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
  sourceWindowMs: number;
  updatedAt: number;
  generatedAt: number;
  source: "empty" | "stream_buckets" | "worker_promoted" | "worker_promoted_plus_stream_buckets";
  algorithmVersion: string;
  coverage: {
    marketStreams: boolean;
    trackedWalletSample: boolean;
    exactPositions: false;
    note: string;
  };
  levels: ReactionLevel[];
  orderBook: {
    bidShelves: ReactionOrderBookShelf[];
    askShelves: ReactionOrderBookShelf[];
    hidden: Array<{
      side: ReactionOrderBookSide;
      rank: number;
      hiddenReason: ReactionHiddenReason;
      detail: string;
      windowMs: number;
      sourceCaveat: ReactionSourceCaveat;
    }>;
    sourceCaveat: ReactionSourceCaveat;
  };
  positioning: {
    buyerInitiatedBuilds: ReactionPositioningZone[];
    sellerInitiatedBuilds: ReactionPositioningZone[];
    hidden: ReactionPositioningHiddenSlot[];
    sourceCaveat: ReactionSourceCaveat;
  };
  reactionZones: ReactionZone[];
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
const MAX_ORDER_BOOK_SHELVES_PER_SIDE = 5;
const OI_HOLDING_CLUSTER_WIDTH_PCT = 0.8;
const MIN_OI_HOLDING_TRADE_NOTIONAL_USD = 250_000;
const POSITIONING_STALE_MULTIPLIER = 2;
const REACTION_ALGORITHM_VERSION = "reaction-map-v2.1.0";

const MARKET_STREAM_CAVEAT: ReactionSourceCaveat = {
  exactPositions: false,
  source: "hyperliquid_public_streams",
  text: "Uses public Hyperliquid book, trade, and OI data. Resting liquidity can move and positioning is inferred, not exact trader positions.",
};

const WORKER_ZONE_CAVEAT: ReactionSourceCaveat = {
  exactPositions: false,
  source: "worker_exposure_zones",
  text: "Uses worker-built zones inferred from public Hyperliquid trades plus OI changes. It does not locate exact exchange-wide positions.",
};

const COMBINED_CAVEAT: ReactionSourceCaveat = {
  exactPositions: false,
  source: "combined",
  text: "Combines public Hyperliquid streams with inferred worker zones. Treat this as reaction context, not a standalone trade signal.",
};

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

function caveatForLevel(level: ReactionLevel): ReactionSourceCaveat {
  if (level.sourceCaveat) return level.sourceCaveat;
  if (level.primarySource === "positioning") return WORKER_ZONE_CAVEAT;
  if (level.primarySource === "mixed") return COMBINED_CAVEAT;
  return MARKET_STREAM_CAVEAT;
}

function zoneAgeMs(level: ReactionLevel, updatedAt: number): number | null {
  if (level.ageMs != null) return level.ageMs;
  const refreshedAtMs = level.tooltip?.refreshedAtMs;
  if (refreshedAtMs == null || !Number.isFinite(refreshedAtMs)) return null;
  return Math.max(updatedAt - refreshedAtMs, 0);
}

function isStaleZone(level: ReactionLevel, updatedAt: number, windowMs: number): boolean {
  if (level.hiddenReason === "stale" || level.positioning?.role === "stale") return true;
  const ageMs = zoneAgeMs(level, updatedAt);
  return ageMs != null && ageMs > windowMs * POSITIONING_STALE_MULTIPLIER;
}

function isPositioningDisplayable(level: ReactionLevel, updatedAt: number, windowMs: number): boolean {
  return level.hiddenReason == null && !isStaleZone(level, updatedAt, windowMs);
}

function capPositioningDisplayRange(level: ReactionLevel, currentPrice: number, zoneLow: number, zoneHigh: number): { zoneLow: number; zoneHigh: number } {
  if (level.primarySource !== "positioning") return { zoneLow, zoneHigh };
  const dynamicZoneWidthPct = level.tooltip?.dynamicZoneWidthPct;
  if (dynamicZoneWidthPct == null || !Number.isFinite(dynamicZoneWidthPct) || dynamicZoneWidthPct <= 0) {
    return { zoneLow, zoneHigh };
  }
  const maxWidth = currentPrice * (dynamicZoneWidthPct / 100);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || zoneHigh - zoneLow <= maxWidth) return { zoneLow, zoneHigh };
  const halfWidth = maxWidth / 2;
  return {
    zoneLow: level.price - halfWidth,
    zoneHigh: level.price + halfWidth,
  };
}

function zonePriceLocation(args: {
  zoneLow: number;
  zoneHigh: number;
  currentPrice: number | null;
}): "below" | "above" | "inside" | "unknown" {
  const { zoneLow, zoneHigh, currentPrice } = args;
  if (currentPrice == null || currentPrice <= 0) return "unknown";
  if (zoneHigh < currentPrice) return "below";
  if (zoneLow > currentPrice) return "above";
  return "inside";
}

function positioningAggressorFor(level: ReactionLevel): ReactionPositioningAggressorSide {
  if (level.positioning?.aggressorSide) return level.positioning.aggressorSide;
  if (level.zoneSide === "bull") return "buyer_initiated";
  if (level.zoneSide === "bear") return "seller_initiated";
  const buy = level.components.buyNotionalUsd;
  const sell = level.components.sellNotionalUsd;
  if (buy > sell * 1.1) return "buyer_initiated";
  if (sell > buy * 1.1) return "seller_initiated";
  return "mixed";
}

function positioningInferenceType(
  aggressorSide: ReactionPositioningAggressorSide,
): ReactionPositioningZone["inferenceType"] {
  if (aggressorSide === "buyer_initiated") return "buyer_initiated_oi_build";
  if (aggressorSide === "seller_initiated") return "seller_initiated_oi_build";
  return "mixed_oi_build";
}

function positioningRoleFor(args: {
  aggressorSide: ReactionPositioningAggressorSide;
  zoneLow: number;
  zoneHigh: number;
  currentPrice: number | null;
  stale: boolean;
}): ReactionPositioningRole {
  if (args.stale) return "stale";
  const location = zonePriceLocation(args);
  if (location === "inside") return "active_test";
  if (location === "unknown" || args.aggressorSide === "mixed") return "unknown";
  if (args.aggressorSide === "buyer_initiated") {
    return location === "below" ? "long_defense" : "trapped_longs";
  }
  return location === "above" ? "short_defense" : "trapped_shorts";
}

function positioningRoleLabel(role: ReactionPositioningRole): string {
  switch (role) {
    case "long_defense":
      return "Long defense";
    case "trapped_longs":
      return "Trapped longs";
    case "short_defense":
      return "Short defense";
    case "trapped_shorts":
      return "Trapped shorts";
    case "active_test":
      return "Active test";
    case "stale":
      return "Stale inferred zone";
    case "unknown":
      return "Unclear positioning";
  }
}

function confidenceReasonForPositioning(level: ReactionLevel, role: ReactionPositioningRole): string {
  if (role === "stale") return "Zone is older than the selected positioning window.";
  if (level.components.oiEntryNotionalUsd <= 0) return "No positive OI build is available for this bucket.";
  if (level.components.tradeNotionalUsd < MIN_OI_HOLDING_TRADE_NOTIONAL_USD) {
    return "Recent public flow is below the minimum used for positioning zones.";
  }
  const totalFlow = level.components.buyNotionalUsd + level.components.sellNotionalUsd;
  const skew = totalFlow > 0 ? Math.abs(level.components.buyNotionalUsd - level.components.sellNotionalUsd) / totalFlow : 0;
  if (skew < 0.1) return "Buyer-initiated and seller-initiated flow are too mixed for a one-sided read.";
  return `${positioningRoleLabel(role)} inferred from public trade direction, positive OI change, and zone freshness.`;
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
  const aggressorSide: ReactionPositioningAggressorSide = side === "bull" ? "buyer_initiated" : "seller_initiated";
  const role = positioningRoleFor({ aggressorSide, zoneLow, zoneHigh, currentPrice, stale: false });
  const roleLabel = positioningRoleLabel(role);
  const evidence = [
    formatDistance(distancePct),
    `${compactUsd(components.tradeNotionalUsd)} recent flow`,
    `${formatSignedUsd(components.oiEntryNotionalUsd)} inferred OI build`,
    `${aggressorSide === "buyer_initiated" ? "Buyer-initiated" : "Seller-initiated"} inferred build`,
    roleLabel,
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
      aggressorSide,
      role,
      roleLabel,
      confidenceReason: confidenceReasonForPositioning(dominant, role),
      sourceCaveat: MARKET_STREAM_CAVEAT.text,
      windowMs: dominant.windowMs,
      reasonSelected: `Top ${aggressorSide === "buyer_initiated" ? "buyer-initiated" : "seller-initiated"} inferred OI build from ${cluster.length} flow bucket${cluster.length === 1 ? "" : "s"}`,
    },
    positioning: {
      inferenceType: positioningInferenceType(aggressorSide),
      aggressorSide,
      role,
      roleLabel,
      confidenceReason: confidenceReasonForPositioning(dominant, role),
      ageMs: dominant.ageMs ?? null,
      windowMs: dominant.windowMs ?? 0,
      sourceCaveat: MARKET_STREAM_CAVEAT,
    },
    sourceCaveat: MARKET_STREAM_CAVEAT,
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
      `${formatSignedUsd(args.oiEntryNotionalUsd)} inferred ${args.flowBias >= 0 ? "buyer-initiated" : "seller-initiated"} OI build`,
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

function buildOrderBookShelf(args: {
  bucket: ReactionBookBucket;
  side: ReactionOrderBookSide;
  currentPrice: number;
  windowMs: number;
}): ReactionOrderBookShelf {
  const { bucket, side, currentPrice, windowMs } = args;
  const notionalUsd = side === "bid" ? bucket.bidDepthUsd : bucket.askDepthUsd;
  const peakNotionalUsd = side === "bid" ? bucket.peakBidDepthUsd : bucket.peakAskDepthUsd;
  const halfRange = Math.max(bucket.bucketSize / 2, currentPrice * 0.0004);
  const distancePct = ((bucket.price - currentPrice) / currentPrice) * 100;
  const confidence: ReactionConfidence =
    bucket.sampleCount >= 8 && peakNotionalUsd > 0
      ? "high"
      : bucket.sampleCount >= 3
        ? "medium"
        : "low";

  return {
    id: `book-${side}-${levelKey(bucket.price)}`,
    side,
    price: bucket.price,
    zoneLow: Number((bucket.price - halfRange).toFixed(bucket.price >= 100 ? 0 : 4)),
    zoneHigh: Number((bucket.price + halfRange).toFixed(bucket.price >= 100 ? 0 : 4)),
    distancePct,
    notionalUsd,
    peakNotionalUsd,
    sampleCount: bucket.sampleCount,
    confidence,
    ageMs: 0,
    windowMs,
    sourceCaveat: MARKET_STREAM_CAVEAT,
  };
}

function buildBookHiddenSlots(args: {
  side: ReactionOrderBookSide;
  count: number;
  windowMs: number;
}): ReactionLevelsPayload["orderBook"]["hidden"] {
  const hidden: ReactionLevelsPayload["orderBook"]["hidden"] = [];
  for (let index = args.count; index < MAX_ORDER_BOOK_SHELVES_PER_SIDE; index += 1) {
    hidden.push({
      side: args.side,
      rank: index + 1,
      hiddenReason: "not_available",
      detail: `No additional ${args.side} shelf cleared the book-depth window.`,
      windowMs: args.windowMs,
      sourceCaveat: MARKET_STREAM_CAVEAT,
    });
  }
  return hidden;
}

function buildOrderBookSection(args: {
  bookBuckets: ReactionBookBucket[];
  currentPrice: number | null;
  windowMs: number;
}): ReactionLevelsPayload["orderBook"] {
  const { bookBuckets, currentPrice, windowMs } = args;
  if (currentPrice == null || currentPrice <= 0) {
    return {
      bidShelves: [],
      askShelves: [],
      hidden: [
        ...buildBookHiddenSlots({ side: "bid", count: 0, windowMs }),
        ...buildBookHiddenSlots({ side: "ask", count: 0, windowMs }),
      ],
      sourceCaveat: MARKET_STREAM_CAVEAT,
    };
  }

  const bidShelves = bookBuckets
    .filter((bucket) => bucket.bidDepthUsd > 0 && bucket.price <= currentPrice)
    .sort((a, b) => b.bidDepthUsd - a.bidDepthUsd)
    .slice(0, MAX_ORDER_BOOK_SHELVES_PER_SIDE)
    .map((bucket) => buildOrderBookShelf({ bucket, side: "bid", currentPrice, windowMs }));
  const askShelves = bookBuckets
    .filter((bucket) => bucket.askDepthUsd > 0 && bucket.price >= currentPrice)
    .sort((a, b) => b.askDepthUsd - a.askDepthUsd)
    .slice(0, MAX_ORDER_BOOK_SHELVES_PER_SIDE)
    .map((bucket) => buildOrderBookShelf({ bucket, side: "ask", currentPrice, windowMs }));

  return {
    bidShelves,
    askShelves,
    hidden: [
      ...buildBookHiddenSlots({ side: "bid", count: bidShelves.length, windowMs }),
      ...buildBookHiddenSlots({ side: "ask", count: askShelves.length, windowMs }),
    ],
    sourceCaveat: MARKET_STREAM_CAVEAT,
  };
}

function positioningHiddenDetail(aggressorSide: Exclude<ReactionPositioningAggressorSide, "mixed">): string {
  return `No additional ${
    aggressorSide === "buyer_initiated" ? "buyer-initiated" : "seller-initiated"
  } inferred OI build cleared the confidence, freshness, and flow filters.`;
}

function buildPositioningHiddenSlots(args: {
  aggressorSide: Exclude<ReactionPositioningAggressorSide, "mixed">;
  count: number;
  windowMs: number;
  sourceCaveat: ReactionSourceCaveat;
}): ReactionPositioningHiddenSlot[] {
  const hidden: ReactionPositioningHiddenSlot[] = [];
  for (let index = args.count; index < MAX_OI_HOLDING_ZONES_PER_SIDE; index += 1) {
    hidden.push({
      aggressorSide: args.aggressorSide,
      rank: index + 1,
      hiddenReason: "low_confidence",
      detail: positioningHiddenDetail(args.aggressorSide),
      windowMs: args.windowMs,
      sourceCaveat: args.sourceCaveat,
    });
  }
  return hidden;
}

function positioningZoneFromLevel(args: {
  level: ReactionLevel;
  currentPrice: number | null;
  windowMs: number;
  updatedAt: number;
}): ReactionPositioningZone {
  const { level, currentPrice, windowMs, updatedAt } = args;
  const rawZoneLow = level.zoneLow ?? level.price;
  const rawZoneHigh = level.zoneHigh ?? level.price;
  const { zoneLow, zoneHigh } =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0
      ? capPositioningDisplayRange(level, currentPrice, rawZoneLow, rawZoneHigh)
      : { zoneLow: rawZoneLow, zoneHigh: rawZoneHigh };
  const ageMs = zoneAgeMs(level, updatedAt);
  const stale = isStaleZone(level, updatedAt, windowMs);
  const aggressorSide = positioningAggressorFor(level);
  const role = positioningRoleFor({ aggressorSide, zoneLow, zoneHigh, currentPrice, stale });
  const sourceCaveat = caveatForLevel(level);
  const confidenceReason = level.positioning?.confidenceReason ?? level.tooltip?.confidenceReason ?? confidenceReasonForPositioning(level, role);

  return {
    id: `positioning-${level.id}`,
    levelId: level.id,
    rank: level.zoneRank ?? level.tooltip?.rank ?? 1,
    side: level.zoneSide ?? (aggressorSide === "seller_initiated" ? "bear" : "bull"),
    aggressorSide,
    inferenceType: positioningInferenceType(aggressorSide),
    role,
    roleLabel: positioningRoleLabel(role),
    price: level.price,
    zoneLow,
    zoneHigh,
    distancePct: level.distancePct,
    inferredOiUsd: level.components.oiEntryNotionalUsd,
    tradeNotionalUsd: level.components.tradeNotionalUsd,
    buyNotionalUsd: level.components.buyNotionalUsd,
    sellNotionalUsd: level.components.sellNotionalUsd,
    confidence: level.confidence,
    confidenceReason,
    ageMs,
    windowMs,
    sourceCaveat,
    hiddenReason: stale ? "stale" : level.hiddenReason,
  };
}

function dedupePositioningZones(zones: ReactionPositioningZone[]): ReactionPositioningZone[] {
  const byKey = new Map<string, ReactionPositioningZone>();
  for (const zone of zones) {
    const key = `${zone.aggressorSide}:${levelKey(zone.price)}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      zone.rank < existing.rank ||
      (zone.rank === existing.rank && zone.tradeNotionalUsd > existing.tradeNotionalUsd)
    ) {
      byKey.set(key, zone);
    }
  }
  return [...byKey.values()];
}

function buildPositioningSection(args: {
  levels: ReactionLevel[];
  currentPrice: number | null;
  windowMs: number;
  updatedAt: number;
}): ReactionLevelsPayload["positioning"] {
  const zones = dedupePositioningZones(
    args.levels
      .filter((level) => level.primarySource === "positioning" && isPositioningDisplayable(level, args.updatedAt, args.windowMs))
      .map((level) => positioningZoneFromLevel({ ...args, level })),
  );
  const buyerInitiatedBuilds = zones
    .filter((zone) => zone.aggressorSide === "buyer_initiated")
    .sort((a, b) => a.rank - b.rank || b.tradeNotionalUsd - a.tradeNotionalUsd)
    .slice(0, MAX_OI_HOLDING_ZONES_PER_SIDE);
  const sellerInitiatedBuilds = zones
    .filter((zone) => zone.aggressorSide === "seller_initiated")
    .sort((a, b) => a.rank - b.rank || b.tradeNotionalUsd - a.tradeNotionalUsd)
    .slice(0, MAX_OI_HOLDING_ZONES_PER_SIDE);
  const sourceCaveat = zones.some((zone) => zone.sourceCaveat.source === "worker_exposure_zones")
    ? WORKER_ZONE_CAVEAT
    : MARKET_STREAM_CAVEAT;

  return {
    buyerInitiatedBuilds,
    sellerInitiatedBuilds,
    hidden: [
      ...buildPositioningHiddenSlots({
        aggressorSide: "buyer_initiated",
        count: buyerInitiatedBuilds.length,
        windowMs: args.windowMs,
        sourceCaveat,
      }),
      ...buildPositioningHiddenSlots({
        aggressorSide: "seller_initiated",
        count: sellerInitiatedBuilds.length,
        windowMs: args.windowMs,
        sourceCaveat,
      }),
    ],
    sourceCaveat,
  };
}

function buildReactionZoneSection(args: {
  levels: ReactionLevel[];
  currentPrice: number | null;
  windowMs: number;
  updatedAt: number;
}): ReactionZone[] {
  return args.levels
    .filter((level) => {
      const hasBook = level.components.bookDepthUsd > 0;
      const hasPositioning = level.components.tradeNotionalUsd > 0 || level.components.oiEntryNotionalUsd > 0;
      const hasStress = level.components.trackedLiqNotionalUsd > 0;
      const farEnough = Math.abs(level.distancePct) >= MIN_REACTION_DISTANCE_PCT;
      if (level.primarySource === "positioning") return hasStress || (hasBook && farEnough);
      if (level.primarySource === "book") return hasBook && farEnough;
      return level.primarySource === "mixed" || hasStress || (hasBook && hasPositioning && farEnough);
    })
    .map((level) => {
    const zoneLow = level.zoneLow ?? level.price;
    const zoneHigh = level.zoneHigh ?? level.price;
    const ageMs = zoneAgeMs(level, args.updatedAt);
    const sourceCaveat = level.primarySource === "mixed" ? COMBINED_CAVEAT : caveatForLevel(level);
    return {
      id: `reaction-zone-${level.id}`,
      levelId: level.id,
      price: level.price,
      zoneLow,
      zoneHigh,
      distancePct: level.distancePct,
      directionBias: level.directionBias,
      confidence: level.confidence,
      confidenceReason:
        "Reaction zone scored from confluence across available public-stream inputs.",
      score: level.score,
      primarySource: level.primarySource,
      ageMs,
      windowMs: args.windowMs,
      sourceCaveat,
      evidence: level.evidence,
      hiddenReason: isStaleZone(level, args.updatedAt, args.windowMs) ? "stale" : level.hiddenReason,
    };
  });
}

type ReactionLevelsPayloadBase = Omit<
  ReactionLevelsPayload,
  "orderBook" | "positioning" | "reactionZones" | "sourceWindowMs" | "generatedAt" | "algorithmVersion"
> &
  Partial<Pick<ReactionLevelsPayload, "sourceWindowMs" | "generatedAt" | "algorithmVersion">>;

export function withStructuredReactionPayloadSections(payload: ReactionLevelsPayloadBase): ReactionLevelsPayload {
  const generatedAt = payload.generatedAt ?? payload.updatedAt ?? Date.now();
  return {
    ...payload,
    sourceWindowMs: payload.sourceWindowMs ?? payload.windowMs,
    generatedAt,
    algorithmVersion: payload.algorithmVersion ?? REACTION_ALGORITHM_VERSION,
    orderBook: buildOrderBookSection({
      bookBuckets: payload.overlays.bookLiquidity,
      currentPrice: payload.currentPrice,
      windowMs: payload.windowMs,
    }),
    positioning: buildPositioningSection({
      levels: payload.overlayLevels.oiHolding,
      currentPrice: payload.currentPrice,
      windowMs: payload.windowMs,
      updatedAt: payload.updatedAt,
    }),
    reactionZones: buildReactionZoneSection({
      levels: payload.levels,
      currentPrice: payload.currentPrice,
      windowMs: payload.windowMs,
      updatedAt: payload.updatedAt,
    }),
  };
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
        tooltip: {
          refreshedAtMs: updatedAt,
          sourceCaveat: MARKET_STREAM_CAVEAT.text,
          ageMs: 0,
          windowMs,
        },
        ageMs: 0,
        windowMs,
        sourceCaveat: MARKET_STREAM_CAVEAT,
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

  return withStructuredReactionPayloadSections({
    coin,
    currentPrice,
    windowMs,
    sourceWindowMs: windowMs,
    updatedAt,
    generatedAt: updatedAt,
    source: "stream_buckets",
    algorithmVersion: REACTION_ALGORITHM_VERSION,
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
  });
}

function reactionKind(level: ReactionLevel, currentPrice: number): "support" | "resistance" {
  if (level.primarySource === "positioning") {
    const zoneLow = level.zoneLow ?? level.price;
    const zoneHigh = level.zoneHigh ?? level.price;
    const zoneMid = (zoneLow + zoneHigh) / 2;
    if (currentPrice < zoneLow) return "resistance";
    if (currentPrice > zoneHigh) return "support";
    return zoneMid <= currentPrice ? "support" : "resistance";
  }
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
  overlay: ReactionOverlayMode = "confluence",
): SupportResistanceLevel[] {
  const currentPrice = payload.currentPrice;
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const reactionZoneLevelIds = new Set((payload.reactionZones ?? []).map((zone) => zone.levelId));
  const sourceLevels =
    overlay === "confluence"
      ? payload.levels.filter((level) => reactionZoneLevelIds.has(level.id))
      : overlay === "oi_holding"
        ? (payload.overlayLevels?.oiHolding ?? []).filter((level) =>
            isPositioningDisplayable(level, payload.updatedAt, payload.windowMs),
          )
        : payload.levels.filter((level) => level.primarySource === overlay);

  return sourceLevels
    .map((level, index) => {
      const kind = reactionKind(level, currentPrice);
      const positioning =
        level.primarySource === "positioning"
          ? positioningZoneFromLevel({
              level,
              currentPrice,
              windowMs: payload.windowMs,
              updatedAt: payload.updatedAt,
            })
          : null;
      const halfRange = Math.max(level.price * 0.0009, currentPrice * 0.00055);
      const rawZoneLow = level.zoneLow ?? Number((level.price - halfRange).toFixed(level.price >= 100 ? 0 : 4));
      const rawZoneHigh = level.zoneHigh ?? Number((level.price + halfRange).toFixed(level.price >= 100 ? 0 : 4));
      const { zoneLow, zoneHigh } = capPositioningDisplayRange(level, currentPrice, rawZoneLow, rawZoneHigh);
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
      const zoneTooltip = {
        ...level.tooltip,
        aggressorSide: positioning?.aggressorSide ?? level.tooltip?.aggressorSide,
        role: positioning?.role ?? level.tooltip?.role,
        roleLabel: positioning?.roleLabel ?? level.tooltip?.roleLabel,
        confidenceReason: positioning?.confidenceReason ?? level.tooltip?.confidenceReason,
        sourceCaveat: positioning?.sourceCaveat.text ?? level.tooltip?.sourceCaveat,
        ageMs: positioning?.ageMs ?? level.tooltip?.ageMs,
        windowMs: positioning?.windowMs ?? level.tooltip?.windowMs,
        hiddenReason: positioning?.hiddenReason ?? level.tooltip?.hiddenReason,
      };

      return {
        id: `reaction-${level.id}`,
        label:
          level.primarySource === "positioning"
            ? positioning?.roleLabel ?? "Inferred positioning zone"
            : reactionLabelForChart(level.reactionLabel),
        kind,
        source: "reaction_map",
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
        pressureSource: "market_inferred",
        exposureSide: level.zoneSide,
        inferredOiUsd: level.components.oiEntryNotionalUsd,
        buyNotionalUsd: level.components.buyNotionalUsd,
        sellNotionalUsd: level.components.sellNotionalUsd,
        zoneTooltip,
      } satisfies SupportResistanceLevel;
    });
}
