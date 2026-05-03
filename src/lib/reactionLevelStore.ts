import { Pool } from "pg";
import {
  buildReactionLevels,
  type ReactionBookBucket,
  type ReactionLevelsPayload,
  type ReactionMarketContext,
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

async function persistReactionLevels(client: Pool, payload: ReactionLevelsPayload) {
  if (payload.currentPrice == null || payload.levels.length === 0) return;
  const generatedBucket = Math.floor(payload.updatedAt / 60_000) * 60_000;
  await Promise.all(
    payload.levels.map((level) =>
      client.query(
        `
        insert into reaction_level_snapshots (
          id, asset, window_ms, generated_at, current_price, price_level, distance_pct,
          reaction_label, direction_bias, confidence, score, primary_source, payload
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
        on conflict (id) do update set
          generated_at = excluded.generated_at,
          current_price = excluded.current_price,
          distance_pct = excluded.distance_pct,
          reaction_label = excluded.reaction_label,
          direction_bias = excluded.direction_bias,
          confidence = excluded.confidence,
          score = excluded.score,
          primary_source = excluded.primary_source,
          payload = excluded.payload
        `,
        [
          `reaction-level:${payload.coin}:${payload.windowMs}:${generatedBucket}:${level.id}`,
          payload.coin,
          payload.windowMs,
          payload.updatedAt,
          payload.currentPrice,
          level.price,
          level.distancePct,
          level.reactionLabel,
          level.directionBias,
          level.confidence,
          level.score,
          level.primarySource,
          JSON.stringify(level),
        ],
      ),
    ),
  );
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

    const [earliestContextResult, bookResult, tradeResult, trackedBuckets] = await Promise.all([
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
    const context: ReactionMarketContext = {
      fundingAPR: asNumber(latestContext.funding_apr),
      openInterestUsd: latestOpenInterestUsd,
      openInterestDeltaUsd:
        earliestOpenInterestUsd != null && latestOpenInterestUsd != null
          ? latestOpenInterestUsd - earliestOpenInterestUsd
          : asNumber(latestContext.open_interest_delta_usd),
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

    persistReactionLevels(client, payload).catch((error: unknown) => {
      console.warn("[reaction-level-store] reaction snapshot write failed", error);
    });

    return payload;
  } catch (error) {
    markStoreUnavailable(error);
    return emptyPayload(asset, args.windowMs);
  }
}
