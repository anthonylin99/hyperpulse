import type {
  ReactionBookBucket,
  ReactionConfidence,
  ReactionExposureSide,
  ReactionLevel,
  ReactionLevelsPayload,
} from "@/lib/reactionLevels";

export type ReactionMapSide = "bid" | "ask";
export type PositioningSide = "buyer" | "seller";
export type PositioningAggressorSide =
  | PositioningSide
  | ReactionExposureSide
  | "likely_long"
  | "likely_short"
  | "buyer_initiated"
  | "seller_initiated"
  | "mixed";
export type ReactionZoneTone = "support" | "resistance" | "pivot" | "stress" | "neutral";

export interface OrderBookShelfLike {
  id?: string;
  side?: ReactionMapSide | "buy" | "sell";
  price?: number | null;
  zoneLow?: number | null;
  zoneHigh?: number | null;
  bucketSize?: number | null;
  notionalUsd?: number | null;
  depthUsd?: number | null;
  bidDepthUsd?: number | null;
  askDepthUsd?: number | null;
  peakBidDepthUsd?: number | null;
  peakAskDepthUsd?: number | null;
  orderCount?: number | null;
  sampleCount?: number | null;
  distancePct?: number | null;
  updatedAt?: number | null;
  freshnessMs?: number | null;
  ageMs?: number | null;
  peakNotionalUsd?: number | null;
  status?: "stable" | "refilled" | "pulled" | "sampled" | "thin";
  hiddenReason?: string | null;
}

export interface PositioningZoneLike {
  id?: string;
  side?: PositioningAggressorSide;
  aggressorSide?: PositioningAggressorSide;
  price?: number | null;
  zoneLow?: number | null;
  zoneHigh?: number | null;
  role?: string | null;
  roleLabel?: string | null;
  confidence?: ReactionConfidence | null;
  confidenceReason?: string | null;
  caveat?: string | null;
  sourceCaveat?: { text?: string | null } | null;
  ageMs?: number | null;
  windowMs?: number | null;
  updatedAt?: number | null;
  notionalUsd?: number | null;
  inferredOiUsd?: number | null;
  recentFlowUsd?: number | null;
  tradeNotionalUsd?: number | null;
  buyNotionalUsd?: number | null;
  sellNotionalUsd?: number | null;
  aggressorSkew?: number | null;
  imbalanceUsd?: number | null;
  imbalanceType?: "long_imbalance" | "short_imbalance" | "pivot" | null;
  leveragePressure?: number | null;
  rank?: number | null;
  hiddenReason?: string | null;
  triggerText?: string | null;
  invalidationText?: string | null;
  acceptanceText?: string | null;
  rejectionText?: string | null;
  sourceLevel?: ReactionLevel;
}

export interface HiddenPositioningSlotLike {
  id?: string;
  side?: PositioningAggressorSide;
  aggressorSide?: PositioningAggressorSide;
  reason?: string | null;
  detail?: string | null;
  hiddenReason?: string | null;
  windowMs?: number | null;
  rank?: number | null;
}

export interface ReactionZoneLike {
  id?: string;
  price?: number | null;
  zoneLow?: number | null;
  zoneHigh?: number | null;
  role?: string | null;
  tone?: ReactionZoneTone | null;
  confidence?: ReactionConfidence | null;
  confidenceReason?: string | null;
  caveat?: string | null;
  sourceCaveat?: { text?: string | null } | null;
  ageMs?: number | null;
  windowMs?: number | null;
  updatedAt?: number | null;
  notionalUsd?: number | null;
  score?: number | null;
  triggerText?: string | null;
  invalidationText?: string | null;
  acceptanceText?: string | null;
  rejectionText?: string | null;
  evidence?: string[];
  sourceLevel?: ReactionLevel;
}

export type ReactionMapPayloadLike = Partial<ReactionLevelsPayload> & {
  orderBook?: {
    bids?: OrderBookShelfLike[];
    asks?: OrderBookShelfLike[];
    bidShelves?: OrderBookShelfLike[];
    askShelves?: OrderBookShelfLike[];
    shelves?: OrderBookShelfLike[];
  };
  positioning?: {
    buyerInitiatedBuilds?: PositioningZoneLike[];
    sellerInitiatedBuilds?: PositioningZoneLike[];
    buyerZones?: PositioningZoneLike[];
    sellerZones?: PositioningZoneLike[];
    zones?: PositioningZoneLike[];
    hidden?: HiddenPositioningSlotLike[];
    hiddenSlots?: HiddenPositioningSlotLike[];
  };
  reactionZones?: ReactionZoneLike[];
  selectedZone?: PositioningZoneLike | ReactionZoneLike | null;
};

export interface NormalizedOrderBookShelf {
  id: string;
  side: ReactionMapSide;
  price: number;
  zoneLow: number | null;
  zoneHigh: number | null;
  notionalUsd: number | null;
  distancePct: number | null;
  orderCount: number | null;
  sampleCount: number | null;
  freshnessMs: number | null;
  status: string;
  source: "orderBook" | "bookLiquidity";
}

export interface NormalizedPositioningZone {
  id: string;
  side: PositioningSide;
  price: number;
  zoneLow: number | null;
  zoneHigh: number | null;
  role: string;
  confidence: ReactionConfidence | "unknown";
  confidenceReason: string | null;
  caveat: string;
  ageMs: number | null;
  windowMs: number | null;
  notionalUsd: number | null;
  buyNotionalUsd: number | null;
  sellNotionalUsd: number | null;
  imbalanceUsd: number | null;
  imbalanceType: "long_imbalance" | "short_imbalance" | "pivot" | null;
  leveragePressure: number | null;
  rank: number | null;
  triggerText: string | null;
  invalidationText: string | null;
  acceptanceText: string | null;
  rejectionText: string | null;
  source: "positioning" | "oiHolding";
}

export interface NormalizedHiddenPositioningSlot {
  id: string;
  side: PositioningSide;
  reason: string;
  windowMs: number | null;
}

export interface NormalizedReactionZone {
  id: string;
  price: number;
  zoneLow: number | null;
  zoneHigh: number | null;
  role: string;
  tone: ReactionZoneTone;
  confidence: ReactionConfidence | "unknown";
  confidenceReason: string | null;
  caveat: string | null;
  ageMs: number | null;
  windowMs: number | null;
  notionalUsd: number | null;
  score: number | null;
  triggerText: string | null;
  invalidationText: string | null;
  acceptanceText: string | null;
  rejectionText: string | null;
  evidence: string[];
}

export type ReactionMapSelectableZone = NormalizedPositioningZone | NormalizedReactionZone;

export interface NormalizedReactionMap {
  coin: string | null;
  currentPrice: number | null;
  updatedAt: number | null;
  coverageNote: string | null;
  bidShelves: NormalizedOrderBookShelf[];
  askShelves: NormalizedOrderBookShelf[];
  buyerZones: NormalizedPositioningZone[];
  sellerZones: NormalizedPositioningZone[];
  hiddenSlots: NormalizedHiddenPositioningSlot[];
  reactionZones: NormalizedReactionZone[];
}

export type BookBucketInput = ReactionBookBucket | OrderBookShelfLike;
