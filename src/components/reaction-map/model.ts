import { formatChartPrice, formatCompactUsd, formatPct } from "@/lib/format";
import type { ReactionLevel } from "@/lib/reactionLevels";
import type {
  BookBucketInput,
  HiddenPositioningSlotLike,
  NormalizedHiddenPositioningSlot,
  NormalizedOrderBookShelf,
  NormalizedPositioningZone,
  NormalizedReactionMap,
  NormalizedReactionZone,
  OrderBookShelfLike,
  PositioningSide,
  PositioningZoneLike,
  ReactionMapPayloadLike,
  ReactionMapSelectableZone,
  ReactionMapSide,
  ReactionZoneLike,
  ReactionZoneTone,
} from "./types";

const DEFAULT_POSITIONING_CAVEAT = "Inferred from public trades and OI changes, not exact trader positions.";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rangeMidpoint(zoneLow: number | null, zoneHigh: number | null, price: number): number {
  if (zoneLow != null && zoneHigh != null && zoneHigh >= zoneLow) return (zoneLow + zoneHigh) / 2;
  return price;
}

function distancePct(price: number | null, currentPrice: number | null): number | null {
  if (price == null || currentPrice == null || currentPrice <= 0) return null;
  return ((price - currentPrice) / currentPrice) * 100;
}

function normalizeSide(side: unknown, fallback: PositioningSide): PositioningSide {
  if (side === "buyer" || side === "bull" || side === "likely_long" || side === "buyer_initiated") return "buyer";
  if (side === "seller" || side === "bear" || side === "likely_short" || side === "seller_initiated") return "seller";
  return fallback;
}

function normalizeImbalanceType(
  value: unknown,
  buyNotionalUsd: number | null,
  sellNotionalUsd: number | null,
): NormalizedPositioningZone["imbalanceType"] {
  if (value === "long_imbalance" || value === "short_imbalance" || value === "pivot") return value;
  if (buyNotionalUsd == null || sellNotionalUsd == null) return null;
  const imbalanceUsd = buyNotionalUsd - sellNotionalUsd;
  if (Math.abs(imbalanceUsd) <= 100_000) return "pivot";
  return imbalanceUsd > 0 ? "long_imbalance" : "short_imbalance";
}

function normalizeBookSide(side: unknown, fallback: ReactionMapSide): ReactionMapSide {
  if (side === "bid" || side === "buy") return "bid";
  if (side === "ask" || side === "sell") return "ask";
  return fallback;
}

function positioningRole(side: PositioningSide, price: number, currentPrice: number | null): string {
  const above = currentPrice != null ? price > currentPrice : false;
  if (side === "buyer") return above ? "Trapped longs / breakeven supply" : "Long defense";
  return above ? "Short defense" : "Trapped shorts / squeeze fuel";
}

function defaultTrigger(role: string): string {
  if (role === "Long defense") return "Bounce attempt only matters after buyers hold the zone.";
  if (role === "Short defense") return "Shorts have the cleaner read if price rejects inside the zone.";
  if (role.includes("Trapped longs")) return "Bulls need acceptance back above the full zone.";
  if (role.includes("Trapped shorts")) return "Squeeze risk rises if price reclaims and holds the zone.";
  return "Wait for acceptance or rejection at the zone.";
}

function defaultInvalidation(role: string): string {
  if (role === "Long defense") return "Clean acceptance below the zone weakens the defense.";
  if (role === "Short defense") return "Clean acceptance above the zone weakens the short defense.";
  if (role.includes("Trapped longs")) return "Rejection in the zone keeps trapped supply in play.";
  if (role.includes("Trapped shorts")) return "Failure to reclaim keeps the squeeze risk lower.";
  return "Invalidation depends on which side accepts through the zone.";
}

function roleTone(role: string): ReactionZoneTone {
  if (role === "Pivot zone") return "pivot";
  if (role === "Long defense" || role.includes("Trapped shorts")) return "support";
  if (role === "Short defense" || role.includes("Trapped longs")) return "resistance";
  return "pivot";
}

function freshnessMs(updatedAt: number | null | undefined, fallbackUpdatedAt: number | null): number | null {
  const stamp = finiteNumber(updatedAt) ?? fallbackUpdatedAt;
  if (stamp == null) return null;
  return Math.max(0, Date.now() - stamp);
}

function shelfStatus(shelf: OrderBookShelfLike, notionalUsd: number | null): string {
  if (shelf.status) return shelf.status;
  if (shelf.sampleCount != null && shelf.sampleCount >= 4) return "stable";
  if (shelf.sampleCount != null && shelf.sampleCount <= 1) return "thin";
  return notionalUsd != null && notionalUsd > 0 ? "sampled" : "hidden";
}

function normalizeShelf(
  raw: BookBucketInput,
  fallbackSide: ReactionMapSide,
  currentPrice: number | null,
  updatedAt: number | null,
  index: number,
): NormalizedOrderBookShelf | null {
  const shelf = raw as OrderBookShelfLike;
  const price = finiteNumber(shelf.price);
  if (price == null || price <= 0) return null;

  const side = normalizeBookSide(shelf.side, fallbackSide);
  const sideDepth = side === "bid"
    ? finiteNumber(shelf.bidDepthUsd) ?? finiteNumber(shelf.peakBidDepthUsd)
    : finiteNumber(shelf.askDepthUsd) ?? finiteNumber(shelf.peakAskDepthUsd);
  const notionalUsd = finiteNumber(shelf.notionalUsd) ?? finiteNumber(shelf.depthUsd) ?? sideDepth;
  const shelfUpdatedAt = finiteNumber(shelf.updatedAt);

  return {
    id: shelf.id ?? `${side}-${price}-${index}`,
    side,
    price,
    zoneLow: finiteNumber(shelf.zoneLow),
    zoneHigh: finiteNumber(shelf.zoneHigh),
    notionalUsd: notionalUsd ?? finiteNumber(shelf.peakNotionalUsd),
    distancePct: finiteNumber(shelf.distancePct) ?? distancePct(price, currentPrice),
    orderCount: finiteNumber(shelf.orderCount),
    sampleCount: finiteNumber(shelf.sampleCount),
    freshnessMs: finiteNumber(shelf.freshnessMs) ?? finiteNumber(shelf.ageMs) ?? freshnessMs(shelfUpdatedAt, updatedAt),
    status: shelfStatus(shelf, notionalUsd),
    source: "orderBook",
  };
}

function normalizeBookBucket(
  bucket: BookBucketInput,
  side: ReactionMapSide,
  currentPrice: number | null,
  updatedAt: number | null,
  index: number,
): NormalizedOrderBookShelf | null {
  const price = finiteNumber((bucket as OrderBookShelfLike).price);
  if (price == null || price <= 0) return null;

  const raw = bucket as OrderBookShelfLike;
  const notionalUsd =
    side === "bid"
      ? finiteNumber(raw.peakBidDepthUsd) ?? finiteNumber(raw.bidDepthUsd)
      : finiteNumber(raw.peakAskDepthUsd) ?? finiteNumber(raw.askDepthUsd);
  if (notionalUsd == null || notionalUsd <= 0) return null;

  return {
    id: `${side}-book-${price}-${index}`,
    side,
    price,
    zoneLow: null,
    zoneHigh: null,
    notionalUsd,
    distancePct: distancePct(price, currentPrice),
    orderCount: null,
    sampleCount: finiteNumber(raw.sampleCount),
    freshnessMs: freshnessMs(null, updatedAt),
    status: shelfStatus(raw, notionalUsd),
    source: "bookLiquidity",
  };
}

function sortShelves(shelves: NormalizedOrderBookShelf[], limit: number): NormalizedOrderBookShelf[] {
  return [...shelves]
    .sort((a, b) => {
      const notionalDelta = (b.notionalUsd ?? 0) - (a.notionalUsd ?? 0);
      if (Math.abs(notionalDelta) > 1) return notionalDelta;
      return Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity);
    })
    .slice(0, limit);
}

function normalizePositioningZone(
  raw: PositioningZoneLike,
  fallbackSide: PositioningSide,
  currentPrice: number | null,
  updatedAt: number | null,
  windowMs: number | null,
  index: number,
): NormalizedPositioningZone | null {
  const price = finiteNumber(raw.price);
  if (price == null || price <= 0) return null;
  const zoneLow = finiteNumber(raw.zoneLow);
  const zoneHigh = finiteNumber(raw.zoneHigh);
  const midpoint = rangeMidpoint(zoneLow, zoneHigh, price);
  const side = normalizeSide(raw.aggressorSide ?? raw.side, fallbackSide);
  const inferredOiUsd = finiteNumber(raw.inferredOiUsd);
  const recentFlowUsd = finiteNumber(raw.recentFlowUsd) ?? finiteNumber(raw.tradeNotionalUsd);
  const notionalUsd = finiteNumber(raw.notionalUsd) ?? inferredOiUsd ?? recentFlowUsd;
  const buyNotionalUsd = finiteNumber(raw.buyNotionalUsd);
  const sellNotionalUsd = finiteNumber(raw.sellNotionalUsd);
  const imbalanceUsd = finiteNumber(raw.imbalanceUsd) ?? (
    buyNotionalUsd != null && sellNotionalUsd != null ? buyNotionalUsd - sellNotionalUsd : null
  );
  const imbalanceType = normalizeImbalanceType(raw.imbalanceType, buyNotionalUsd, sellNotionalUsd);
  const role =
    raw.roleLabel ||
    (imbalanceType === "pivot" ? "Pivot zone" : raw.role || positioningRole(side, midpoint, currentPrice));

  return {
    id: raw.id ?? `${side}-positioning-${price}-${index}`,
    side,
    price,
    zoneLow,
    zoneHigh,
    role,
    confidence: raw.confidence ?? "unknown",
    confidenceReason: raw.confidenceReason ?? null,
    caveat: raw.caveat ?? raw.sourceCaveat?.text ?? DEFAULT_POSITIONING_CAVEAT,
    ageMs: finiteNumber(raw.ageMs) ?? freshnessMs(raw.updatedAt, updatedAt),
    windowMs: finiteNumber(raw.windowMs) ?? windowMs,
    notionalUsd,
    buyNotionalUsd,
    sellNotionalUsd,
    imbalanceUsd,
    imbalanceType,
    leveragePressure: finiteNumber(raw.leveragePressure),
    rank: finiteNumber(raw.rank),
    triggerText: raw.triggerText ?? null,
    invalidationText: raw.invalidationText ?? null,
    acceptanceText: raw.acceptanceText ?? null,
    rejectionText: raw.rejectionText ?? null,
    source: "positioning",
  };
}

function levelToPositioningZone(
  level: ReactionLevel,
  fallbackSide: PositioningSide,
  currentPrice: number | null,
  updatedAt: number | null,
  windowMs: number | null,
  index: number,
): PositioningZoneLike {
  return {
    id: level.id,
    side: level.zoneSide,
    price: level.price,
    zoneLow: level.zoneLow,
    zoneHigh: level.zoneHigh,
    confidence: level.confidence,
    confidenceReason: level.tooltip?.reasonSelected ?? level.evidence[0] ?? null,
    ageMs: freshnessMs(level.tooltip?.refreshedAtMs, updatedAt),
    windowMs,
    inferredOiUsd: level.components.oiEntryNotionalUsd,
    recentFlowUsd: level.components.tradeNotionalUsd,
    buyNotionalUsd: level.components.buyNotionalUsd,
    sellNotionalUsd: level.components.sellNotionalUsd,
    imbalanceUsd: level.tooltip?.imbalanceUsd ?? level.components.buyNotionalUsd - level.components.sellNotionalUsd,
    imbalanceType: level.tooltip?.imbalanceType,
    leveragePressure: level.tooltip?.leveragePressure,
    rank: level.zoneRank ?? level.tooltip?.rank ?? index + 1,
    sourceLevel: level,
  };
}

function normalizeHiddenSlot(
  raw: HiddenPositioningSlotLike,
  fallbackSide: PositioningSide,
  index: number,
): NormalizedHiddenPositioningSlot {
  const side = normalizeSide(raw.aggressorSide ?? raw.side, fallbackSide);
  return {
    id: raw.id ?? `${side}-hidden-${raw.rank ?? index}`,
    side,
    reason: raw.reason || raw.detail || raw.hiddenReason || "Hidden: below confidence cutoff.",
    windowMs: finiteNumber(raw.windowMs),
  };
}

function defaultHiddenSlots(
  side: PositioningSide,
  visibleCount: number,
  limit: number,
  windowMs: number | null,
): NormalizedHiddenPositioningSlot[] {
  const missing = Math.max(0, limit - visibleCount);
  if (missing === 0) return [];
  const reason =
    visibleCount === 0
      ? `No reliable ${side === "buyer" ? "buyer" : "seller"} build in this window.`
      : "Hidden: below confidence cutoff.";
  return Array.from({ length: missing }, (_, index) => ({
    id: `${side}-generated-hidden-${index + 1}`,
    side,
    reason,
    windowMs,
  }));
}

function normalizeReactionZone(
  raw: ReactionZoneLike,
  currentPrice: number | null,
  updatedAt: number | null,
  windowMs: number | null,
  index: number,
): NormalizedReactionZone | null {
  const price = finiteNumber(raw.price);
  if (price == null || price <= 0) return null;
  const zoneLow = finiteNumber(raw.zoneLow);
  const zoneHigh = finiteNumber(raw.zoneHigh);
  const role = raw.role || (currentPrice != null && price >= currentPrice ? "Upside reaction" : "Downside reaction");

  return {
    id: raw.id ?? `reaction-zone-${price}-${index}`,
    price,
    zoneLow,
    zoneHigh,
    role,
    tone: raw.tone ?? roleTone(role),
    confidence: raw.confidence ?? "unknown",
    confidenceReason: raw.confidenceReason ?? null,
    caveat: raw.caveat ?? raw.sourceCaveat?.text ?? null,
    ageMs: finiteNumber(raw.ageMs) ?? freshnessMs(raw.updatedAt, updatedAt),
    windowMs: finiteNumber(raw.windowMs) ?? windowMs,
    notionalUsd: finiteNumber(raw.notionalUsd),
    score: finiteNumber(raw.score),
    triggerText: raw.triggerText ?? null,
    invalidationText: raw.invalidationText ?? null,
    acceptanceText: raw.acceptanceText ?? null,
    rejectionText: raw.rejectionText ?? null,
    evidence: raw.evidence ?? [],
  };
}

function levelToReactionZone(level: ReactionLevel): ReactionZoneLike {
  return {
    id: level.id,
    price: level.price,
    zoneLow: level.zoneLow,
    zoneHigh: level.zoneHigh,
    role: level.evidence.at(-1) ?? "Reaction zone",
    tone:
      level.directionBias === "up"
        ? "support"
        : level.directionBias === "down"
          ? "resistance"
          : "pivot",
    confidence: level.confidence,
    notionalUsd: Math.max(
      level.components.bookDepthUsd,
      level.components.tradeNotionalUsd,
      level.components.oiEntryNotionalUsd,
      level.components.trackedLiqNotionalUsd,
    ),
    score: level.score,
    evidence: level.evidence,
    sourceLevel: level,
  };
}

export function normalizeReactionMap(payload: ReactionMapPayloadLike | null | undefined, limit = 5): NormalizedReactionMap {
  const currentPrice = finiteNumber(payload?.currentPrice);
  const updatedAt = finiteNumber(payload?.updatedAt);
  const windowMs = finiteNumber(payload?.windowMs);
  const coverageNote = typeof payload?.coverage?.note === "string" ? payload.coverage.note : null;

  const directBidShelves = [
    ...(payload?.orderBook?.bids ?? []),
    ...(payload?.orderBook?.bidShelves ?? []),
    ...(payload?.orderBook?.shelves ?? []).filter((shelf) => normalizeBookSide(shelf.side, "bid") === "bid"),
  ];
  const directAskShelves = [
    ...(payload?.orderBook?.asks ?? []),
    ...(payload?.orderBook?.askShelves ?? []),
    ...(payload?.orderBook?.shelves ?? []).filter((shelf) => normalizeBookSide(shelf.side, "ask") === "ask"),
  ];

  const bucketShelves = payload?.overlays?.bookLiquidity ?? [];
  const bidShelves = sortShelves(
    directBidShelves.length > 0
      ? directBidShelves
          .map((shelf, index) => normalizeShelf(shelf, "bid", currentPrice, updatedAt, index))
          .filter((shelf): shelf is NormalizedOrderBookShelf => shelf != null)
      : bucketShelves
          .map((bucket, index) => normalizeBookBucket(bucket, "bid", currentPrice, updatedAt, index))
          .filter((shelf): shelf is NormalizedOrderBookShelf => shelf != null),
    limit,
  );
  const askShelves = sortShelves(
    directAskShelves.length > 0
      ? directAskShelves
          .map((shelf, index) => normalizeShelf(shelf, "ask", currentPrice, updatedAt, index))
          .filter((shelf): shelf is NormalizedOrderBookShelf => shelf != null)
      : bucketShelves
          .map((bucket, index) => normalizeBookBucket(bucket, "ask", currentPrice, updatedAt, index))
          .filter((shelf): shelf is NormalizedOrderBookShelf => shelf != null),
    limit,
  );

  const directZones = payload?.positioning?.zones ?? [];
  const buyerInputs =
    payload?.positioning?.buyerInitiatedBuilds ??
    payload?.positioning?.buyerZones ??
    directZones.filter((zone) => normalizeSide(zone.side, "buyer") === "buyer");
  const sellerInputs =
    payload?.positioning?.sellerInitiatedBuilds ??
    payload?.positioning?.sellerZones ??
    directZones.filter((zone) => normalizeSide(zone.side, "seller") === "seller");
  const buyerLevels = payload?.overlayLevels?.oiHoldingBull ?? [];
  const sellerLevels = payload?.overlayLevels?.oiHoldingBear ?? [];

  const buyerZones = (buyerInputs.length > 0 ? buyerInputs : buyerLevels.map((level, index) => levelToPositioningZone(level, "buyer", currentPrice, updatedAt, windowMs, index)))
    .map((zone, index) => normalizePositioningZone(zone, "buyer", currentPrice, updatedAt, windowMs, index))
    .filter((zone): zone is NormalizedPositioningZone => zone != null)
    .slice(0, limit);
  const sellerZones = (sellerInputs.length > 0 ? sellerInputs : sellerLevels.map((level, index) => levelToPositioningZone(level, "seller", currentPrice, updatedAt, windowMs, index)))
    .map((zone, index) => normalizePositioningZone(zone, "seller", currentPrice, updatedAt, windowMs, index))
    .filter((zone): zone is NormalizedPositioningZone => zone != null)
    .slice(0, limit);

  const explicitHidden = (payload?.positioning?.hidden ?? payload?.positioning?.hiddenSlots ?? []).map((slot, index) =>
    normalizeHiddenSlot(slot, normalizeSide(slot.side, "buyer"), index),
  );
  const generatedHidden =
    explicitHidden.length > 0
      ? []
      : [
          ...defaultHiddenSlots("buyer", buyerZones.length, limit, windowMs),
          ...defaultHiddenSlots("seller", sellerZones.length, limit, windowMs),
        ];
  const hiddenSlots = [...explicitHidden, ...generatedHidden].filter(
    (slot, index, all) => all.findIndex((candidate) => candidate.id === slot.id) === index,
  );

  const reactionInputs = payload?.reactionZones ?? (payload?.levels ?? []).map(levelToReactionZone);
  const reactionZones = reactionInputs
    .map((zone, index) => normalizeReactionZone(zone, currentPrice, updatedAt, windowMs, index))
    .filter((zone): zone is NormalizedReactionZone => zone != null);

  return {
    coin: payload?.coin ?? null,
    currentPrice,
    updatedAt,
    coverageNote,
    bidShelves,
    askShelves,
    buyerZones,
    sellerZones,
    hiddenSlots,
    reactionZones,
  };
}

export function zoneRangeLabel(zone: { price: number; zoneLow: number | null; zoneHigh: number | null }): string {
  if (zone.zoneLow != null && zone.zoneHigh != null && zone.zoneHigh > zone.zoneLow) {
    return `${formatChartPrice(zone.zoneLow)}-${formatChartPrice(zone.zoneHigh)}`;
  }
  return formatChartPrice(zone.price);
}

export function ageLabel(ageMs: number | null): string {
  if (ageMs == null) return "age n/a";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

export function windowLabel(windowMs: number | null): string {
  if (windowMs == null) return "window n/a";
  const minutes = Math.round(windowMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

export function shelfMeta(shelf: NormalizedOrderBookShelf): string {
  const parts = [formatCompactUsd(shelf.notionalUsd), formatPct(shelf.distancePct)];
  if (shelf.orderCount != null) parts.push(`${shelf.orderCount} orders`);
  else if (shelf.sampleCount != null) parts.push(`${shelf.sampleCount} samples`);
  return parts.filter((part) => part !== "n/a").join(" / ");
}

export function selectedZoneRead(zone: ReactionMapSelectableZone): {
  trigger: string;
  invalidation: string;
  acceptance: string | null;
  rejection: string | null;
} {
  return {
    trigger: zone.triggerText || defaultTrigger(zone.role),
    invalidation: zone.invalidationText || defaultInvalidation(zone.role),
    acceptance: zone.acceptanceText,
    rejection: zone.rejectionText,
  };
}
