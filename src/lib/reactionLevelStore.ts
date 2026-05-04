import { Pool } from "pg";
import {
  buildReactionLevels,
  type ReactionBookBucket,
  type ReactionConfidence,
  type ReactionExposureSide,
  type ReactionLevelsPayload,
  type ReactionMarketContext,
  type ReactionPrimarySource,
  type ReactionTrackedLiquidationBucket,
  type ReactionTradeBucket,
} from "@/lib/reactionLevels";
import { listTrackedLiquidationBuckets } from "@/lib/whaleStore";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const STORE_BACKOFF_MS = 5 * 60 * 1000;
const TRACKED_LIQ_MAX_AGE_MS = 45 * 60 * 1000;

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

function emptyPayload(coin: string, windowMs: number): ReactionLevelsPayload {
  return {
    coin,
    currentPrice: null,
    windowMs,
    updatedAt: Date.now(),
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
  };
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

function normalizeTrackedLiquidation(bucket: {
  price: number;
  side: "long_liq" | "short_liq";
  totalNotionalUsd: number;
  walletCount: number;
  positionCount: number;
  weightedAvgLeverage: number | null;
}): ReactionTrackedLiquidationBucket {
  return {
    price: bucket.price,
    side: bucket.side,
    notionalUsd: bucket.totalNotionalUsd,
    walletCount: bucket.walletCount,
    positionCount: bucket.positionCount,
    weightedAvgLeverage: bucket.weightedAvgLeverage,
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

async function readCurrentExposureZones(client: Pool, asset: string, windowMs: number): Promise<ReactionLevelsPayload | null> {
  try {
    const result = await client.query(
      `
      select *
      from reaction_exposure_zones_current
      where asset = $1
        and window_ms = $2
        and status <> 'retired'
      order by side asc, rank asc
      `,
      [asset, windowMs],
    );
    if (result.rows.length === 0) return null;

    const currentPrice = asNumber(result.rows[0]?.current_price);
    if (currentPrice == null || currentPrice <= 0) return null;
    const updatedAt = Math.max(
      ...result.rows.map((row) => asNumber(row.refreshed_at) ?? asNumber(row.generated_at) ?? 0),
    );
    const levels = result.rows.map((row) => {
      const side = normalizeSide(row.side);
      const rank = Math.max(Math.round(asNumber(row.rank) ?? 0), 1);
      const tradeNotionalUsd = Math.max(asNumber(row.trade_notional_usd) ?? 0, 0);
      const inferredOiUsd = Math.max(asNumber(row.inferred_oi_notional_usd) ?? 0, 0);
      const buyNotionalUsd = Math.max(asNumber(row.buy_notional_usd) ?? 0, 0);
      const sellNotionalUsd = Math.max(asNumber(row.sell_notional_usd) ?? 0, 0);
      const zoneLow = asNumber(row.zone_low) ?? asNumber(row.weighted_price) ?? currentPrice;
      const zoneHigh = asNumber(row.zone_high) ?? asNumber(row.weighted_price) ?? currentPrice;
      const price = asNumber(row.weighted_price) ?? asNumber(row.zone_mid) ?? (zoneLow + zoneHigh) / 2;
      const distancePct = asNumber(row.distance_pct) ?? ((price - currentPrice) / currentPrice) * 100;
      const reasonSelected =
        typeof row.tooltip?.reasonSelected === "string"
          ? row.tooltip.reasonSelected
          : `Top ${side} OI holding zone`;
      const evidence = [
        `${distancePct >= 0 ? "+" : ""}${distancePct.toFixed(1)}%`,
        `${compactUsd(tradeNotionalUsd)} recent flow`,
        `${compactUsd(inferredOiUsd)} inferred OI`,
        side === "bull" ? "Bull OI holding zone" : "Bear OI holding zone",
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
          reasonSelected,
          refreshedAtMs: asNumber(row.refreshed_at) ?? updatedAt,
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
      };
    });
    const bull = levels.filter((level) => level.zoneSide === "bull").sort((a, b) => (a.zoneRank ?? 0) - (b.zoneRank ?? 0));
    const bear = levels.filter((level) => level.zoneSide === "bear").sort((a, b) => (a.zoneRank ?? 0) - (b.zoneRank ?? 0));
    const sorted = [...bull, ...bear].sort((a, b) => a.price - b.price);

    return {
      coin: asset,
      currentPrice,
      windowMs,
      updatedAt,
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
    };
  } catch (error) {
    if (typeof error === "object" && error != null && "code" in error && error.code === "42P01") return null;
    throw error;
  }
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
    if (currentZones) return currentZones;

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
    if (!latestContext) return emptyPayload(asset, args.windowMs);
    const currentPrice = asNumber(latestContext?.mark_px) ?? asNumber(latestContext?.mid_px) ?? asNumber(latestContext?.oracle_px);
    if (currentPrice == null || currentPrice <= 0) return emptyPayload(asset, args.windowMs);

    const [earliestContextResult, oiDeltaResult, bookResult, tradeResult, trackedBuckets] = await Promise.all([
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
        [asset, cutoff, currentPrice * 0.8, currentPrice * 1.2],
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
        [asset, cutoff, currentPrice * 0.8, currentPrice * 1.2],
      ),
      listTrackedLiquidationBuckets(asset, 180, TRACKED_LIQ_MAX_AGE_MS).catch((error: unknown) => {
        console.warn("[reaction-level-store] tracked liquidation sample unavailable", error);
        return [];
      }),
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
    const trackedLiquidations = trackedBuckets
      .filter((bucket) => bucket.price > currentPrice * 0.75 && bucket.price < currentPrice * 1.25)
      .map(normalizeTrackedLiquidation);
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

    return payload;
  } catch (error) {
    markStoreUnavailable(error);
    return emptyPayload(asset, args.windowMs);
  }
}
