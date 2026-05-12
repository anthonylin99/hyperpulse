import { Pool } from "pg";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import {
  buildReactionLevels,
  withStructuredReactionPayloadSections,
  type ReactionBookBucket,
  type ReactionConfidence,
  type ReactionExposureSide,
  type ReactionLevel,
  type ReactionLevelsPayload,
  type ReactionMarketContext,
  type ReactionPrimarySource,
  type ReactionTrackedLiquidationBucket,
  type ReactionTradeBucket,
} from "@/lib/reactionLevels";

const DATABASE_URL = getPooledDatabaseUrl();
const STORE_BACKOFF_MS = 5 * 60 * 1000;
const CANDIDATE_RANGE_MULTIPLIER = 3;
const CANDIDATE_RANGE_MIN_PCT = 12;
const CANDIDATE_RANGE_MAX_PCT = 45;
const POSITIONING_PIVOT_NET_USD = 100_000;
const WORKER_ZONE_CARRY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DISPLAY_ZONES_PER_SIDE = 5;

let pool: Pool | null = null;
let disabledUntil = 0;

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + STORE_BACKOFF_MS;
  console.warn("[reaction-level-store] unavailable", error);
}

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return pool;
}

export function isReactionLevelStoreConfigured(): boolean {
  return Boolean(getPool());
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function movementCandidateRangePct(rows: Array<Record<string, unknown>>, currentPrice: number): number {
  const prices = rows
    .map((row) => asNumber(row.mark_px))
    .filter((price): price is number => price != null && price > 0);
  if (prices.length < 2 || currentPrice <= 0) return CANDIDATE_RANGE_MIN_PCT;

  const moves: number[] = [];
  for (let index = 1; index < prices.length; index += 1) {
    moves.push(((prices[index] - prices[index - 1]) / currentPrice) * 100);
  }
  if (moves.length === 0) return CANDIDATE_RANGE_MIN_PCT;

  const mean = moves.reduce((sum, value) => sum + value, 0) / moves.length;
  const averageAbsMovePct = moves.reduce((sum, value) => sum + Math.abs(value), 0) / moves.length;
  const variance = moves.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / moves.length;
  const movePct = Math.max(averageAbsMovePct, Math.sqrt(variance));
  const rangePct = movePct * CANDIDATE_RANGE_MULTIPLIER;
  return Math.min(CANDIDATE_RANGE_MAX_PCT, Math.max(CANDIDATE_RANGE_MIN_PCT, rangePct));
}

function priceRangeFromPct(currentPrice: number, rangePct: number): { low: number; high: number } {
  const pct = Math.max(rangePct, 0) / 100;
  return {
    low: currentPrice * Math.max(0.01, 1 - pct),
    high: currentPrice * (1 + pct),
  };
}

function emptyPayload(coin: string, windowMs: number): ReactionLevelsPayload {
  const now = Date.now();
  return withStructuredReactionPayloadSections({
    coin,
    currentPrice: null,
    windowMs,
    sourceWindowMs: windowMs,
    updatedAt: now,
    generatedAt: now,
    source: "empty",
    algorithmVersion: "reaction-map-v2.1.0",
    coverage: {
      marketStreams: false,
      trackedWalletSample: false,
      exactPositions: false,
      note: "Reaction Map is waiting for public Hyperliquid stream buckets. It does not claim exact exchange-wide positions.",
    },
    levels: [],
    overlayLevels: {
      oiHolding: [],
      oiHoldingBull: [],
      oiHoldingBear: [],
    },
    overlays: {
      bookLiquidity: [],
      tradeConcentration: [],
      oiEntryProfile: [],
      trackedLiquidations: [],
    },
  });
}

function normalizeBookBucket(row: Record<string, unknown>): ReactionBookBucket | null {
  const price = asNumber(row.price_bucket);
  if (price == null || price <= 0) return null;
  return {
    price,
    bucketSize: asNumber(row.bucket_size) ?? 0,
    bidDepthUsd: Math.max(asNumber(row.bid_depth_usd) ?? 0, 0),
    askDepthUsd: Math.max(asNumber(row.ask_depth_usd) ?? 0, 0),
    peakBidDepthUsd: Math.max(asNumber(row.peak_bid_depth_usd) ?? 0, 0),
    peakAskDepthUsd: Math.max(asNumber(row.peak_ask_depth_usd) ?? 0, 0),
    sampleCount: Math.max(Math.round(asNumber(row.sample_count) ?? 0), 0),
  };
}

function normalizeTradeBucket(row: Record<string, unknown>): ReactionTradeBucket | null {
  const price = asNumber(row.price_bucket);
  if (price == null || price <= 0) return null;
  return {
    price,
    bucketSize: asNumber(row.bucket_size) ?? 0,
    buyNotionalUsd: Math.max(asNumber(row.buy_notional_usd) ?? 0, 0),
    sellNotionalUsd: Math.max(asNumber(row.sell_notional_usd) ?? 0, 0),
    tradeCount: Math.max(Math.round(asNumber(row.trade_count) ?? 0), 0),
    uniqueTraderCount: Math.max(Math.round(asNumber(row.unique_trader_count) ?? 0), 0),
  };
}

function normalizeSide(value: unknown): ReactionExposureSide {
  return value === "bear" ? "bear" : "bull";
}

function normalizeConfidence(value: unknown): ReactionConfidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function normalizePrimarySource(value: unknown): ReactionPrimarySource {
  if (value === "book" || value === "stress" || value === "mixed" || value === "positioning") return value;
  return "positioning";
}

function compactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1_000_000) return `$${(Math.abs(value) / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(Math.abs(value) / 1_000).toFixed(1)}K`;
  return `$${Math.abs(value).toFixed(0)}`;
}

function leveragePressureForDistance(distancePct: number): number {
  if (!Number.isFinite(distancePct)) return 1;
  const distance = Math.max(Math.abs(distancePct), 0.25);
  return Number(Math.min(50, Math.max(1, 100 / distance)).toFixed(1));
}

function rowEvidenceAt(row: Record<string, unknown>): number {
  return asNumber(row.last_seen_at) ?? asNumber(row.refreshed_at) ?? asNumber(row.generated_at) ?? 0;
}

function rankExposureRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown> & { displayRank: number }> {
  const selected: Array<Record<string, unknown> & { displayRank: number }> = [];
  const seenRanges = new Set<string>();

  for (const side of ["bull", "bear"]) {
    const sideRows = rows
      .filter((row) => normalizeSide(row.side) === side)
      .sort((a, b) => {
        const aActive = String(a.status ?? "active") === "active" ? 0 : 1;
        const bActive = String(b.status ?? "active") === "active" ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;

        const aRank = Math.max(Math.round(asNumber(a.rank) ?? DISPLAY_ZONES_PER_SIDE + 1), 1);
        const bRank = Math.max(Math.round(asNumber(b.rank) ?? DISPLAY_ZONES_PER_SIDE + 1), 1);
        if (aActive === 0 && aRank !== bRank) return aRank - bRank;

        const aScore = asNumber(a.score) ?? 0;
        const bScore = asNumber(b.score) ?? 0;
        if (aScore !== bScore) return bScore - aScore;

        const aFlow = asNumber(a.trade_notional_usd) ?? 0;
        const bFlow = asNumber(b.trade_notional_usd) ?? 0;
        if (aFlow !== bFlow) return bFlow - aFlow;

        return rowEvidenceAt(b) - rowEvidenceAt(a);
      });

    let rank = 1;
    for (const row of sideRows) {
      if (rank > DISPLAY_ZONES_PER_SIDE) break;
      const zoneLow = asNumber(row.zone_low) ?? asNumber(row.weighted_price) ?? 0;
      const zoneHigh = asNumber(row.zone_high) ?? asNumber(row.weighted_price) ?? 0;
      const rangeKey = `${side}:${Math.round(zoneLow)}:${Math.round(zoneHigh)}`;
      if (seenRanges.has(rangeKey)) continue;
      seenRanges.add(rangeKey);
      selected.push({ ...row, displayRank: rank });
      rank += 1;
    }
  }

  return selected;
}

async function readCurrentExposureZones(client: Pool, asset: string, windowMs: number): Promise<ReactionLevelsPayload | null> {
  try {
    // Active worker zones can be one-sided during a fast tape. Fill the displayed
    // ladder with recent retired rows so long and short imbalance levels do not
    // disappear just because the latest public-flow window leaned one way.
    const carryCutoff = Date.now() - WORKER_ZONE_CARRY_LOOKBACK_MS;
    const result = await client.query(
      `
      select *
      from reaction_exposure_zones_current
      where asset = $1
        and window_ms = $2
        and (
          status = 'active'
          or coalesce(last_seen_at, refreshed_at, generated_at) >= $3
        )
      order by side asc, status asc, rank asc nulls last
      `,
      [asset, windowMs, carryCutoff],
    );
    if (result.rows.length === 0) return null;

    const selectedRows = rankExposureRows(result.rows as Array<Record<string, unknown>>);
    if (selectedRows.length === 0) return null;

    const priceRow = [...selectedRows].sort(
      (a, b) => (asNumber(b.refreshed_at) ?? asNumber(b.generated_at) ?? 0) - (asNumber(a.refreshed_at) ?? asNumber(a.generated_at) ?? 0),
    )[0];
    const currentPrice = asNumber(priceRow?.current_price);
    if (currentPrice == null || currentPrice <= 0) return null;
    const updatedAt = Math.max(
      ...selectedRows.map((row) => asNumber(row.refreshed_at) ?? asNumber(row.generated_at) ?? rowEvidenceAt(row)),
    );
    const levels = selectedRows.map((row) => {
      const side = normalizeSide(row.side);
      const status = String(row.status ?? "active");
      const rank = Math.max(Math.round(asNumber(row.displayRank) ?? asNumber(row.rank) ?? 0), 1);
      const tradeNotionalUsd = Math.max(asNumber(row.trade_notional_usd) ?? 0, 0);
      const inferredOiUsd = Math.max(asNumber(row.inferred_oi_notional_usd) ?? 0, 0);
      const buyNotionalUsd = Math.max(asNumber(row.buy_notional_usd) ?? 0, 0);
      const sellNotionalUsd = Math.max(asNumber(row.sell_notional_usd) ?? 0, 0);
      const imbalanceUsd = buyNotionalUsd - sellNotionalUsd;
      const tooltip = row.tooltip && typeof row.tooltip === "object" ? row.tooltip as Record<string, unknown> : {};
      const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
      const rawImbalanceType = tooltip.imbalanceType ?? payload.imbalanceType;
      const imbalanceType =
        rawImbalanceType === "long_imbalance" || rawImbalanceType === "short_imbalance" || rawImbalanceType === "pivot"
          ? rawImbalanceType
          : Math.abs(imbalanceUsd) <= POSITIONING_PIVOT_NET_USD
            ? "pivot"
            : imbalanceUsd > 0
              ? "long_imbalance"
              : "short_imbalance";
      const zoneLow = asNumber(row.zone_low) ?? asNumber(row.weighted_price) ?? currentPrice;
      const zoneHigh = asNumber(row.zone_high) ?? asNumber(row.weighted_price) ?? currentPrice;
      const price = asNumber(row.weighted_price) ?? asNumber(row.zone_mid) ?? (zoneLow + zoneHigh) / 2;
      const distancePct = asNumber(row.distance_pct) ?? ((price - currentPrice) / currentPrice) * 100;
      const dynamicZoneWidthPct = asNumber(payload.dynamicZoneWidthPct) ?? asNumber(tooltip.dynamicZoneWidthPct);
      const carriedForward =
        status !== "active" ||
        tooltip.carriedForward === true ||
        payload.carriedForward === true;
      const reasonSelected =
        typeof tooltip.reasonSelected === "string"
          ? tooltip.reasonSelected
          : carriedForward
            ? "Carried forward because no public stream proves this inferred zone was unwound."
            : imbalanceType === "pivot"
              ? `Pivot zone: buy/sell net is within ${compactUsd(POSITIONING_PIVOT_NET_USD)}`
              : `Top ${side === "bull" ? "buyer-initiated" : "seller-initiated"} inferred OI build`;
      const evidence = [
        `${distancePct >= 0 ? "+" : ""}${distancePct.toFixed(1)}%`,
        `${compactUsd(tradeNotionalUsd)} recent flow`,
        `${compactUsd(inferredOiUsd)} inferred OI build`,
        side === "bull" ? "Buyer-initiated inferred build" : "Seller-initiated inferred build",
        reasonSelected,
        "Not exact open positions",
      ];

      return {
        id: String(row.zone_id),
        price,
        zoneLow,
        zoneHigh,
        zoneSide: side,
        zoneRank: rank,
        distancePct,
        reactionLabel: "two_way_chop" as const,
        directionBias: "two_way" as const,
        confidence: normalizeConfidence(row.confidence),
        score: Math.round(asNumber(row.score) ?? 0),
        primarySource: normalizePrimarySource(row.primary_source),
        coverage: ["market_streams" as const],
        evidence,
        tooltip: {
          rank,
          side,
          totalRecentFlowUsd: tradeNotionalUsd,
          inferredOiUsd,
          buyNotionalUsd,
          sellNotionalUsd,
          imbalanceUsd,
          imbalanceType,
          leveragePressure:
            asNumber(tooltip.leveragePressure) ?? asNumber(payload.leveragePressure) ?? leveragePressureForDistance(distancePct),
          pivotThresholdUsd:
            asNumber(tooltip.pivotThresholdUsd) ?? asNumber(payload.pivotThresholdUsd) ?? POSITIONING_PIVOT_NET_USD,
          reasonSelected,
          refreshedAtMs: asNumber(row.refreshed_at) ?? updatedAt,
          lastEvidenceAtMs: rowEvidenceAt(row),
          carriedForward,
          sourceCaveat: "Inferred from public Hyperliquid streams, not exact open positions.",
          windowMs,
          hiddenReason: status === "stale" ? "stale" as const : undefined,
          dynamicZoneWidthPct: dynamicZoneWidthPct ?? undefined,
        },
        windowMs,
        ageMs: Math.max(Date.now() - (asNumber(row.refreshed_at) ?? rowEvidenceAt(row)), 0),
        hiddenReason: status === "stale" ? "stale" as const : undefined,
        sourceCaveat: {
          exactPositions: false as const,
          source: "worker_exposure_zones" as const,
          text: "Worker-built zones are inferred from public Hyperliquid trades plus OI changes. They are not exact exchange-wide positions.",
        },
        components: {
          bookDepthUsd: Math.max(asNumber(row.book_notional_usd) ?? 0, 0),
          tradeNotionalUsd,
          oiEntryNotionalUsd: inferredOiUsd,
          trackedLiqNotionalUsd: Math.max(asNumber(row.tracked_liq_notional_usd) ?? 0, 0),
          fundingBias: 0,
          buyNotionalUsd,
          sellNotionalUsd,
          bidDepthUsd: Math.max(asNumber(row.bid_depth_usd) ?? 0, 0),
          askDepthUsd: Math.max(asNumber(row.ask_depth_usd) ?? 0, 0),
          longLiqNotionalUsd: 0,
          shortLiqNotionalUsd: 0,
          uniqueTraderCount: Math.max(Math.round(asNumber(row.wallet_count) ?? 0), 0),
        },
      } satisfies ReactionLevel;
    });
    const bull = levels.filter((level) => level.zoneSide === "bull").sort((a, b) => (a.zoneRank ?? 0) - (b.zoneRank ?? 0));
    const bear = levels.filter((level) => level.zoneSide === "bear").sort((a, b) => (a.zoneRank ?? 0) - (b.zoneRank ?? 0));
    const sorted = [...bull, ...bear].sort((a, b) => a.price - b.price);

    return withStructuredReactionPayloadSections({
      coin: asset,
      currentPrice,
      windowMs,
      sourceWindowMs: windowMs,
      updatedAt,
      generatedAt: updatedAt,
      source: "worker_promoted",
      algorithmVersion: "reaction-map-v2.1.0",
      coverage: {
        marketStreams: true,
        trackedWalletSample: false,
        exactPositions: false,
        note: "Reaction Map reads worker-built current exposure zones from public Hyperliquid streams. It does not claim exact exchange-wide positions.",
      },
      levels: sorted,
      overlayLevels: {
        oiHolding: sorted,
        oiHoldingBull: bull,
        oiHoldingBear: bear,
      },
      overlays: {
        bookLiquidity: [],
        tradeConcentration: [],
        oiEntryProfile: sorted.map((level) => ({
          price: level.price,
          inferredNotionalUsd: level.components.oiEntryNotionalUsd,
          side:
            level.zoneSide === "bull"
              ? ("likely_long" as const)
              : level.zoneSide === "bear"
                ? ("likely_short" as const)
                : ("mixed" as const),
        })),
        trackedLiquidations: [],
      },
    });
  } catch (error) {
    if (typeof error === "object" && error != null && "code" in error && error.code === "42P01") return null;
    throw error;
  }
}

function mergeCurrentZonesWithStreamPayload(
  currentZones: ReactionLevelsPayload | null,
  streamPayload: ReactionLevelsPayload,
): ReactionLevelsPayload {
  if (!currentZones) return streamPayload;

  const currentZoneIds = new Set(currentZones.levels.map((level) => level.id));
  const streamLevels = streamPayload.levels.filter(
    (level) => level.primarySource !== "positioning" && !currentZoneIds.has(level.id),
  );
  const levels = [...currentZones.levels, ...streamLevels].sort((a, b) => {
    if (a.primarySource !== b.primarySource) {
      if (a.primarySource === "positioning") return -1;
      if (b.primarySource === "positioning") return 1;
    }
    return a.price - b.price;
  });

  return withStructuredReactionPayloadSections({
    ...streamPayload,
    currentPrice: currentZones.currentPrice ?? streamPayload.currentPrice,
    updatedAt: Math.max(currentZones.updatedAt, streamPayload.updatedAt),
    generatedAt: Date.now(),
    source: "worker_promoted_plus_stream_buckets",
    algorithmVersion: currentZones.algorithmVersion || streamPayload.algorithmVersion || "reaction-map-v2.1.0",
    coverage: {
      marketStreams: currentZones.coverage.marketStreams || streamPayload.coverage.marketStreams,
      trackedWalletSample: currentZones.coverage.trackedWalletSample || streamPayload.coverage.trackedWalletSample,
      exactPositions: false,
      note: "Reaction Map combines worker-built inferred positioning zones with raw public-stream book shelves. It does not claim exact exchange-wide positions.",
    },
    levels,
    overlayLevels: currentZones.overlayLevels,
    overlays: {
      ...streamPayload.overlays,
      oiEntryProfile:
        currentZones.overlays.oiEntryProfile.length > 0
          ? currentZones.overlays.oiEntryProfile
          : streamPayload.overlays.oiEntryProfile,
    },
  });
}

export async function getReactionLevelMap(args: {
  coin: string;
  windowMs: number;
}): Promise<ReactionLevelsPayload> {
  const asset = args.coin.toUpperCase();
  const client = getPool();
  if (!client) return emptyPayload(asset, args.windowMs);

  const cutoff = Date.now() - args.windowMs;

  try {
    const currentZones = await readCurrentExposureZones(client, asset, args.windowMs);

    const latestContextResult = await client.query(
      `
      select *
      from reaction_context_snapshots
      where asset = $1
        and bucket_ms >= $2
      order by captured_at desc
      limit 1
      `,
      [asset, cutoff],
    );
    const latestContext = latestContextResult.rows[0] as Record<string, unknown> | undefined;
    if (!latestContext) return currentZones ?? emptyPayload(asset, args.windowMs);
    const currentPrice = asNumber(latestContext?.mark_px) ?? asNumber(latestContext?.mid_px) ?? asNumber(latestContext?.oracle_px);
    if (currentPrice == null || currentPrice <= 0) return currentZones ?? emptyPayload(asset, args.windowMs);

    const movementResult = await client.query(
      `
      select mark_px
      from reaction_context_snapshots
      where asset = $1
        and bucket_ms >= $2
        and mark_px > 0
      order by bucket_ms asc
      `,
      [asset, cutoff],
    );
    const candidateRange = priceRangeFromPct(
      currentPrice,
      movementCandidateRangePct(movementResult.rows as Array<Record<string, unknown>>, currentPrice),
    );

    const [earliestContextResult, oiDeltaResult, bookResult, tradeResult] = await Promise.all([
      client.query(
        `
        select open_interest_usd
        from reaction_context_snapshots
        where asset = $1
          and bucket_ms >= $2
          and open_interest_usd is not null
        order by captured_at asc
        limit 1
        `,
        [asset, cutoff],
      ),
      client.query(
        `
        select sum(greatest(coalesce(open_interest_delta_usd, 0), 0)) as positive_open_interest_delta_usd
        from reaction_context_snapshots
        where asset = $1
          and bucket_ms >= $2
        `,
        [asset, cutoff],
      ),
      client.query(
        `
        select
          price_bucket,
          max(bucket_size) as bucket_size,
          sum(bid_notional_usd) / nullif(sum(greatest(sample_count, 1)), 0) as bid_depth_usd,
          sum(ask_notional_usd) / nullif(sum(greatest(sample_count, 1)), 0) as ask_depth_usd,
          max(peak_bid_notional_usd) as peak_bid_depth_usd,
          max(peak_ask_notional_usd) as peak_ask_depth_usd,
          sum(sample_count) as sample_count
        from reaction_orderbook_buckets
        where asset = $1
          and bucket_ms >= $2
          and price_bucket between $3 and $4
        group by price_bucket
        order by greatest(
          coalesce(max(peak_bid_notional_usd), 0),
          coalesce(max(peak_ask_notional_usd), 0)
        ) desc
        limit 260
        `,
        [asset, cutoff, candidateRange.low, candidateRange.high],
      ),
      client.query(
        `
        select
          price_bucket,
          max(bucket_size) as bucket_size,
          sum(buy_notional_usd) as buy_notional_usd,
          sum(sell_notional_usd) as sell_notional_usd,
          sum(trade_count) as trade_count,
          max(unique_trader_count) as unique_trader_count
        from reaction_trade_buckets
        where asset = $1
          and bucket_ms >= $2
          and price_bucket between $3 and $4
        group by price_bucket
        order by sum(buy_notional_usd + sell_notional_usd) desc
        limit 260
        `,
        [asset, cutoff, candidateRange.low, candidateRange.high],
      ),
    ]);

    const earliestOpenInterestUsd = asNumber(earliestContextResult.rows[0]?.open_interest_usd);
    const latestOpenInterestUsd = asNumber(latestContext.open_interest_usd);
    const positiveOpenInterestDeltaUsd = asNumber(oiDeltaResult.rows[0]?.positive_open_interest_delta_usd);
    const context: ReactionMarketContext = {
      fundingAPR: asNumber(latestContext.funding_apr),
      openInterestUsd: latestOpenInterestUsd,
      openInterestDeltaUsd:
        earliestOpenInterestUsd != null && latestOpenInterestUsd != null
          ? latestOpenInterestUsd - earliestOpenInterestUsd
          : asNumber(latestContext.open_interest_delta_usd),
      positiveOpenInterestDeltaUsd,
    };
    const bookBuckets = bookResult.rows
      .map((row) => normalizeBookBucket(row as Record<string, unknown>))
      .filter((bucket): bucket is ReactionBookBucket => bucket != null);
    const tradeBuckets = tradeResult.rows
      .map((row) => normalizeTradeBucket(row as Record<string, unknown>))
      .filter((bucket): bucket is ReactionTradeBucket => bucket != null);
    const trackedLiquidations: ReactionTrackedLiquidationBucket[] = [];
    const payload = buildReactionLevels({
      coin: asset,
      currentPrice,
      windowMs: args.windowMs,
      updatedAt: Date.now(),
      context,
      bookBuckets,
      tradeBuckets,
      trackedLiquidations,
    });

    return mergeCurrentZonesWithStreamPayload(currentZones, payload);
  } catch (error) {
    markStoreUnavailable(error);
    return emptyPayload(asset, args.windowMs);
  }
}
