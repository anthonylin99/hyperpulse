import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Pool } from "pg";
import { existsSync, readFileSync } from "node:fs";

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
  console.error("[market-collector] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const NETWORK = process.env.HYPERPULSE_NETWORK === "testnet" ? "testnet" : "mainnet";
const ASSET_LIMIT = clampInt(process.env.MARKET_COLLECTOR_ASSET_LIMIT, 15, 1, 25);
const CONFIGURED_ASSETS = parseList(process.env.MARKET_COLLECTOR_ASSETS);
const CANDLE_INTERVALS = parseList(process.env.MARKET_COLLECTOR_INTERVALS, ["5m", "15m", "1h", "1d"]);
const LEVEL_INTERVALS = parseList(process.env.MARKET_COLLECTOR_LEVEL_INTERVALS, ["15m", "1h"]);
const LOOP_INTERVAL_MS = Math.max(Number(process.env.MARKET_COLLECTOR_INTERVAL_MS ?? 300_000), 60_000);
const FUNDING_REFRESH_MS = Math.max(Number(process.env.MARKET_COLLECTOR_FUNDING_REFRESH_MS ?? 60 * 60 * 1000), 10 * 60 * 1000);
const RUN_ONCE = process.argv.includes("--once") || process.env.MARKET_COLLECTOR_ONCE === "true";
const WORKER = "market-collector";
const FEATURE_VERSION = "market_features.v1";
const LEVEL_VERSION = "level_observation.v1";
const LABEL_VERSION = "level_label.v1";
const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: NETWORK === "testnet" }) });

const INTERVAL_MS = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
};

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTime(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
}

function assetKey(asset, marketType = "crypto_perp", dex = "main") {
  return `${marketType}:${dex}:${asset}`;
}

function bucketTime(time, intervalMs) {
  return Math.floor(time / intervalMs) * intervalMs;
}

function initialLookbackMs(interval) {
  const overrideDays = Number(process.env.MARKET_COLLECTOR_INITIAL_LOOKBACK_DAYS);
  if (Number.isFinite(overrideDays) && overrideDays > 0) return overrideDays * 24 * 60 * 60 * 1000;
  if (interval === "5m") return 3 * 24 * 60 * 60 * 1000;
  if (interval === "15m") return 7 * 24 * 60 * 60 * 1000;
  if (interval === "1h") return 30 * 24 * 60 * 60 * 1000;
  if (interval === "1d") return 365 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function stddev(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function candleToRow(asset, marketType, interval, candle) {
  const openTime = normalizeTime(candle.t ?? candle.time ?? candle.openTime);
  if (!openTime) return null;
  const open = parseNumber(candle.o ?? candle.open);
  const high = parseNumber(candle.h ?? candle.high);
  const low = parseNumber(candle.l ?? candle.low);
  const close = parseNumber(candle.c ?? candle.close);
  if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return null;
  const intervalMs = INTERVAL_MS[interval] ?? 0;
  const closeTime = normalizeTime(candle.T ?? candle.closeTime) || openTime + intervalMs - 1;
  return {
    assetKey: assetKey(asset, marketType),
    asset,
    marketType,
    interval,
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume: parseNumber(candle.v ?? candle.volume),
    tradeCount: Number.isFinite(Number(candle.n)) ? Number(candle.n) : null,
    payload: candle,
  };
}

async function assertWarehouseReady() {
  const result = await pool.query("select to_regclass('public.market_candles') as table_name");
  if (!result.rows[0]?.table_name) {
    throw new Error("Warehouse tables are missing. Run `npm run db:migrate` before starting market collector.");
  }
}

async function startRun(payload = {}) {
  const id = `${WORKER}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  await pool.query(
    `insert into worker_runs (id, worker, started_at, status, payload) values ($1, $2, $3, $4, $5)`,
    [id, WORKER, Date.now(), "running", payload],
  );
  return id;
}

async function finishRun(id, status, message = null, payload = {}) {
  await pool.query(
    `update worker_runs set completed_at = $2, status = $3, message = $4, payload = payload || $5::jsonb where id = $1`,
    [id, Date.now(), status, message, payload],
  );
}

async function getCheckpoint(source) {
  const result = await pool.query(`select cursor_ms, cursor_text, payload from ingestion_checkpoints where source = $1 limit 1`, [source]);
  return result.rows[0] ?? null;
}

async function setCheckpoint(source, cursorMs, payload = {}, status = "ok") {
  await pool.query(
    `insert into ingestion_checkpoints (source, cursor_ms, updated_at, status, payload)
     values ($1, $2, $3, $4, $5)
     on conflict (source) do update set
       cursor_ms = excluded.cursor_ms,
       updated_at = excluded.updated_at,
       status = excluded.status,
       payload = ingestion_checkpoints.payload || excluded.payload`,
    [source, cursorMs, Date.now(), status, payload],
  );
}

async function loadUniverse() {
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const assets = meta.universe
    .map((asset, index) => {
      const ctx = ctxs[index] ?? {};
      const markPx = parseNumber(ctx.markPx);
      const dayVolumeUsd = parseNumber(ctx.dayNtlVlm);
      const openInterestUsd = parseNumber(ctx.openInterest) * markPx;
      return {
        asset: asset.name,
        symbol: asset.name,
        assetIndex: index,
        marketType: "crypto_perp",
        dex: "main",
        szDecimals: Number(asset.szDecimals ?? 0),
        maxLeverage: parseNumber(asset.maxLeverage),
        isActive: !asset.isDelisted,
        ctx,
        score: dayVolumeUsd + openInterestUsd * 0.25,
      };
    })
    .filter((asset) => asset.isActive && asset.score > 0);

  const selected = CONFIGURED_ASSETS.length > 0
    ? CONFIGURED_ASSETS.map((name) => assets.find((asset) => asset.asset.toUpperCase() === name.toUpperCase())).filter(Boolean)
    : assets.sort((a, b) => b.score - a.score).slice(0, ASSET_LIMIT);

  await upsertAssets(selected);
  return selected;
}

async function upsertAssets(assets) {
  const now = Date.now();
  for (const asset of assets) {
    await pool.query(
      `insert into market_assets (
        asset_key, asset, symbol, market_type, dex, asset_index, sz_decimals, max_leverage, is_active, first_seen_at, last_seen_at, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (asset_key) do update set
        asset_index = excluded.asset_index,
        sz_decimals = excluded.sz_decimals,
        max_leverage = excluded.max_leverage,
        is_active = excluded.is_active,
        last_seen_at = excluded.last_seen_at,
        payload = excluded.payload`,
      [
        assetKey(asset.asset, asset.marketType, asset.dex),
        asset.asset,
        asset.symbol,
        asset.marketType,
        asset.dex,
        asset.assetIndex,
        asset.szDecimals,
        asset.maxLeverage || null,
        asset.isActive,
        now,
        now,
        JSON.stringify({ ctx: asset.ctx }),
      ],
    );
  }
}

async function insertCandles(rows) {
  let count = 0;
  for (const row of rows) {
    await pool.query(
      `insert into market_candles (
        asset_key, asset, market_type, interval, open_time, close_time, open, high, low, close, volume, trade_count, captured_at, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict (asset_key, interval, open_time) do update set
        close_time = excluded.close_time,
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        trade_count = excluded.trade_count,
        captured_at = excluded.captured_at,
        payload = excluded.payload`,
      [
        row.assetKey,
        row.asset,
        row.marketType,
        row.interval,
        row.openTime,
        row.closeTime,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        row.tradeCount,
        Date.now(),
        JSON.stringify(row.payload),
      ],
    );
    count += 1;
  }
  return count;
}

async function collectCandlesForAsset(assetName, marketType) {
  let inserted = 0;
  for (const interval of CANDLE_INTERVALS) {
    const intervalMs = INTERVAL_MS[interval];
    if (!intervalMs) {
      console.warn(`[market-collector] unsupported interval ${interval}`);
      continue;
    }
    const checkpointKey = `market_candles:${assetName}:${interval}`;
    const checkpoint = await getCheckpoint(checkpointKey);
    const endTime = bucketTime(Date.now(), intervalMs) - 1;
    const startTime = checkpoint?.cursor_ms
      ? checkpoint.cursor_ms + intervalMs
      : Math.max(1, endTime - initialLookbackMs(interval));
    if (startTime >= endTime) continue;

    const candles = await info.candleSnapshot({ coin: assetName, interval, startTime, endTime });
    const rows = candles.map((candle) => candleToRow(assetName, marketType, interval, candle)).filter(Boolean);
    inserted += await insertCandles(rows);
    const latestOpen = rows.reduce((latest, row) => Math.max(latest, row.openTime), 0);
    await setCheckpoint(checkpointKey, latestOpen || endTime - intervalMs, { interval, rows: rows.length });
  }
  return inserted;
}

async function insertContextSnapshots(selectedAssets) {
  const now = Date.now();
  const capturedAt = bucketTime(now, LOOP_INTERVAL_MS);
  let count = 0;
  for (const asset of selectedAssets) {
    const ctx = asset.ctx ?? {};
    const markPx = parseNumber(ctx.markPx);
    const prevDayPx = parseNumber(ctx.prevDayPx);
    const fundingRate = parseNumber(ctx.funding);
    const openInterestCoin = parseNumber(ctx.openInterest);
    const openInterestUsd = openInterestCoin * markPx;
    const key = assetKey(asset.asset, asset.marketType, asset.dex);
    const id = `${key}:${capturedAt}`;
    await pool.query(
      `insert into market_context_snapshots (
        id, asset_key, asset, market_type, captured_at, mark_px, mid_px, oracle_px, prev_day_px,
        funding_rate, funding_apr, open_interest_coin, open_interest_usd, day_volume_usd, price_change_24h, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (id) do update set
        mark_px = excluded.mark_px,
        mid_px = excluded.mid_px,
        oracle_px = excluded.oracle_px,
        prev_day_px = excluded.prev_day_px,
        funding_rate = excluded.funding_rate,
        funding_apr = excluded.funding_apr,
        open_interest_coin = excluded.open_interest_coin,
        open_interest_usd = excluded.open_interest_usd,
        day_volume_usd = excluded.day_volume_usd,
        price_change_24h = excluded.price_change_24h,
        payload = excluded.payload`,
      [
        id,
        key,
        asset.asset,
        asset.marketType,
        capturedAt,
        markPx || null,
        parseNumber(ctx.midPx) || null,
        parseNumber(ctx.oraclePx) || null,
        prevDayPx || null,
        fundingRate,
        fundingRate * 8760 * 100,
        openInterestCoin || null,
        openInterestUsd || null,
        parseNumber(ctx.dayNtlVlm) || null,
        pctChange(markPx, prevDayPx),
        JSON.stringify(ctx),
      ],
    );
    count += 1;
  }
  return count;
}

async function collectFundingForAsset(assetName, marketType) {
  const checkpointKey = `market_funding:${assetName}`;
  const checkpoint = await getCheckpoint(checkpointKey);
  const now = Date.now();
  const lastFundingRefresh = Number(checkpoint?.payload?.lastRefreshAt ?? 0);
  if (checkpoint?.cursor_ms && now - lastFundingRefresh < FUNDING_REFRESH_MS) return 0;

  const startTime = checkpoint?.cursor_ms ? checkpoint.cursor_ms + 1 : now - 7 * 24 * 60 * 60 * 1000;
  const history = await info.fundingHistory({ coin: assetName, startTime, endTime: now });
  let latest = checkpoint?.cursor_ms ?? 0;
  let count = 0;
  for (const row of history ?? []) {
    const time = normalizeTime(row.time);
    if (!time) continue;
    const fundingRate = parseNumber(row.fundingRate);
    await pool.query(
      `insert into market_funding_rates (
        asset_key, asset, market_type, time, funding_rate, funding_apr, premium, captured_at, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (asset_key, time) do update set
        funding_rate = excluded.funding_rate,
        funding_apr = excluded.funding_apr,
        premium = excluded.premium,
        captured_at = excluded.captured_at,
        payload = excluded.payload`,
      [
        assetKey(assetName, marketType),
        assetName,
        marketType,
        time,
        fundingRate,
        fundingRate * 8760 * 100,
        row.premium != null ? parseNumber(row.premium) : null,
        Date.now(),
        JSON.stringify(row),
      ],
    );
    latest = Math.max(latest, time);
    count += 1;
  }
  await setCheckpoint(checkpointKey, latest || now, { rows: count, lastRefreshAt: now });
  return count;
}

async function loadCandles(assetKeyValue, interval, limit) {
  const result = await pool.query(
    `select open_time, close_time, open, high, low, close, volume
     from market_candles
     where asset_key = $1 and interval = $2
     order by open_time desc
     limit $3`,
    [assetKeyValue, interval, limit],
  );
  return result.rows.reverse().map((row) => ({
    time: Number(row.open_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

function averageTrueRangePct(candles, length = 14) {
  const scoped = candles.slice(-length);
  if (scoped.length < 2) return null;
  const atr = scoped.reduce((sum, candle, index) => {
    const previousClose = index === 0 ? candle.close : scoped[index - 1].close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    return sum + trueRange;
  }, 0) / scoped.length;
  const close = scoped[scoped.length - 1].close;
  return close > 0 ? (atr / close) * 100 : null;
}

async function insertFeatureSnapshot(assetName, marketType) {
  const key = assetKey(assetName, marketType);
  const candles = await loadCandles(key, "5m", 288);
  if (candles.length < 12) return false;
  const latest = candles[candles.length - 1];
  const returns = candles.slice(1).map((candle, index) => pctChange(candle.close, candles[index].close)).filter((value) => value != null);
  const vol = stddev(returns);
  const context = await pool.query(
    `select funding_apr, open_interest_usd from market_context_snapshots where asset_key = $1 order by captured_at desc limit 1`,
    [key],
  );
  const valueAt = (lookbackCandles) => candles.length > lookbackCandles ? candles[candles.length - 1 - lookbackCandles].close : null;
  const featureTime = bucketTime(latest.time, INTERVAL_MS["5m"]);
  const payload = {
    source: "market-collector",
    candleCount: candles.length,
    close: latest.close,
    featureTimestamp: featureTime,
  };
  await pool.query(
    `insert into feature_snapshots (
      id, asset_key, asset, market_type, feature_time, horizon_set, feature_version,
      return_5m, return_1h, return_4h, return_24h, realized_vol_24h, atr_pct,
      funding_apr, open_interest_usd, payload
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    on conflict (id) do update set
      return_5m = excluded.return_5m,
      return_1h = excluded.return_1h,
      return_4h = excluded.return_4h,
      return_24h = excluded.return_24h,
      realized_vol_24h = excluded.realized_vol_24h,
      atr_pct = excluded.atr_pct,
      funding_apr = excluded.funding_apr,
      open_interest_usd = excluded.open_interest_usd,
      payload = excluded.payload`,
    [
      `${key}:${FEATURE_VERSION}:${featureTime}`,
      key,
      assetName,
      marketType,
      featureTime,
      "5m-24h",
      FEATURE_VERSION,
      pctChange(latest.close, valueAt(1)),
      pctChange(latest.close, valueAt(12)),
      pctChange(latest.close, valueAt(48)),
      pctChange(latest.close, valueAt(287)),
      vol == null ? null : vol * Math.sqrt(288),
      averageTrueRangePct(candles),
      context.rows[0]?.funding_apr ?? null,
      context.rows[0]?.open_interest_usd ?? null,
      JSON.stringify(payload),
    ],
  );
  return true;
}

function isPivotHigh(candles, index, length) {
  const high = candles[index].high;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].high >= high || candles[index + offset].high > high) return false;
  }
  return true;
}

function isPivotLow(candles, index, length) {
  const low = candles[index].low;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].low <= low || candles[index + offset].low < low) return false;
  }
  return true;
}

function levelBroken(candles, pivotIndex, kind, price, atrPct) {
  const buffer = Math.max(price * 0.001, price * ((atrPct ?? 0.5) / 100) * 0.2);
  const after = candles.slice(pivotIndex + 1);
  return kind === "support"
    ? after.some((candle) => candle.close < price - buffer)
    : after.some((candle) => candle.close > price + buffer);
}

function buildLevelCandidates(candles, interval) {
  if (candles.length < 30) return [];
  const currentPrice = candles[candles.length - 1].close;
  const currentPriceTime = candles[candles.length - 1].time;
  const atrPct = averageTrueRangePct(candles) ?? 0.5;
  const length = interval === "15m" ? 6 : 5;
  const candidates = [];
  const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS["15m"];
  const maxDistancePct = 25;
  const dedupeThresholdPct = 0.003;
  for (let index = length; index < candles.length - length; index += 1) {
    const candle = candles[index];
    for (const [kind, price, pivot] of [
      ["resistance", candle.high, isPivotHigh(candles, index, length)],
      ["support", candle.low, isPivotLow(candles, index, length)],
    ]) {
      if (!pivot || levelBroken(candles, index, kind, price, atrPct)) continue;
      const discoveredAt = (candles[index + length]?.time ?? candle.time) + intervalMs;
      const distancePct = pctChange(price, currentPrice);
      if (distancePct == null || Math.abs(distancePct) > maxDistancePct) continue;
      const tolerance = Math.max(currentPrice * 0.0015, currentPrice * (atrPct / 100) * 0.35);
      const knownAtDiscovery = candles.slice(0, index + length + 1);
      const touches = knownAtDiscovery.filter((entry) => entry.low <= price + tolerance && entry.high >= price - tolerance).length;
      const recencyScore = index / candles.length;
      const strength = touches + recencyScore * 2 + (1 / Math.max(Math.abs(distancePct), 0.25));
      candidates.push({
        kind,
        price,
        distancePct,
        touches,
        strength,
        atrPct,
        pivotTime: candle.time,
        discoveredAt,
        confirmationBars: length,
        zoneLow: kind === "support" ? price - tolerance : price - tolerance * 0.65,
        zoneHigh: kind === "support" ? price + tolerance * 0.65 : price + tolerance,
        replay: {
          inputStartTime: candles[0].time,
          inputEndTime: currentPriceTime,
          lookbackCandles: candles.length,
          pivotIndex: index,
          pivotLeftBars: length,
          pivotRightBars: length,
          intervalMs,
          currentPriceTime,
          tolerancePrice: tolerance,
          tolerancePct: tolerance / currentPrice,
          maxDistancePct,
          dedupeThresholdPct,
          topN: 6,
          brokenFilter: {
            minPriceBufferPct: 0.001,
            atrMultiplier: 0.2,
          },
        },
      });
    }
  }
  return candidates
    .sort((a, b) => b.strength - a.strength)
    .filter((candidate, index, arr) => arr.findIndex((other) => other.kind === candidate.kind && Math.abs(other.price - candidate.price) / currentPrice < dedupeThresholdPct) === index)
    .slice(0, 6)
    .map((candidate, candidateRank) => ({
      ...candidate,
      replay: {
        ...candidate.replay,
        candidateRank: candidateRank + 1,
      },
    }));
}

async function insertLevelObservations(assetName, marketType) {
  const key = assetKey(assetName, marketType);
  let inserted = 0;
  for (const interval of LEVEL_INTERVALS) {
    const candles = await loadCandles(key, interval, 240);
    if (candles.length < 30) continue;
    const observedAt = bucketTime(candles[candles.length - 1].time, INTERVAL_MS[interval] ?? INTERVAL_MS["15m"]);
    const currentPrice = candles[candles.length - 1].close;
    const levels = buildLevelCandidates(candles, interval);
    for (const level of levels) {
      const roundedPrice = level.price >= 100 ? level.price.toFixed(2) : level.price >= 1 ? level.price.toFixed(4) : level.price.toFixed(8);
      const id = `${key}:${interval}:${observedAt}:${level.kind}:${roundedPrice}`;
      await pool.query(
        `insert into level_observations (
          id, asset_key, asset, market_type, interval, observed_at, kind, level_price, source,
          distance_pct, strength, touches, atr_pct, feature_version, payload
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        on conflict (id) do nothing`,
        [
          id,
          key,
          assetName,
          marketType,
          interval,
          observedAt,
          level.kind,
          level.price,
          "structure_pivot",
          level.distancePct,
          level.strength,
          level.touches,
          level.atrPct,
          LEVEL_VERSION,
          JSON.stringify({
            currentPrice,
            pivotTime: level.pivotTime,
            discoveredAt: level.discoveredAt,
            confirmationBars: level.confirmationBars,
            zoneLow: level.zoneLow,
            zoneHigh: level.zoneHigh,
            replay: level.replay,
            antiRepaint: true,
            note: "Level was generated from closed candles only; pivot is not actionable until discoveredAt.",
          }),
        ],
      );
      inserted += 1;
    }
  }
  return inserted;
}

async function labelResolvedLevels() {
  const horizonMinutes = 240;
  const horizonMs = horizonMinutes * 60_000;
  const result = await pool.query(
    `select lo.*
     from level_observations lo
     where lo.observed_at < $1
       and not exists (
         select 1 from training_labels tl
         where tl.entity_type = 'level_observation'
           and tl.entity_id = lo.id
           and tl.horizon_minutes = $2
           and tl.label_version = $3
       )
     order by lo.observed_at asc
     limit 200`,
    [Date.now() - horizonMs, horizonMinutes, LABEL_VERSION],
  );

  let inserted = 0;
  for (const level of result.rows) {
    const candlesResult = await pool.query(
      `select open_time, open, high, low, close
       from market_candles
       where asset_key = $1 and interval = $2 and open_time > $3 and open_time <= $4
       order by open_time asc`,
      [level.asset_key, level.interval, Number(level.observed_at), Number(level.observed_at) + horizonMs],
    );
    const candles = candlesResult.rows.map((row) => ({
      time: Number(row.open_time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }));
    if (candles.length < 2) continue;

    const currentPrice = Number(level.payload?.currentPrice ?? candles[0].open);
    const levelPrice = Number(level.level_price);
    const atrPct = Number(level.atr_pct ?? 0.5);
    const bandPct = Math.max(0.0015, (atrPct / 100) * 0.35);
    let touched = false;
    let timeToTouchMs = null;
    let firstTouchTime = null;
    let firstBreakTime = null;
    let favorablePct = 0;
    let broken = false;

    const closes = candles.map((candle) => candle.close);
    const highs = candles.map((candle) => candle.high);
    const lows = candles.map((candle) => candle.low);
    const maxUpPct = pctChange(Math.max(...highs), currentPrice);
    const maxDownPct = pctChange(Math.min(...lows), currentPrice);
    const forwardReturnPct = pctChange(closes[closes.length - 1], currentPrice);

    for (const candle of candles) {
      const touchedThisCandle = candle.low <= levelPrice * (1 + bandPct) && candle.high >= levelPrice * (1 - bandPct);
      if (touchedThisCandle && !touched) {
        touched = true;
        timeToTouchMs = candle.time - Number(level.observed_at);
        firstTouchTime = candle.time;
      }
      if (level.kind === "support") {
        if (candle.close < levelPrice * (1 - bandPct)) {
          broken = true;
          firstBreakTime ??= candle.time;
        }
        favorablePct = Math.max(favorablePct, pctChange(candle.high, levelPrice) ?? 0);
      } else {
        if (candle.close > levelPrice * (1 + bandPct)) {
          broken = true;
          firstBreakTime ??= candle.time;
        }
        favorablePct = Math.max(favorablePct, pctChange(levelPrice, candle.low) ?? 0);
      }
    }

    const respectThresholdPct = Math.max(0.4, atrPct * 0.75);
    const maxFavorablePct = favorablePct;
    const maxAdversePct = level.kind === "support" ? Math.abs(Math.min(maxDownPct ?? 0, 0)) : Math.max(maxUpPct ?? 0, 0);
    const respected = touched && !broken && favorablePct >= respectThresholdPct;
    await pool.query(
      `insert into training_labels (
        id, entity_type, entity_id, asset_key, asset, market_type, feature_time, horizon_minutes,
        forward_return_pct, max_up_pct, max_down_pct, touched, respected, broken, time_to_touch_ms, label_version, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do nothing`,
      [
        `level:${level.id}:h${horizonMinutes}:${LABEL_VERSION}`,
        "level_observation",
        level.id,
        level.asset_key,
        level.asset,
        level.market_type,
        Number(level.observed_at),
        horizonMinutes,
        forwardReturnPct,
        maxUpPct,
        maxDownPct,
        touched,
        respected,
        broken,
        timeToTouchMs,
        LABEL_VERSION,
        JSON.stringify({
          favorablePct,
          bandPct,
          candleCount: candles.length,
          labelStartTime: Number(level.observed_at),
          labelEndTime: Number(level.observed_at) + horizonMs,
          firstTouchTime,
          firstBreakTime,
          maxFavorablePct,
          maxAdversePct,
          respectThresholdPct,
        }),
      ],
    );
    inserted += 1;
  }
  return inserted;
}

async function runCycle() {
  const runId = await startRun({ network: NETWORK, assetLimit: ASSET_LIMIT, intervals: CANDLE_INTERVALS });
  try {
    await assertWarehouseReady();
    const selected = await loadUniverse();
    const contextRows = await insertContextSnapshots(selected);
    let candleRows = 0;
    let fundingRows = 0;
    let features = 0;
    let levels = 0;

    for (const asset of selected) {
      candleRows += await collectCandlesForAsset(asset.asset, asset.marketType);
      fundingRows += await collectFundingForAsset(asset.asset, asset.marketType);
      if (await insertFeatureSnapshot(asset.asset, asset.marketType)) features += 1;
      levels += await insertLevelObservations(asset.asset, asset.marketType);
    }
    const labels = await labelResolvedLevels();
    await finishRun(runId, "success", null, { assets: selected.map((asset) => asset.asset), contextRows, candleRows, fundingRows, features, levels, labels });
    console.log(`[market-collector] success assets=${selected.length} candles=${candleRows} context=${contextRows} funding=${fundingRows} features=${features} levels=${levels} labels=${labels}`);
  } catch (error) {
    await finishRun(runId, "failed", error.message, { stack: error.stack });
    throw error;
  }
}

async function main() {
  console.log(`[market-collector] starting network=${NETWORK} assets=${CONFIGURED_ASSETS.join(",") || `top ${ASSET_LIMIT}`} intervals=${CANDLE_INTERVALS.join(",")}`);
  await runCycle();
  if (RUN_ONCE) {
    await pool.end();
    return;
  }
  setInterval(() => {
    runCycle().catch((error) => console.error("[market-collector] cycle failed", error));
  }, LOOP_INTERVAL_MS);
}

main().catch(async (error) => {
  console.error("[market-collector] fatal", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
