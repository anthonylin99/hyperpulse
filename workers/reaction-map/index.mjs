import { createHash } from "node:crypto";
import { setMaxListeners } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";

const PG_SSL_MODES_TO_PIN = new Set(["prefer", "require", "verify-ca"]);

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const contents = readFileSync(file, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

function normalizeDatabaseUrl(value) {
  const cleaned = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return cleaned;

    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode && PG_SSL_MODES_TO_PIN.has(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    return cleaned;
  }

  return cleaned;
}

const DATABASE_URL = normalizeDatabaseUrl(
  process.env.NEON_DATABASE_URL_POOLING ??
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "",
);
if (!DATABASE_URL) {
  console.error("[reaction-map] NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required.");
  process.exit(1);
}

const NETWORK = process.env.HYPERPULSE_NETWORK === "testnet" ? "testnet" : "mainnet";
const DEFAULT_ASSETS = [
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
];
let ASSETS = [];
const CONFIGURED_ASSETS = parseList(process.env.REACTION_MAP_ASSETS ?? "all", []);
const ZONE_WINDOWS_MS = parseList(process.env.REACTION_MAP_ZONE_WINDOWS, ["15m", "1h", "4h", "1d"])
  .map(windowMsFromLabel)
  .filter((value) => value != null);
const WIDE_BOOK_N_SIG_FIGS = parseList(process.env.REACTION_MAP_WIDE_BOOK_N_SIG_FIGS, ["3", "2"])
  .map((value) => Number(value))
  .filter((value) => [2, 3, 4, 5].includes(value));
const BUCKET_MS = envNumber("REACTION_MAP_BUCKET_MS", 60_000, 5_000);
const FLUSH_MS = envNumber("REACTION_MAP_FLUSH_MS", 120_000, 30_000);
const PROMOTE_MS = envNumber("REACTION_MAP_PROMOTE_MS", 120_000, 30_000);
const BOOK_FLUSH_BATCH_SIZE = Math.floor(envNumber("REACTION_MAP_BOOK_FLUSH_BATCH_SIZE", 750, 50));
const BOOK_LEVEL_LIMIT = envNumber("REACTION_MAP_BOOK_LEVEL_LIMIT", 40, 5);
const RETENTION_MS = envNumber("REACTION_MAP_RETENTION_MS", 6 * 60 * 60 * 1000, 30 * 60 * 1000);
const RETENTION_SWEEP_MS = envNumber("REACTION_MAP_RETENTION_SWEEP_MS", 10 * 60 * 1000, 60_000);
const RETENTION_INITIAL_DELAY_MS = Math.min(RETENTION_SWEEP_MS, Math.max(60_000, Math.floor(PROMOTE_MS / 2)));
const TRADE_DEDUPE_MS = envNumber("REACTION_MAP_TRADE_DEDUPE_MS", 5 * 60 * 1000, 60_000);
const ZONE_CLUSTER_WIDTH_PCT = envNumber("REACTION_MAP_ZONE_CLUSTER_WIDTH_PCT", 0.25, 0.05);
const ZONE_MIN_TRADE_NOTIONAL_USD = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD", 250_000, 1_000);
const ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR", 25_000, 1_000);
const ZONE_MIN_TRADE_NOTIONAL_SHARE = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_SHARE", 0.08, 0.01);
const POSITIONING_PIVOT_NET_USD = envNumber("REACTION_MAP_PIVOT_NET_USD", 100_000, 0);
const ZONE_RANGE_MIN_PCT = envNumber("REACTION_MAP_CLEANUP_RANGE_MIN_PCT", 12, 0.5);
const ZONE_RANGE_MAX_PCT = envNumber("REACTION_MAP_CLEANUP_RANGE_MAX_PCT", 45, 5);
const ZONE_RANGE_STDEV_MULTIPLIER = envNumber("REACTION_MAP_CLEANUP_RANGE_STDEV_X", 3, 1);
const CANDIDATE_RANGE_MULTIPLIER = envNumber("REACTION_MAP_CANDIDATE_RANGE_X", 3, 1);
const ZONE_WIDTH_MIN_PCT = envNumber("REACTION_MAP_ZONE_WIDTH_MIN_PCT", 0.16, 0.02);
const ZONE_WIDTH_MAX_PCT = envNumber(
  "REACTION_MAP_ZONE_WIDTH_MAX_PCT",
  envNumber("REACTION_MAP_MAX_ZONE_WIDTH_PCT", 1.25, 0.05),
  0.05,
);
const ZONE_WIDTH_AVG_MOVE_MULTIPLIER = envNumber("REACTION_MAP_ZONE_WIDTH_AVG_MOVE_X", 4, 0.5);
const MAX_ZONES_STORED_PER_SIDE = Math.max(
  1,
  Math.floor(envNumber("REACTION_MAP_MAX_ZONES_STORED_PER_SIDE", 10, 1)),
);
const CARRIED_ZONE_LOOKBACK_MS = envNumber(
  "REACTION_MAP_CARRIED_ZONE_LOOKBACK_MS",
  Math.max(RETENTION_MS, 24 * 60 * 60 * 1000),
  60 * 60 * 1000,
);
const ALGORITHM_VERSION = "reaction-map-v2.1.0";
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
const httpTransport = new HttpTransport({ isTestnet: NETWORK === "testnet" });
const infoClient = new InfoClient({ transport: httpTransport });
const transport = new WebSocketTransport({ isTestnet: NETWORK === "testnet" });
const subscriptions = new SubscriptionClient({ transport });
const assetStates = new Map();
let flushInProgress = false;
let promotionInProgress = false;
let retentionInProgress = false;

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueAssets(assets) {
  const seen = new Set();
  const unique = [];

  for (const rawAsset of assets) {
    const asset = String(rawAsset ?? "").trim().replace(/\/USDC$/i, "");
    if (!asset) continue;
    const key = asset.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(asset);
  }

  return unique;
}

function shouldDiscoverAllAssets() {
  return CONFIGURED_ASSETS.length === 0 || CONFIGURED_ASSETS.some((asset) => asset.toLowerCase() === "all");
}

async function resolveReactionAssets() {
  if (!shouldDiscoverAllAssets()) {
    return uniqueAssets(CONFIGURED_ASSETS);
  }

  try {
    const data = await infoClient.metaAndAssetCtxs();
    const meta = Array.isArray(data) ? data[0] : data;
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const discovered = uniqueAssets(
      universe
        .filter((asset) => asset && asset.isDelisted !== true)
        .map((asset) => asset.name),
    );
    if (discovered.length > 0) return discovered;
  } catch (error) {
    console.warn("[reaction-map] asset discovery failed; falling back to curated assets", error);
  }

  return uniqueAssets(DEFAULT_ASSETS);
}

function envNumber(key, fallback, min = 0) {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, min);
}

function positioningBucketThreshold(totalTradeNotionalUsd) {
  const adaptiveThreshold = Math.max(
    ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR,
    totalTradeNotionalUsd * ZONE_MIN_TRADE_NOTIONAL_SHARE,
  );
  return Math.min(ZONE_MIN_TRADE_NOTIONAL_USD, adaptiveThreshold);
}

function windowMsFromLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.endsWith("m")) {
    const minutes = Number(normalized.slice(0, -1));
    return Number.isFinite(minutes) ? minutes * 60 * 1000 : null;
  }
  if (normalized.endsWith("h")) {
    const hours = Number(normalized.slice(0, -1));
    return Number.isFinite(hours) ? hours * 60 * 60 * 1000 : null;
  }
  if (normalized.endsWith("d")) {
    const days = Number(normalized.slice(0, -1));
    return Number.isFinite(days) ? days * 24 * 60 * 60 * 1000 : null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bucketTime(time) {
  return Math.floor(time / BUCKET_MS) * BUCKET_MS;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\/USDC$/, "");
}

function bucketSizeForAsset(asset, currentPrice) {
  const normalized = normalizeSymbol(asset);
  if (normalized === "BTC") return 100;
  if (normalized === "ETH") return 10;
  if (normalized === "SOL") return 0.5;
  if (normalized === "HYPE") return 0.1;
  if (currentPrice >= 1000) return 50;
  if (currentPrice >= 100) return 1;
  if (currentPrice >= 10) return 0.05;
  if (currentPrice >= 1) return 0.005;
  return 0.0005;
}

function bucketPrice(price, bucketSize) {
  if (!Number.isFinite(price) || !Number.isFinite(bucketSize) || bucketSize <= 0) return null;
  const value = Math.round(price / bucketSize) * bucketSize;
  return Number(value.toFixed(bucketSize < 1 ? 4 : bucketSize < 10 ? 2 : 0));
}

function hashUser(user) {
  return createHash("sha256").update(String(user).toLowerCase()).digest("hex").slice(0, 16);
}

function tradeIdentity(asset, trade, tradeTime) {
  const tid = trade?.tid == null ? null : String(trade.tid);
  if (!tid) return null;
  return `${normalizeSymbol(trade?.coin ?? asset)}:${tradeTime}:${tid}`;
}

function rememberTrade(state, key, tradeTime) {
  const cutoff = Date.now() - TRADE_DEDUPE_MS;
  for (const [existingKey, seenAt] of state.recentTradeKeys.entries()) {
    if (seenAt < cutoff) state.recentTradeKeys.delete(existingKey);
  }
  if (!key) return true;
  if (state.recentTradeKeys.has(key)) {
    state.duplicateTradeCount += 1;
    return false;
  }
  state.recentTradeKeys.set(key, tradeTime);
  return true;
}

function getAssetState(asset) {
  const normalized = normalizeSymbol(asset);
  let state = assetStates.get(normalized);
  if (!state) {
    state = {
      latestPrice: null,
      latestOpenInterestUsd: null,
      lastContext: null,
      contextBuckets: new Map(),
      bookBuckets: new Map(),
      tradeBuckets: new Map(),
      recentTradeKeys: new Map(),
      duplicateTradeCount: 0,
    };
    assetStates.set(normalized, state);
  }
  return state;
}

function bucketKey(bucketMs, priceBucket) {
  return `${bucketMs}:${priceBucket}`;
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function zoneSideFor(_price, _currentPrice, buyNotionalUsd, sellNotionalUsd) {
  return buyNotionalUsd >= sellNotionalUsd ? "bull" : "bear";
}

function positioningImbalanceType(buyNotionalUsd, sellNotionalUsd) {
  const imbalanceUsd = buyNotionalUsd - sellNotionalUsd;
  if (Math.abs(imbalanceUsd) <= POSITIONING_PIVOT_NET_USD) return "pivot";
  return imbalanceUsd > 0 ? "long_imbalance" : "short_imbalance";
}

function leveragePressureForDistance(distancePct) {
  const movePct = Math.max(Math.abs(distancePct), 0.25);
  return Math.min(50, Math.max(1, 100 / movePct));
}

function zoneIdentity(asset, windowMs, side, zoneLow, zoneHigh) {
  const low = zoneLow.toFixed(zoneLow >= 100 ? 0 : zoneLow >= 1 ? 2 : 4);
  const high = zoneHigh.toFixed(zoneHigh >= 100 ? 0 : zoneHigh >= 1 ? 2 : 4);
  return `reaction-zone:${asset}:${windowMs}:${side}:${low}:${high}`;
}

function scoreConfidence(score) {
  if (score >= 70) return "high";
  if (score >= 42) return "medium";
  return "low";
}

function weightedZonePrice(candidates) {
  let numerator = 0;
  let denominator = 0;
  for (const candidate of candidates) {
    const weight = Math.max(candidate.tradeNotionalUsd, candidate.inferredOiNotionalUsd, candidate.bookNotionalUsd, 1);
    numerator += candidate.priceBucket * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : candidates[0]?.priceBucket ?? 0;
}

function handleContext(asset, event) {
  const state = getAssetState(asset);
  const ctx = event?.ctx ?? event;
  const capturedAt = Date.now();
  const markPx = parseNumber(ctx?.markPx) ?? parseNumber(ctx?.midPx) ?? parseNumber(ctx?.oraclePx);
  if (!markPx || markPx <= 0) return;

  const openInterestCoin = parseNumber(ctx?.openInterest);
  const openInterestUsd = openInterestCoin != null ? openInterestCoin * markPx : null;
  const previousOiUsd = state.lastContext?.openInterestUsd ?? null;
  const openInterestDeltaUsd =
    openInterestUsd != null && previousOiUsd != null ? openInterestUsd - previousOiUsd : null;
  const fundingRate = parseNumber(ctx?.funding);
  const bucketMs = bucketTime(capturedAt);

  const row = {
    id: `reaction-context:${asset}:${bucketMs}`,
    asset,
    bucketMs,
    capturedAt,
    markPx,
    midPx: parseNumber(ctx?.midPx),
    oraclePx: parseNumber(ctx?.oraclePx),
    fundingRate,
    fundingApr: fundingRate == null ? null : fundingRate * 8760 * 100,
    openInterestCoin,
    openInterestUsd,
    openInterestDeltaUsd,
    payload: ctx ?? {},
  };

  state.latestPrice = markPx;
  state.latestOpenInterestUsd = openInterestUsd;
  state.lastContext = row;
  state.contextBuckets.set(bucketMs, row);
}

function handleBook(asset, event) {
  const state = getAssetState(asset);
  const eventTime = parseNumber(event?.time) ?? Date.now();
  const bucketMs = bucketTime(eventTime);
  const priceRef = state.latestPrice ?? inferBookMid(event?.levels) ?? 0;
  const bucketSize = bucketSizeForAsset(asset, priceRef);
  const snapshotBuckets = new Map();

  const collectSide = (levels, side) => {
    if (!Array.isArray(levels)) return;
    for (const level of levels.slice(0, BOOK_LEVEL_LIMIT)) {
      const px = parseNumber(level?.px);
      const sz = parseNumber(level?.sz);
      if (!px || !sz || px <= 0 || sz <= 0) continue;
      const priceBucket = bucketPrice(px, bucketSize);
      if (priceBucket == null) continue;
      const key = String(priceBucket);
      const bucket =
        snapshotBuckets.get(key) ??
        {
          priceBucket,
          bucketSize,
          bidNotionalUsd: 0,
          askNotionalUsd: 0,
          orderCount: 0,
        };
      const notional = px * sz;
      if (side === "bid") bucket.bidNotionalUsd += notional;
      else bucket.askNotionalUsd += notional;
      bucket.orderCount += Number.isFinite(Number(level?.n)) ? Number(level.n) : 1;
      snapshotBuckets.set(key, bucket);
    }
  };

  collectSide(event?.levels?.[0], "bid");
  collectSide(event?.levels?.[1], "ask");

  for (const snapshot of snapshotBuckets.values()) {
    const key = bucketKey(bucketMs, snapshot.priceBucket);
    const existing =
      state.bookBuckets.get(key) ??
      {
        id: `reaction-book:${asset}:${bucketMs}:${snapshot.priceBucket}`,
        asset,
        bucketMs,
        priceBucket: snapshot.priceBucket,
        bucketSize: snapshot.bucketSize,
        bidNotionalUsd: 0,
        askNotionalUsd: 0,
        peakBidNotionalUsd: 0,
        peakAskNotionalUsd: 0,
        orderCount: 0,
        sampleCount: 0,
        firstSeenAt: eventTime,
        lastSeenAt: eventTime,
      };
    existing.bidNotionalUsd += snapshot.bidNotionalUsd;
    existing.askNotionalUsd += snapshot.askNotionalUsd;
    existing.peakBidNotionalUsd = Math.max(existing.peakBidNotionalUsd, snapshot.bidNotionalUsd);
    existing.peakAskNotionalUsd = Math.max(existing.peakAskNotionalUsd, snapshot.askNotionalUsd);
    existing.orderCount += snapshot.orderCount;
    existing.sampleCount += 1;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, eventTime);
    state.bookBuckets.set(key, existing);
  }
}

function inferBookMid(levels) {
  const bid = parseNumber(levels?.[0]?.[0]?.px);
  const ask = parseNumber(levels?.[1]?.[0]?.px);
  if (bid && ask) return (bid + ask) / 2;
  return bid ?? ask ?? null;
}

function handleTrades(asset, trades) {
  const state = getAssetState(asset);
  const list = Array.isArray(trades) ? trades : [trades].filter(Boolean);

  for (const trade of list) {
    const px = parseNumber(trade?.px);
    const sz = parseNumber(trade?.sz);
    if (!px || !sz || px <= 0 || sz <= 0) continue;

    const tradeTime = parseNumber(trade?.time) ?? Date.now();
    if (!rememberTrade(state, tradeIdentity(asset, trade, tradeTime), tradeTime)) continue;
    const bucketMs = bucketTime(tradeTime);
    const bucketSize = bucketSizeForAsset(asset, state.latestPrice ?? px);
    const priceBucket = bucketPrice(px, bucketSize);
    if (priceBucket == null) continue;

    const key = bucketKey(bucketMs, priceBucket);
    const existing =
      state.tradeBuckets.get(key) ??
      {
        id: `reaction-trade:${asset}:${bucketMs}:${priceBucket}`,
        asset,
        bucketMs,
        priceBucket,
        bucketSize,
        buyNotionalUsd: 0,
        sellNotionalUsd: 0,
        tradeCount: 0,
        traderHashes: new Set(),
        firstTradeAt: tradeTime,
        lastTradeAt: tradeTime,
      };
    const notional = px * sz;
    if (String(trade?.side).toUpperCase() === "B") existing.buyNotionalUsd += notional;
    else existing.sellNotionalUsd += notional;
    existing.tradeCount += 1;
    if (Array.isArray(trade?.users)) {
      for (const user of trade.users) {
        if (user) existing.traderHashes.add(hashUser(user));
      }
    }
    existing.lastTradeAt = Math.max(existing.lastTradeAt, tradeTime);
    state.tradeBuckets.set(key, existing);
  }
}

async function assertSchemaReady() {
  const result = await pool.query("select to_regclass('public.reaction_trade_buckets') as table_name");
  if (!result.rows[0]?.table_name) {
    throw new Error("Reaction-map tables are missing. Run migrations before starting the reaction-map worker.");
  }
  const currentZones = await pool.query("select to_regclass('public.reaction_exposure_zones_current') as table_name");
  if (!currentZones.rows[0]?.table_name) {
    throw new Error("Exposure-zone tables are missing. Run migrations before starting the reaction-map worker.");
  }
  await ensureExposureZoneRankLimit();
}

async function ensureExposureZoneRankLimit() {
  const maxRank = Math.max(5, MAX_ZONES_STORED_PER_SIDE);
  const result = await pool.query(
    `
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.reaction_exposure_zones_current'::regclass
      and conname = 'reaction_exposure_zones_current_rank_check'
    limit 1
    `,
  );
  const definition = String(result.rows[0]?.definition ?? "");
  if (definition.includes(`rank <= ${maxRank}`) || definition.includes(`rank <= ${maxRank})`)) return;

  await pool.query("alter table reaction_exposure_zones_current drop constraint if exists reaction_exposure_zones_current_rank_check");
  await pool.query(
    `alter table reaction_exposure_zones_current add constraint reaction_exposure_zones_current_rank_check check (rank between 1 and ${maxRank})`,
  );
  console.log(`[reaction-map] widened exposure-zone rank constraint to top ${maxRank}`);
}

async function flushContextRow(row) {
  await pool.query(
    `
    insert into reaction_context_snapshots (
      id, asset, bucket_ms, captured_at, mark_px, mid_px, oracle_px, funding_rate,
      funding_apr, open_interest_coin, open_interest_usd, open_interest_delta_usd, payload
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    on conflict (id) do update set
      captured_at = excluded.captured_at,
      mark_px = excluded.mark_px,
      mid_px = excluded.mid_px,
      oracle_px = excluded.oracle_px,
      funding_rate = excluded.funding_rate,
      funding_apr = excluded.funding_apr,
      open_interest_coin = excluded.open_interest_coin,
      open_interest_usd = excluded.open_interest_usd,
      open_interest_delta_usd = excluded.open_interest_delta_usd,
      payload = excluded.payload
    `,
    [
      row.id,
      row.asset,
      row.bucketMs,
      row.capturedAt,
      row.markPx,
      row.midPx,
      row.oraclePx,
      row.fundingRate,
      row.fundingApr,
      row.openInterestCoin,
      row.openInterestUsd,
      row.openInterestDeltaUsd,
      JSON.stringify(row.payload),
    ],
  );
}

async function flushBookRows(rows) {
  if (rows.length === 0) return;

  for (let index = 0; index < rows.length; index += BOOK_FLUSH_BATCH_SIZE) {
    const chunk = rows.slice(index, index + BOOK_FLUSH_BATCH_SIZE);
    const params = [];
    const values = chunk.map((row, rowIndex) => {
      const offset = rowIndex * 14;
      params.push(
        row.id,
        row.asset,
        row.bucketMs,
        row.priceBucket,
        row.bucketSize,
        row.bidNotionalUsd,
        row.askNotionalUsd,
        row.peakBidNotionalUsd,
        row.peakAskNotionalUsd,
        row.orderCount,
        row.sampleCount,
        row.firstSeenAt,
        row.lastSeenAt,
        JSON.stringify({ source: "hyperliquid_ws" }),
      );
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14}::jsonb)`;
    });

    await pool.query(
      `
      insert into reaction_orderbook_buckets (
        id, asset, bucket_ms, price_bucket, bucket_size, bid_notional_usd, ask_notional_usd,
        peak_bid_notional_usd, peak_ask_notional_usd, order_count, sample_count,
        first_seen_at, last_seen_at, payload
      )
      values ${values.join(",")}
      on conflict (id) do update set
        bid_notional_usd = greatest(reaction_orderbook_buckets.bid_notional_usd, excluded.bid_notional_usd),
        ask_notional_usd = greatest(reaction_orderbook_buckets.ask_notional_usd, excluded.ask_notional_usd),
        peak_bid_notional_usd = greatest(reaction_orderbook_buckets.peak_bid_notional_usd, excluded.peak_bid_notional_usd),
        peak_ask_notional_usd = greatest(reaction_orderbook_buckets.peak_ask_notional_usd, excluded.peak_ask_notional_usd),
        order_count = greatest(reaction_orderbook_buckets.order_count, excluded.order_count),
        sample_count = greatest(reaction_orderbook_buckets.sample_count, excluded.sample_count),
        last_seen_at = greatest(reaction_orderbook_buckets.last_seen_at, excluded.last_seen_at),
        payload = excluded.payload
      `,
      params,
    );
  }
}

async function flushTradeRow(row) {
  await pool.query(
    `
    insert into reaction_trade_buckets (
      id, asset, bucket_ms, price_bucket, bucket_size, buy_notional_usd, sell_notional_usd,
      trade_count, unique_trader_count, first_trade_at, last_trade_at, payload
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    on conflict (id) do update set
      buy_notional_usd = greatest(reaction_trade_buckets.buy_notional_usd, excluded.buy_notional_usd),
      sell_notional_usd = greatest(reaction_trade_buckets.sell_notional_usd, excluded.sell_notional_usd),
      trade_count = greatest(reaction_trade_buckets.trade_count, excluded.trade_count),
      unique_trader_count = greatest(reaction_trade_buckets.unique_trader_count, excluded.unique_trader_count),
      last_trade_at = greatest(reaction_trade_buckets.last_trade_at, excluded.last_trade_at),
      payload = excluded.payload
    `,
    [
      row.id,
      row.asset,
      row.bucketMs,
      row.priceBucket,
      row.bucketSize,
      row.buyNotionalUsd,
      row.sellNotionalUsd,
      row.tradeCount,
      row.traderHashes.size,
      row.firstTradeAt,
      row.lastTradeAt,
      JSON.stringify({
        traderHashSample: [...row.traderHashes].slice(0, 24),
      }),
    ],
  );
}

async function latestContext(asset, cutoff) {
  const result = await pool.query(
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
  return result.rows[0] ?? null;
}

async function recentMoveStatsPct(asset, cutoff, currentPrice) {
  const result = await pool.query(
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
  const prices = result.rows.map((row) => parseNumber(row.mark_px)).filter((value) => value != null && value > 0);
  if (prices.length < 2 || !currentPrice) {
    return { averageAbsMovePct: ZONE_WIDTH_MIN_PCT / ZONE_WIDTH_AVG_MOVE_MULTIPLIER, stdevPct: 0 };
  }

  // Bucket-to-bucket percent moves, normalized by current price for stable units.
  const moves = [];
  for (let index = 1; index < prices.length; index += 1) {
    moves.push(((prices[index] - prices[index - 1]) / currentPrice) * 100);
  }
  if (moves.length === 0) {
    return { averageAbsMovePct: ZONE_WIDTH_MIN_PCT / ZONE_WIDTH_AVG_MOVE_MULTIPLIER, stdevPct: 0 };
  }

  const mean = moves.reduce((sum, value) => sum + value, 0) / moves.length;
  const averageAbsMovePct = moves.reduce((sum, value) => sum + Math.abs(value), 0) / moves.length;
  const variance =
    moves.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / moves.length;
  return { averageAbsMovePct, stdevPct: Math.sqrt(variance) };
}

async function recentMoveStdevPct(asset, cutoff, currentPrice) {
  const stats = await recentMoveStatsPct(asset, cutoff, currentPrice);
  return Math.min(ZONE_RANGE_MAX_PCT, Math.max(ZONE_RANGE_MIN_PCT, stats.stdevPct * ZONE_RANGE_STDEV_MULTIPLIER));
}

function dynamicZoneWidthPct(stats, windowMs) {
  const averageAbsMovePct = Number(stats?.averageAbsMovePct);
  const stdevPct = Number(stats?.stdevPct);
  const swingFloor =
    windowMs >= 24 * 60 * 60 * 1000
      ? 0.75
      : windowMs >= 4 * 60 * 60 * 1000
        ? 0.45
        : ZONE_WIDTH_MIN_PCT;
  const widthPct = Number.isFinite(averageAbsMovePct)
    ? averageAbsMovePct * ZONE_WIDTH_AVG_MOVE_MULTIPLIER
    : ZONE_WIDTH_MIN_PCT;
  const stdevWidthPct = Number.isFinite(stdevPct) ? stdevPct * ZONE_RANGE_STDEV_MULTIPLIER : 0;
  return Math.min(ZONE_WIDTH_MAX_PCT, Math.max(swingFloor, ZONE_WIDTH_MIN_PCT, widthPct, stdevWidthPct));
}

function dynamicCandidateRangePct(stats) {
  const averageAbsMovePct = Number(stats?.averageAbsMovePct);
  const stdevPct = Number(stats?.stdevPct);
  const movePct = Math.max(
    Number.isFinite(averageAbsMovePct) ? averageAbsMovePct : 0,
    Number.isFinite(stdevPct) ? stdevPct : 0,
  );
  const rangePct = movePct > 0 ? movePct * CANDIDATE_RANGE_MULTIPLIER : ZONE_RANGE_MIN_PCT;
  return Math.min(ZONE_RANGE_MAX_PCT, Math.max(ZONE_RANGE_MIN_PCT, rangePct));
}

function priceRangeFromPct(currentPrice, rangePct) {
  const pct = Math.max(Number(rangePct) || 0, 0) / 100;
  return {
    low: currentPrice * Math.max(0.01, 1 - pct),
    high: currentPrice * (1 + pct),
  };
}

async function loadZoneCandidates(asset, windowMs, currentPrice, candidateRangePct) {
  const cutoff = Date.now() - windowMs;
  const candidateRange = priceRangeFromPct(currentPrice, candidateRangePct);
  const [oiDeltaResult, bookResult, tradeResult] = await Promise.all([
    pool.query(
      `
      select sum(greatest(coalesce(open_interest_delta_usd, 0), 0)) as positive_open_interest_delta_usd
      from reaction_context_snapshots
      where asset = $1
        and bucket_ms >= $2
      `,
      [asset, cutoff],
    ),
    pool.query(
      `
      select
        price_bucket,
        max(bucket_size) as bucket_size,
        sum(bid_notional_usd) / nullif(sum(greatest(sample_count, 1)), 0) as bid_depth_usd,
        sum(ask_notional_usd) / nullif(sum(greatest(sample_count, 1)), 0) as ask_depth_usd,
        max(peak_bid_notional_usd) as peak_bid_depth_usd,
        max(peak_ask_notional_usd) as peak_ask_depth_usd
      from reaction_orderbook_buckets
      where asset = $1
        and bucket_ms >= $2
        and price_bucket between $3 and $4
      group by price_bucket
      limit 320
      `,
      [asset, cutoff, candidateRange.low, candidateRange.high],
    ),
    pool.query(
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
      limit 320
      `,
      [asset, cutoff, candidateRange.low, candidateRange.high],
    ),
  ]);

  const byPrice = new Map();
  for (const row of bookResult.rows) {
    const priceBucket = parseNumber(row.price_bucket);
    if (!priceBucket || priceBucket <= 0) continue;
    byPrice.set(priceBucket, {
      priceBucket,
      bucketSize: parseNumber(row.bucket_size) ?? bucketSizeForAsset(asset, currentPrice),
      bidDepthUsd: Math.max(parseNumber(row.bid_depth_usd) ?? 0, 0),
      askDepthUsd: Math.max(parseNumber(row.ask_depth_usd) ?? 0, 0),
      buyNotionalUsd: 0,
      sellNotionalUsd: 0,
      tradeCount: 0,
      uniqueTraderCount: 0,
    });
  }

  for (const row of tradeResult.rows) {
    const priceBucket = parseNumber(row.price_bucket);
    if (!priceBucket || priceBucket <= 0) continue;
    const existing =
      byPrice.get(priceBucket) ??
      {
        priceBucket,
        bucketSize: parseNumber(row.bucket_size) ?? bucketSizeForAsset(asset, currentPrice),
        bidDepthUsd: 0,
        askDepthUsd: 0,
        buyNotionalUsd: 0,
        sellNotionalUsd: 0,
        tradeCount: 0,
        uniqueTraderCount: 0,
      };
    existing.buyNotionalUsd = Math.max(parseNumber(row.buy_notional_usd) ?? 0, 0);
    existing.sellNotionalUsd = Math.max(parseNumber(row.sell_notional_usd) ?? 0, 0);
    existing.tradeCount = Math.max(Math.round(parseNumber(row.trade_count) ?? 0), 0);
    existing.uniqueTraderCount = Math.max(Math.round(parseNumber(row.unique_trader_count) ?? 0), 0);
    byPrice.set(priceBucket, existing);
  }

  const positiveOiDeltaUsd = Math.max(parseNumber(oiDeltaResult.rows[0]?.positive_open_interest_delta_usd) ?? 0, 0);
  const totalTradeNotional = [...byPrice.values()].reduce(
    (sum, row) => sum + row.buyNotionalUsd + row.sellNotionalUsd,
    0,
  );
  const minTradeNotionalUsd = positioningBucketThreshold(totalTradeNotional);

  return [...byPrice.values()]
    .map((row) => {
      const tradeNotionalUsd = row.buyNotionalUsd + row.sellNotionalUsd;
      const flowBias = tradeNotionalUsd > 0 ? (row.buyNotionalUsd - row.sellNotionalUsd) / tradeNotionalUsd : 0;
      const flowConfidence = Math.min(1, Math.max(0.35, Math.abs(flowBias) * 1.25));
      const inferredOiNotionalUsd =
        positiveOiDeltaUsd > 0 && totalTradeNotional > 0
          ? positiveOiDeltaUsd * (tradeNotionalUsd / totalTradeNotional) * flowConfidence
          : 0;
      return {
        ...row,
        side: zoneSideFor(row.priceBucket, currentPrice, row.buyNotionalUsd, row.sellNotionalUsd),
        tradeNotionalUsd,
        bookNotionalUsd: Math.max(row.bidDepthUsd, row.askDepthUsd),
        inferredOiNotionalUsd,
        minTradeNotionalUsd,
      };
    })
    .filter((row) => row.tradeNotionalUsd >= minTradeNotionalUsd);
}

function clusterCandidates(candidates, currentPrice, zoneWidthPct) {
  const bySide = {
    bull: [],
    bear: [],
  };
  for (const side of ["bull", "bear"]) {
    const sideCandidates = candidates
      .filter((candidate) => candidate.side === side)
      .sort((a, b) => a.priceBucket - b.priceBucket);
    const clusters = [];
    for (const candidate of sideCandidates) {
      const lastCluster = clusters[clusters.length - 1];
      const center = lastCluster ? weightedZonePrice(lastCluster) : null;
      const distance = center == null ? Infinity : Math.abs(((candidate.priceBucket - center) / currentPrice) * 100);
      if (!lastCluster || distance > Math.max(ZONE_CLUSTER_WIDTH_PCT, zoneWidthPct)) clusters.push([candidate]);
      else lastCluster.push(candidate);
    }
    bySide[side] = clusters
      .map((cluster) => buildZoneFromCluster(cluster, side, currentPrice, zoneWidthPct));
  }
  return bySide;
}

function clampZoneRange(zoneLow, zoneHigh, weightedPrice, currentPrice, zoneWidthPct) {
  const maxWidth = currentPrice * (zoneWidthPct / 100);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || zoneHigh - zoneLow <= maxWidth) {
    return { zoneLow, zoneHigh };
  }

  const halfWidth = maxWidth / 2;
  return {
    zoneLow: weightedPrice - halfWidth,
    zoneHigh: weightedPrice + halfWidth,
  };
}

function buildZoneFromCluster(cluster, side, currentPrice, zoneWidthPct) {
  const weightedPrice = weightedZonePrice(cluster);
  const rawZoneLow = Math.min(...cluster.map((item) => item.priceBucket - item.bucketSize / 2));
  const rawZoneHigh = Math.max(...cluster.map((item) => item.priceBucket + item.bucketSize / 2));
  const { zoneLow, zoneHigh } = clampZoneRange(rawZoneLow, rawZoneHigh, weightedPrice, currentPrice, zoneWidthPct);
  const tradeNotionalUsd = cluster.reduce((sum, item) => sum + item.tradeNotionalUsd, 0);
  const buyNotionalUsd = cluster.reduce((sum, item) => sum + item.buyNotionalUsd, 0);
  const sellNotionalUsd = cluster.reduce((sum, item) => sum + item.sellNotionalUsd, 0);
  const inferredOiNotionalUsd = cluster.reduce((sum, item) => sum + item.inferredOiNotionalUsd, 0);
  const minTradeNotionalUsd = Math.min(...cluster.map((item) => item.minTradeNotionalUsd));
  const bookNotionalUsd = cluster.reduce((sum, item) => sum + item.bookNotionalUsd, 0);
  const bidDepthUsd = cluster.reduce((sum, item) => sum + item.bidDepthUsd, 0);
  const askDepthUsd = cluster.reduce((sum, item) => sum + item.askDepthUsd, 0);
  const walletCount = Math.max(...cluster.map((item) => item.uniqueTraderCount), 0);
  const clusterWidthPct = ((zoneHigh - zoneLow) / currentPrice) * 100;
  const distancePct = ((weightedPrice - currentPrice) / currentPrice) * 100;
  const imbalanceUsd = buyNotionalUsd - sellNotionalUsd;
  const imbalanceType = positioningImbalanceType(buyNotionalUsd, sellNotionalUsd);
  const leveragePressure = leveragePressureForDistance(distancePct);
  const score = Math.round(
    Math.min(
      100,
      Math.log10(tradeNotionalUsd + 1) * 8 +
        Math.log10(inferredOiNotionalUsd + 1) * 6 +
        Math.log10(bookNotionalUsd + 1) * 4 +
        Math.min(12, Math.abs(buyNotionalUsd - sellNotionalUsd) / Math.max(tradeNotionalUsd, 1) * 12),
    ),
  );
  const buildSideLabel =
    imbalanceType === "pivot" ? "balanced pivot" : side === "bull" ? "buyer-initiated" : "seller-initiated";
  const reasonSelected =
    imbalanceType === "pivot"
      ? `Pivot zone: buy/sell net is within ${compactUsd(POSITIONING_PIVOT_NET_USD)} across ${cluster.length} clustered flow bucket${cluster.length === 1 ? "" : "s"}`
      : `Top ${buildSideLabel} inferred OI build from ${cluster.length} clustered flow bucket${cluster.length === 1 ? "" : "s"}`;

  return {
    side,
    zoneLow,
    zoneMid: (zoneLow + zoneHigh) / 2,
    zoneHigh,
    weightedPrice,
    distancePct,
    score,
    confidence: scoreConfidence(score),
    candidateCount: cluster.length,
    clusterWidthPct,
    dynamicZoneWidthPct: zoneWidthPct,
    bookNotionalUsd,
    tradeNotionalUsd,
    minTradeNotionalUsd,
    imbalanceUsd,
    imbalanceType,
    leveragePressure,
    inferredOiNotionalUsd,
    trackedLiqNotionalUsd: 0,
    buyNotionalUsd,
    sellNotionalUsd,
    bidDepthUsd,
    askDepthUsd,
    walletCount,
    reasonSelected,
  };
}

function carriedZoneFromRow(row, currentPrice, zoneWidthPct) {
  const rawZoneLow = parseNumber(row.zone_low);
  const rawZoneHigh = parseNumber(row.zone_high);
  if (rawZoneLow == null || rawZoneHigh == null || rawZoneLow <= 0 || rawZoneHigh <= 0) return null;

  const weightedPrice = parseNumber(row.weighted_price) ?? parseNumber(row.zone_mid) ?? (rawZoneLow + rawZoneHigh) / 2;
  if (!weightedPrice || weightedPrice <= 0) return null;
  const { zoneLow, zoneHigh } = clampZoneRange(rawZoneLow, rawZoneHigh, weightedPrice, currentPrice, zoneWidthPct);

  const distancePct = ((weightedPrice - currentPrice) / currentPrice) * 100;

  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const tradeNotionalUsd = Math.max(parseNumber(row.trade_notional_usd) ?? 0, 0);
  const inferredOiNotionalUsd = Math.max(parseNumber(row.inferred_oi_notional_usd) ?? 0, 0);
  const bookNotionalUsd = Math.max(parseNumber(row.book_notional_usd) ?? 0, 0);
  const score = Math.max(Math.round(parseNumber(row.score) ?? 0), 0);
  const side = row.side === "bear" ? "bear" : "bull";
  const imbalanceUsd = Math.max(parseNumber(row.buy_notional_usd) ?? 0, 0) - Math.max(parseNumber(row.sell_notional_usd) ?? 0, 0);
  const tooltip = row.tooltip && typeof row.tooltip === "object" ? row.tooltip : {};
  const imbalanceType =
    typeof tooltip.imbalanceType === "string"
      ? tooltip.imbalanceType
      : typeof payload.imbalanceType === "string"
        ? payload.imbalanceType
        : positioningImbalanceType(Math.max(parseNumber(row.buy_notional_usd) ?? 0, 0), Math.max(parseNumber(row.sell_notional_usd) ?? 0, 0));

  return {
    zoneId: String(row.zone_id),
    side,
    zoneLow,
    zoneMid: parseNumber(row.zone_mid) ?? (zoneLow + zoneHigh) / 2,
    zoneHigh,
    weightedPrice,
    distancePct,
    score,
    confidence: scoreConfidence(score),
    candidateCount: Math.max(Math.round(parseNumber(row.candidate_count) ?? 0), 0),
    clusterWidthPct: Math.max(parseNumber(row.cluster_width_pct) ?? ((zoneHigh - zoneLow) / currentPrice) * 100, 0),
    dynamicZoneWidthPct: zoneWidthPct,
    bookNotionalUsd,
    tradeNotionalUsd,
    minTradeNotionalUsd: Math.max(parseNumber(payload.minTradeNotionalUsd) ?? 0, 0),
    imbalanceUsd: parseNumber(tooltip.imbalanceUsd) ?? parseNumber(payload.imbalanceUsd) ?? imbalanceUsd,
    imbalanceType,
    leveragePressure: parseNumber(tooltip.leveragePressure) ?? parseNumber(payload.leveragePressure) ?? leveragePressureForDistance(distancePct),
    inferredOiNotionalUsd,
    trackedLiqNotionalUsd: Math.max(parseNumber(row.tracked_liq_notional_usd) ?? 0, 0),
    buyNotionalUsd: Math.max(parseNumber(row.buy_notional_usd) ?? 0, 0),
    sellNotionalUsd: Math.max(parseNumber(row.sell_notional_usd) ?? 0, 0),
    bidDepthUsd: Math.max(parseNumber(row.bid_depth_usd) ?? 0, 0),
    askDepthUsd: Math.max(parseNumber(row.ask_depth_usd) ?? 0, 0),
    walletCount: Math.max(Math.round(parseNumber(row.wallet_count) ?? 0), 0),
    reasonSelected: "Carried forward because no public stream proves this inferred zone was unwound.",
    carriedForward: true,
    lastSeenAt: parseNumber(row.last_seen_at) ?? parseNumber(row.refreshed_at) ?? parseNumber(row.generated_at) ?? Date.now(),
  };
}

function zoneStoragePriority(zone) {
  const distance = Math.abs(zone.distancePct);
  const nearPricePenalty = distance < 0.45 ? 28 : 0;
  const distanceBonus = Math.min(24, distance * 6);
  const flowScore = Math.log10(zone.tradeNotionalUsd + 1) * 5;
  const oiScore = Math.log10(zone.inferredOiNotionalUsd + 1) * 3;
  const carriedPenalty = zone.carriedForward ? 4 : 0;
  return zone.score * 2 + flowScore + oiScore + distanceBonus - nearPricePenalty - carriedPenalty;
}

async function upsertExposureZones(asset, windowMs, currentPrice, zones, zoneWidthPct) {
  const now = Date.now();
  const carryCutoff = now - CARRIED_ZONE_LOOKBACK_MS;
  const existingResult = await pool.query(
    `
    select *
    from reaction_exposure_zones_current
    where asset = $1
      and window_ms = $2
      and coalesce(last_seen_at, refreshed_at, generated_at) >= $3
    `,
    [asset, windowMs, carryCutoff],
  );
  const existing = new Map(existingResult.rows.map((row) => [row.zone_id, row]));
  const nextZoneIds = [];

  await pool.query("begin");
  try {
    await pool.query(
      `
      update reaction_exposure_zones_current
      set status = 'retired', refreshed_at = $3
      where asset = $1
        and window_ms = $2
        and status <> 'retired'
      `,
      [asset, windowMs, now],
    );

    for (const side of ["bull", "bear"]) {
      // Store top N per side (default 10) so emerging and recently carried zones
      // keep a usable ladder instead of disappearing after one one-sided flow window.
      const freshZones = zones[side].map((zone) => ({
        ...zone,
        zoneId: zoneIdentity(asset, windowMs, side, zone.zoneLow, zone.zoneHigh),
        carriedForward: false,
        lastSeenAt: now,
      }));
      const freshZoneIds = new Set(freshZones.map((zone) => zone.zoneId));
      const carriedZones = existingResult.rows
        .filter((row) => row.side === side && !freshZoneIds.has(String(row.zone_id)))
        .map((row) => carriedZoneFromRow(row, currentPrice, zoneWidthPct))
        .filter((zone) => zone != null);
      const ranked = [...freshZones, ...carriedZones]
        .sort((a, b) => zoneStoragePriority(b) - zoneStoragePriority(a) || b.tradeNotionalUsd - a.tradeNotionalUsd)
        .slice(0, MAX_ZONES_STORED_PER_SIDE);

      for (const [index, zone] of ranked.entries()) {
        const rank = index + 1;
        const zoneId = zone.zoneId;
        const existingZone = existing.get(zoneId);
        const firstSeenAt = parseNumber(existingZone?.first_seen_at) ?? now;
        const lastSeenAt = parseNumber(zone.lastSeenAt) ?? now;
        const tooltip = {
          rank,
          side,
          windowMs,
          range: `${zone.zoneLow.toFixed(asset === "BTC" ? 0 : 2)}-${zone.zoneHigh.toFixed(asset === "BTC" ? 0 : 2)}`,
          totalRecentFlowUsd: zone.tradeNotionalUsd,
          inferredOiUsd: zone.inferredOiNotionalUsd,
          buyNotionalUsd: zone.buyNotionalUsd,
          sellNotionalUsd: zone.sellNotionalUsd,
          imbalanceUsd: zone.imbalanceUsd,
          imbalanceType: zone.imbalanceType,
          leveragePressure: zone.leveragePressure,
          pivotThresholdUsd: POSITIONING_PIVOT_NET_USD,
          aggressorSkew:
            zone.tradeNotionalUsd > 0
              ? (zone.buyNotionalUsd - zone.sellNotionalUsd) / zone.tradeNotionalUsd
              : 0,
          candidateCount: zone.candidateCount,
          clusterWidthPct: zone.clusterWidthPct,
          dynamicZoneWidthPct: zone.dynamicZoneWidthPct,
          distancePct: zone.distancePct,
          setupRoomPct: Math.abs(zone.distancePct),
          reasonSelected: zone.reasonSelected,
          carriedForward: zone.carriedForward,
          lastEvidenceAtMs: lastSeenAt,
          refreshedAtMs: now,
          caution: "Inferred from public Hyperliquid streams, not exact open positions.",
        };

        nextZoneIds.push(zoneId);
        await pool.query(
          `
          insert into reaction_exposure_zones_current (
            zone_id, asset, window_ms, side, rank, status, generated_at, refreshed_at,
            first_seen_at, last_seen_at, current_price, zone_low, zone_mid, zone_high,
            weighted_price, distance_pct, score, confidence, primary_source,
            candidate_count, cluster_width_pct, book_notional_usd, trade_notional_usd,
            inferred_oi_notional_usd, tracked_liq_notional_usd, buy_notional_usd,
            sell_notional_usd, bid_depth_usd, ask_depth_usd, wallet_count, tooltip, payload
          )
          values (
            $1,$2,$3,$4,$5,'active',$6,$6,$7,$29,$8,$9,$10,$11,$12,$13,$14,$15,'positioning',
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28::jsonb
          )
          on conflict (zone_id) do update set
            rank = excluded.rank,
            status = 'active',
            generated_at = excluded.generated_at,
            refreshed_at = excluded.refreshed_at,
            last_seen_at = excluded.last_seen_at,
            current_price = excluded.current_price,
            zone_low = excluded.zone_low,
            zone_mid = excluded.zone_mid,
            zone_high = excluded.zone_high,
            weighted_price = excluded.weighted_price,
            distance_pct = excluded.distance_pct,
            score = excluded.score,
            confidence = excluded.confidence,
            candidate_count = excluded.candidate_count,
            cluster_width_pct = excluded.cluster_width_pct,
            book_notional_usd = excluded.book_notional_usd,
            trade_notional_usd = excluded.trade_notional_usd,
            inferred_oi_notional_usd = excluded.inferred_oi_notional_usd,
            tracked_liq_notional_usd = excluded.tracked_liq_notional_usd,
            buy_notional_usd = excluded.buy_notional_usd,
            sell_notional_usd = excluded.sell_notional_usd,
            bid_depth_usd = excluded.bid_depth_usd,
            ask_depth_usd = excluded.ask_depth_usd,
            wallet_count = excluded.wallet_count,
            tooltip = excluded.tooltip,
            payload = excluded.payload
          `,
          [
            zoneId,
            asset,
            windowMs,
            side,
            rank,
            now,
            firstSeenAt,
            currentPrice,
            zone.zoneLow,
            zone.zoneMid,
            zone.zoneHigh,
            zone.weightedPrice,
            zone.distancePct,
            zone.score,
            zone.confidence,
            zone.candidateCount,
            zone.clusterWidthPct,
            zone.bookNotionalUsd,
            zone.tradeNotionalUsd,
            zone.inferredOiNotionalUsd,
            zone.trackedLiqNotionalUsd,
            zone.buyNotionalUsd,
            zone.sellNotionalUsd,
            zone.bidDepthUsd,
            zone.askDepthUsd,
            zone.walletCount,
            JSON.stringify(tooltip),
            JSON.stringify({
              source: zone.carriedForward ? "carried_forward_current_zone" : "hyperliquid_ws",
              algorithmVersion: ALGORITHM_VERSION,
              inferenceType: "public_trade_flow_plus_positive_oi_delta",
              windowMs,
              clusterWidthPct: ZONE_CLUSTER_WIDTH_PCT,
              dynamicZoneWidthPct: zone.dynamicZoneWidthPct,
              averageMoveWidthRule: {
                minPct: ZONE_WIDTH_MIN_PCT,
                maxPct: ZONE_WIDTH_MAX_PCT,
                averageMoveMultiplier: ZONE_WIDTH_AVG_MOVE_MULTIPLIER,
              },
              minTradeNotionalUsd: zone.minTradeNotionalUsd,
              imbalanceUsd: zone.imbalanceUsd,
              imbalanceType: zone.imbalanceType,
              leveragePressure: zone.leveragePressure,
              pivotThresholdUsd: POSITIONING_PIVOT_NET_USD,
              carriedForward: zone.carriedForward,
            }),
            lastSeenAt,
          ],
        );

        const eventType = eventTypeForZone(existingZone, zone, rank);
        if (eventType) {
          await insertZoneEvent(asset, windowMs, zoneId, side, eventType, rank, currentPrice, zone, now);
        }
      }
    }

    await pool.query(
      `
      update reaction_exposure_zones_current
      set status = 'retired', refreshed_at = $3
      where asset = $1
        and window_ms = $2
        and status <> 'retired'
        and not (zone_id = any($4::text[]))
      `,
      [asset, windowMs, now, nextZoneIds],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback").catch(() => {});
    throw error;
  }
}

function eventTypeForZone(existingZone, zone, rank) {
  if (!existingZone) return "created";
  const previousScore = parseNumber(existingZone.score) ?? zone.score;
  const previousRank = Math.round(parseNumber(existingZone.rank) ?? rank);
  const previousLow = parseNumber(existingZone.zone_low) ?? zone.zoneLow;
  const previousHigh = parseNumber(existingZone.zone_high) ?? zone.zoneHigh;
  if (previousRank !== rank) return "moved";
  if (Math.abs(zone.score - previousScore) >= 12) return zone.score > previousScore ? "strengthened" : "weakened";
  if (Math.abs(zone.zoneLow - previousLow) > zone.weightedPrice * 0.001 || Math.abs(zone.zoneHigh - previousHigh) > zone.weightedPrice * 0.001) {
    return "expanded";
  }
  return null;
}

async function insertZoneEvent(asset, windowMs, zoneId, side, eventType, rank, currentPrice, zone, now) {
  await pool.query(
    `
    insert into reaction_exposure_zone_events (
      id, zone_id, asset, window_ms, side, event_type, event_at, rank,
      current_price, zone_low, zone_mid, zone_high, score, payload
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    on conflict (id) do nothing
    `,
    [
      `${zoneId}:${eventType}:${Math.floor(now / 60_000) * 60_000}`,
      zoneId,
      asset,
      windowMs,
      side,
      eventType,
      now,
      rank,
      currentPrice,
      zone.zoneLow,
      zone.zoneMid,
      zone.zoneHigh,
      zone.score,
      JSON.stringify({ tradeNotionalUsd: zone.tradeNotionalUsd, inferredOiNotionalUsd: zone.inferredOiNotionalUsd }),
    ],
  );
}

async function promoteExposureZones() {
  for (const asset of ASSETS) {
    for (const windowMs of ZONE_WINDOWS_MS) {
      const cutoff = Date.now() - windowMs;
      const context = await latestContext(asset, cutoff);
      const currentPrice = parseNumber(context?.mark_px) ?? parseNumber(context?.mid_px) ?? parseNumber(context?.oracle_px);
      if (!currentPrice || currentPrice <= 0) continue;
      const moveStats = await recentMoveStatsPct(asset, cutoff, currentPrice);
      const zoneWidthPct = dynamicZoneWidthPct(moveStats, windowMs);
      const candidateRangePct = dynamicCandidateRangePct(moveStats);
      const candidates = await loadZoneCandidates(asset, windowMs, currentPrice, candidateRangePct);
      const zones = clusterCandidates(candidates, currentPrice, zoneWidthPct);
      await upsertExposureZones(asset, windowMs, currentPrice, zones, zoneWidthPct);
    }
  }
}

async function flushState() {
  const currentBucket = bucketTime(Date.now());
  let contextRows = 0;
  let bookRows = 0;
  let tradeRows = 0;
  let duplicateTrades = 0;
  const bookEntries = [];

  for (const state of assetStates.values()) {
    duplicateTrades += state.duplicateTradeCount;
    state.duplicateTradeCount = 0;
    for (const [bucketMs, row] of state.contextBuckets.entries()) {
      await flushContextRow(row);
      contextRows += 1;
      if (bucketMs < currentBucket) state.contextBuckets.delete(bucketMs);
    }

    for (const [key, row] of state.bookBuckets.entries()) {
      bookEntries.push({ state, key, row });
    }

    for (const [key, row] of state.tradeBuckets.entries()) {
      await flushTradeRow(row);
      tradeRows += 1;
      if (row.bucketMs < currentBucket) state.tradeBuckets.delete(key);
    }
  }

  await flushBookRows(bookEntries.map((entry) => entry.row));
  bookRows = bookEntries.length;
  for (const { state, key, row } of bookEntries) {
    if (row.bucketMs < currentBucket) state.bookBuckets.delete(key);
  }

  if (contextRows || bookRows || tradeRows || duplicateTrades) {
    console.log(
      `[reaction-map] flushed context=${contextRows} book=${bookRows} trades=${tradeRows} duplicateTrades=${duplicateTrades}`,
    );
  }
}

async function sweepRetention() {
  const cutoff = Date.now() - RETENTION_MS;
  await pool.query("delete from reaction_context_snapshots where bucket_ms < $1", [cutoff]);
  await pool.query("delete from reaction_orderbook_buckets where bucket_ms < $1", [cutoff]);
  await pool.query("delete from reaction_trade_buckets where bucket_ms < $1", [cutoff]);

  for (const asset of ASSETS) {
    const context = await latestContext(asset, Date.now() - RETENTION_MS);
    const currentPrice = parseNumber(context?.mark_px) ?? parseNumber(context?.mid_px) ?? parseNumber(context?.oracle_px);
    if (!currentPrice || currentPrice <= 0) continue;

    const rangePct = await recentMoveStdevPct(asset, Date.now() - RETENTION_MS, currentPrice);
    const low = currentPrice * (1 - rangePct / 100);
    const high = currentPrice * (1 + rangePct / 100);

    await pool.query(
      `
      delete from reaction_orderbook_buckets
      where asset = $1
        and (price_bucket < $2 or price_bucket > $3)
      `,
      [asset, low, high],
    );
    await pool.query(
      `
      delete from reaction_trade_buckets
      where asset = $1
        and (price_bucket < $2 or price_bucket > $3)
      `,
      [asset, low, high],
    );
    await pool.query(
      `
      update reaction_exposure_zones_current
      set status = 'stale'
      where asset = $1
        and status = 'active'
        and (zone_high < $2 or zone_low > $3)
      `,
      [asset, low, high],
    );
  }
}

async function runExclusive(label, stateKey, work) {
  if (stateKey.get()) {
    console.warn(`[reaction-map] skipped ${label}; previous ${label} cycle still running`);
    return;
  }
  stateKey.set(true);
  const startedAt = Date.now();
  try {
    await work();
    const durationMs = Date.now() - startedAt;
    if (durationMs > 5_000) console.log(`[reaction-map] ${label} completed durationMs=${durationMs}`);
  } finally {
    stateKey.set(false);
  }
}

const flushStateKey = {
  get: () => flushInProgress,
  set: (value) => {
    flushInProgress = value;
  },
};

const promotionStateKey = {
  get: () => promotionInProgress || retentionInProgress,
  set: (value) => {
    promotionInProgress = value;
  },
};

const retentionStateKey = {
  get: () => retentionInProgress || promotionInProgress,
  set: (value) => {
    retentionInProgress = value;
  },
};

async function subscribeAsset(asset) {
  try {
    await subscriptions.activeAssetCtx({ coin: asset }, (event) => handleContext(asset, event));
    await subscriptions.l2Book({ coin: asset }, (event) => handleBook(asset, event));
    for (const nSigFigs of WIDE_BOOK_N_SIG_FIGS) {
      await subscriptions.l2Book({ coin: asset, nSigFigs }, (event) => handleBook(asset, event));
    }
    await subscriptions.trades({ coin: asset }, (event) => handleTrades(asset, event));
    console.log(`[reaction-map] subscribed ${asset} wideBooks=${WIDE_BOOK_N_SIG_FIGS.join(",") || "off"}`);
    return true;
  } catch (error) {
    console.warn(`[reaction-map] skipped ${asset}; subscription failed`, error);
    return false;
  }
}

async function main() {
  await assertSchemaReady();
  ASSETS = await resolveReactionAssets();
  const listenerLimit = Math.max(64, ASSETS.length * (WIDE_BOOK_N_SIG_FIGS.length + 3));
  setMaxListeners(listenerLimit, transport._hlEvents, transport.socket);
  setMaxListeners(listenerLimit);
  console.log(
    `[reaction-map] starting network=${NETWORK} assetCount=${ASSETS.length} assets=${ASSETS.slice(0, 24).join(",")}${ASSETS.length > 24 ? ",..." : ""} bucketMs=${BUCKET_MS}`,
  );

  for (const asset of ASSETS) {
    getAssetState(asset);
    await subscribeAsset(asset);
  }

  setInterval(() => {
    runExclusive("flush", flushStateKey, flushState).catch((error) => console.error("[reaction-map] flush failed", error));
  }, FLUSH_MS);

  setInterval(() => {
    runExclusive("promote", promotionStateKey, promoteExposureZones).catch((error) =>
      console.error("[reaction-map] promote failed", error),
    );
  }, PROMOTE_MS);

  setTimeout(() => {
    runExclusive("retention sweep", retentionStateKey, sweepRetention).catch((error) =>
      console.error("[reaction-map] retention sweep failed", error),
    );
    setInterval(() => {
      runExclusive("retention sweep", retentionStateKey, sweepRetention).catch((error) =>
        console.error("[reaction-map] retention sweep failed", error),
      );
    }, RETENTION_SWEEP_MS);
  }, RETENTION_INITIAL_DELAY_MS);
}

process.on("SIGTERM", async () => {
  console.log("[reaction-map] SIGTERM received, flushing before exit");
  await flushState().catch((error) => console.error("[reaction-map] final flush failed", error));
  await pool.end().catch(() => {});
  process.exit(0);
});

main().catch(async (error) => {
  console.error("[reaction-map] fatal", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
