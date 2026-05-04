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
const ASSETS = parseList(process.env.REACTION_MAP_ASSETS, ["BTC", "ETH", "SOL"]).map((asset) =>
  asset.toUpperCase(),
);
const ZONE_WINDOWS_MS = parseList(process.env.REACTION_MAP_ZONE_WINDOWS, ["5m", "15m", "1h"])
  .map(windowMsFromLabel)
  .filter((value) => value != null);
const WIDE_BOOK_N_SIG_FIGS = parseList(process.env.REACTION_MAP_WIDE_BOOK_N_SIG_FIGS, ["3", "2"])
  .map((value) => Number(value))
  .filter((value) => [2, 3, 4, 5].includes(value));
const BUCKET_MS = envNumber("REACTION_MAP_BUCKET_MS", 60_000, 5_000);
const FLUSH_MS = envNumber("REACTION_MAP_FLUSH_MS", 15_000, 2_000);
const BOOK_LEVEL_LIMIT = envNumber("REACTION_MAP_BOOK_LEVEL_LIMIT", 40, 5);
const RETENTION_MS = envNumber("REACTION_MAP_RETENTION_MS", 24 * 60 * 60 * 1000, 30 * 60 * 1000);
const RETENTION_SWEEP_MS = envNumber("REACTION_MAP_RETENTION_SWEEP_MS", 10 * 60 * 1000, 60_000);
const ZONE_CLUSTER_WIDTH_PCT = envNumber("REACTION_MAP_ZONE_CLUSTER_WIDTH_PCT", 0.8, 0.1);
const ZONE_MIN_TRADE_NOTIONAL_USD = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD", 250_000, 1_000);
const ZONE_RANGE_MIN_PCT = envNumber("REACTION_MAP_CLEANUP_RANGE_MIN_PCT", 2, 0.5);
const ZONE_RANGE_MAX_PCT = envNumber("REACTION_MAP_CLEANUP_RANGE_MAX_PCT", 35, 5);
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

function compactUsd(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function zoneSideFor(price, currentPrice, buyNotionalUsd, sellNotionalUsd) {
  if (price < currentPrice) return "bull";
  if (price > currentPrice) return "bear";
  return buyNotionalUsd >= sellNotionalUsd ? "bull" : "bear";
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

async function recentAverageMovePct(asset, cutoff, currentPrice) {
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
  if (prices.length < 2 || !currentPrice) return ZONE_RANGE_MIN_PCT;

  const moves = [];
  for (let index = 1; index < prices.length; index += 1) {
    moves.push(Math.abs((prices[index] - prices[index - 1]) / currentPrice) * 100);
  }
  const average = moves.reduce((sum, value) => sum + value, 0) / Math.max(moves.length, 1);
  return Math.min(ZONE_RANGE_MAX_PCT, Math.max(ZONE_RANGE_MIN_PCT, average * 3));
}

async function loadZoneCandidates(asset, windowMs, currentPrice) {
  const cutoff = Date.now() - windowMs;
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
      [asset, cutoff, currentPrice * 0.65, currentPrice * 1.35],
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
      [asset, cutoff, currentPrice * 0.65, currentPrice * 1.35],
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
      };
    })
    .filter((row) => row.tradeNotionalUsd >= ZONE_MIN_TRADE_NOTIONAL_USD);
}

function clusterCandidates(candidates, currentPrice) {
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
      if (!lastCluster || distance > ZONE_CLUSTER_WIDTH_PCT) clusters.push([candidate]);
      else lastCluster.push(candidate);
    }
    bySide[side] = clusters.map((cluster) => buildZoneFromCluster(cluster, side, currentPrice));
  }
  return bySide;
}

function buildZoneFromCluster(cluster, side, currentPrice) {
  const weightedPrice = weightedZonePrice(cluster);
  const zoneLow = Math.min(...cluster.map((item) => item.priceBucket - item.bucketSize / 2));
  const zoneHigh = Math.max(...cluster.map((item) => item.priceBucket + item.bucketSize / 2));
  const tradeNotionalUsd = cluster.reduce((sum, item) => sum + item.tradeNotionalUsd, 0);
  const buyNotionalUsd = cluster.reduce((sum, item) => sum + item.buyNotionalUsd, 0);
  const sellNotionalUsd = cluster.reduce((sum, item) => sum + item.sellNotionalUsd, 0);
  const inferredOiNotionalUsd = cluster.reduce((sum, item) => sum + item.inferredOiNotionalUsd, 0);
  const bookNotionalUsd = cluster.reduce((sum, item) => sum + item.bookNotionalUsd, 0);
  const bidDepthUsd = cluster.reduce((sum, item) => sum + item.bidDepthUsd, 0);
  const askDepthUsd = cluster.reduce((sum, item) => sum + item.askDepthUsd, 0);
  const walletCount = Math.max(...cluster.map((item) => item.uniqueTraderCount), 0);
  const clusterWidthPct = ((zoneHigh - zoneLow) / currentPrice) * 100;
  const distancePct = ((weightedPrice - currentPrice) / currentPrice) * 100;
  const score = Math.round(
    Math.min(
      100,
      Math.log10(tradeNotionalUsd + 1) * 8 +
        Math.log10(inferredOiNotionalUsd + 1) * 6 +
        Math.log10(bookNotionalUsd + 1) * 4 +
        Math.min(12, Math.abs(buyNotionalUsd - sellNotionalUsd) / Math.max(tradeNotionalUsd, 1) * 12),
    ),
  );
  const reasonSelected = `Top ${side} OI zone from ${cluster.length} clustered flow bucket${cluster.length === 1 ? "" : "s"}`;

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
    bookNotionalUsd,
    tradeNotionalUsd,
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

async function upsertExposureZones(asset, windowMs, currentPrice, zones) {
  const now = Date.now();
  const existingResult = await pool.query(
    `
    select zone_id, first_seen_at, score, zone_low, zone_high, rank, status
    from reaction_exposure_zones_current
    where asset = $1
      and window_ms = $2
    `,
    [asset, windowMs],
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
      const ranked = zones[side]
        .sort((a, b) => b.score - a.score || b.tradeNotionalUsd - a.tradeNotionalUsd)
        .slice(0, 5);

      for (const [index, zone] of ranked.entries()) {
        const rank = index + 1;
        const zoneId = zoneIdentity(asset, windowMs, side, zone.zoneLow, zone.zoneHigh);
        const existingZone = existing.get(zoneId);
        const firstSeenAt = parseNumber(existingZone?.first_seen_at) ?? now;
        const tooltip = {
          rank,
          side,
          range: `${zone.zoneLow.toFixed(asset === "BTC" ? 0 : 2)}-${zone.zoneHigh.toFixed(asset === "BTC" ? 0 : 2)}`,
          totalRecentFlowUsd: zone.tradeNotionalUsd,
          inferredOiUsd: zone.inferredOiNotionalUsd,
          buyNotionalUsd: zone.buyNotionalUsd,
          sellNotionalUsd: zone.sellNotionalUsd,
          distancePct: zone.distancePct,
          reasonSelected: zone.reasonSelected,
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
            $1,$2,$3,$4,$5,'active',$6,$6,$7,$6,$8,$9,$10,$11,$12,$13,$14,$15,'positioning',
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
            JSON.stringify({ source: "hyperliquid_ws", clusterWidthPct: ZONE_CLUSTER_WIDTH_PCT }),
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
      const candidates = await loadZoneCandidates(asset, windowMs, currentPrice);
      const zones = clusterCandidates(candidates, currentPrice);
      await upsertExposureZones(asset, windowMs, currentPrice, zones);
    }
  }
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

  for (const asset of ASSETS) {
    const context = await latestContext(asset, Date.now() - RETENTION_MS);
    const currentPrice = parseNumber(context?.mark_px) ?? parseNumber(context?.mid_px) ?? parseNumber(context?.oracle_px);
    if (!currentPrice || currentPrice <= 0) continue;

    const rangePct = await recentAverageMovePct(asset, Date.now() - RETENTION_MS, currentPrice);
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
    flushState()
      .then(() => promoteExposureZones())
      .catch((error) => console.error("[reaction-map] flush/promote failed", error));
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
