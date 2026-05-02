import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";

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

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
if (!DATABASE_URL) {
  console.error("[reaction-map] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const NETWORK = process.env.HYPERPULSE_NETWORK === "testnet" ? "testnet" : "mainnet";
const ASSETS = parseList(process.env.REACTION_MAP_ASSETS, ["BTC", "ETH", "SOL", "HYPE"]).map((asset) =>
  asset.toUpperCase(),
);
const WIDE_BOOK_N_SIG_FIGS = parseList(process.env.REACTION_MAP_WIDE_BOOK_N_SIG_FIGS, ["3", "2"])
  .map((value) => Number(value))
  .filter((value) => [2, 3, 4, 5].includes(value));
const BUCKET_MS = envNumber("REACTION_MAP_BUCKET_MS", 60_000, 5_000);
const FLUSH_MS = envNumber("REACTION_MAP_FLUSH_MS", 15_000, 2_000);
const BOOK_LEVEL_LIMIT = envNumber("REACTION_MAP_BOOK_LEVEL_LIMIT", 40, 5);
const RETENTION_MS = envNumber("REACTION_MAP_RETENTION_MS", 24 * 60 * 60 * 1000, 30 * 60 * 1000);
const RETENTION_SWEEP_MS = envNumber("REACTION_MAP_RETENTION_SWEEP_MS", 10 * 60 * 1000, 60_000);
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
const transport = new WebSocketTransport({ isTestnet: NETWORK === "testnet" });
const subscriptions = new SubscriptionClient({ transport });
const assetStates = new Map();

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envNumber(key, fallback, min = 0) {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, min);
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
  if (currentPrice >= 100) return 5;
  if (currentPrice >= 10) return 0.5;
  if (currentPrice >= 1) return 0.05;
  return 0.005;
}

function bucketPrice(price, bucketSize) {
  if (!Number.isFinite(price) || !Number.isFinite(bucketSize) || bucketSize <= 0) return null;
  const value = Math.round(price / bucketSize) * bucketSize;
  return Number(value.toFixed(bucketSize < 1 ? 4 : bucketSize < 10 ? 2 : 0));
}

function hashUser(user) {
  return createHash("sha256").update(String(user).toLowerCase()).digest("hex").slice(0, 16);
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
    };
    assetStates.set(normalized, state);
  }
  return state;
}

function bucketKey(bucketMs, priceBucket) {
  return `${bucketMs}:${priceBucket}`;
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

async function flushBookRow(row) {
  await pool.query(
    `
    insert into reaction_orderbook_buckets (
      id, asset, bucket_ms, price_bucket, bucket_size, bid_notional_usd, ask_notional_usd,
      peak_bid_notional_usd, peak_ask_notional_usd, order_count, sample_count,
      first_seen_at, last_seen_at, payload
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
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
    [
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
    ],
  );
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

async function flushState() {
  const currentBucket = bucketTime(Date.now());
  let contextRows = 0;
  let bookRows = 0;
  let tradeRows = 0;

  for (const state of assetStates.values()) {
    for (const [bucketMs, row] of state.contextBuckets.entries()) {
      await flushContextRow(row);
      contextRows += 1;
      if (bucketMs < currentBucket) state.contextBuckets.delete(bucketMs);
    }

    for (const [key, row] of state.bookBuckets.entries()) {
      await flushBookRow(row);
      bookRows += 1;
      if (row.bucketMs < currentBucket) state.bookBuckets.delete(key);
    }

    for (const [key, row] of state.tradeBuckets.entries()) {
      await flushTradeRow(row);
      tradeRows += 1;
      if (row.bucketMs < currentBucket) state.tradeBuckets.delete(key);
    }
  }

  if (contextRows || bookRows || tradeRows) {
    console.log(`[reaction-map] flushed context=${contextRows} book=${bookRows} trades=${tradeRows}`);
  }
}

async function sweepRetention() {
  const cutoff = Date.now() - RETENTION_MS;
  await pool.query("delete from reaction_context_snapshots where bucket_ms < $1", [cutoff]);
  await pool.query("delete from reaction_orderbook_buckets where bucket_ms < $1", [cutoff]);
  await pool.query("delete from reaction_trade_buckets where bucket_ms < $1", [cutoff]);
  await pool.query("delete from reaction_level_snapshots where generated_at < $1", [cutoff]);
}

async function subscribeAsset(asset) {
  await subscriptions.activeAssetCtx({ coin: asset }, (event) => handleContext(asset, event));
  await subscriptions.l2Book({ coin: asset }, (event) => handleBook(asset, event));
  for (const nSigFigs of WIDE_BOOK_N_SIG_FIGS) {
    await subscriptions.l2Book({ coin: asset, nSigFigs }, (event) => handleBook(asset, event));
  }
  await subscriptions.trades({ coin: asset }, (event) => handleTrades(asset, event));
  console.log(`[reaction-map] subscribed ${asset} wideBooks=${WIDE_BOOK_N_SIG_FIGS.join(",") || "off"}`);
}

async function main() {
  await assertSchemaReady();
  console.log(`[reaction-map] starting network=${NETWORK} assets=${ASSETS.join(",")} bucketMs=${BUCKET_MS}`);

  for (const asset of ASSETS) {
    getAssetState(asset);
    await subscribeAsset(asset);
  }

  setInterval(() => {
    flushState().catch((error) => console.error("[reaction-map] flush failed", error));
  }, FLUSH_MS);

  setInterval(() => {
    sweepRetention().catch((error) => console.error("[reaction-map] retention sweep failed", error));
  }, RETENTION_SWEEP_MS);
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
