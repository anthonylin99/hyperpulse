import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Pool } from "pg";

function loadLocalEnv() {
  for (const file of [".env.local", ".env", "workers/momentum-alerts/.env", "workers/whale-indexer/.env"]) {
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
  console.error("[momentum-alerts] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const WORKER = "momentum-alerts";
const NETWORK = process.env.HYPERPULSE_NETWORK === "testnet" ? "testnet" : "mainnet";
const RUN_ONCE = process.argv.includes("--once") || process.env.MOMENTUM_ALERT_ONCE === "true";
const LOOP_INTERVAL_MS = Math.max(envNumber("MOMENTUM_ALERT_INTERVAL_MS", 5 * 60 * 1000), 60_000);
const ASSET_LIMIT = clamp(envNumber("MOMENTUM_ALERT_ASSET_LIMIT", 45), 5, 80);
const MIN_OI_USD = envNumber("MOMENTUM_ALERT_MIN_OI_USD", 8_000_000);
const MIN_VOLUME_USD = envNumber("MOMENTUM_ALERT_MIN_VOLUME_USD", 20_000_000);
const PER_ASSET_COOLDOWN_MS = envNumber("MOMENTUM_ALERT_ASSET_COOLDOWN_MS", 12 * 60 * 60 * 1000);
const TELEGRAM_DAILY_CAP = clamp(envNumber("MOMENTUM_ALERT_DAILY_CAP", 8), 1, 24);
const STORE_DAILY_CAP = clamp(envNumber("MOMENTUM_ALERT_STORE_DAILY_CAP", 8), TELEGRAM_DAILY_CAP, 24);
const MAX_PER_SIGNAL_BUCKET = clamp(envNumber("MOMENTUM_ALERT_MAX_PER_SIGNAL_BUCKET", 2), 1, 5);
const CANDLE_INTERVAL = process.env.MOMENTUM_ALERT_CANDLE_INTERVAL || "5m";
const LOOKBACK_MS = envNumber("MOMENTUM_ALERT_LOOKBACK_MS", 30 * 60 * 60 * 1000);
const SCORE_THRESHOLD = envNumber("MOMENTUM_ALERT_SCORE_THRESHOLD", 72);
const HIGH_SCORE_THRESHOLD = envNumber("MOMENTUM_ALERT_HIGH_SCORE_THRESHOLD", 82);
const PROD_LIKE = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME);
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === "true";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DRY_RUN_REQUESTED = process.env.MOMENTUM_ALERT_DRY_RUN === "true";
const DRY_RUN =
  DRY_RUN_REQUESTED &&
  !TELEGRAM_ENABLED &&
  (!PROD_LIKE || process.env.MOMENTUM_ALERT_ALLOW_PROD_DRY_RUN === "true");
if (DRY_RUN_REQUESTED && !DRY_RUN) {
  console.warn("[momentum-alerts] ignoring MOMENTUM_ALERT_DRY_RUN=true because Telegram/prod delivery is enabled");
}
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://hyperpulsehl.com";
const CONFIGURED_ASSETS = parseList(process.env.MOMENTUM_ALERT_ASSETS);
const DEBUG = process.env.MOMENTUM_ALERT_DEBUG === "true";

const PRIORITY_ASSETS = new Set([
  "BTC", "ETH", "SOL", "HYPE", "ZEC", "TAO", "TON", "AAVE", "NEAR", "LINK", "SUI", "DOGE",
  "AVAX", "BNB", "XRP", "ENA", "PENDLE", "ONDO", "ARB", "OP", "INJ", "LTC", "BCH", "WLD", "RENDER",
]);
const EXCLUDED_ASSETS = new Set(parseList(process.env.MOMENTUM_ALERT_EXCLUDED_ASSETS, ["PURR", "HFUN"]));
const AI_ASSETS = new Set(["TAO", "NEAR", "RENDER", "FET", "AIXBT", "WLD", "IO"]);
const DEFI_ASSETS = new Set(["AAVE", "UNI", "CRV", "GMX", "JUP", "PENDLE", "ONDO", "MORPHO", "ENA", "CAKE"]);
const MEME_ASSETS = new Set(["DOGE", "WIF", "POPCAT", "FARTCOIN", "TRUMP", "kPEPE", "PENGU", "BRETT"]);
const MAJOR_ASSETS = new Set(["BTC", "ETH", "SOL", "HYPE"]);

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: NETWORK === "testnet" }) });

function envNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSymbol(value) {
  return String(value || "").toUpperCase().replace(/\/USDC$/, "");
}

function assetKey(asset, marketType = "crypto_perp", dex = "main") {
  return `${marketType}:${dex}:${asset}`;
}

function normalizeTime(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function formatUsd(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(digits)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function momentumBucket(asset) {
  const symbol = normalizeSymbol(asset);
  if (MAJOR_ASSETS.has(symbol)) return "majors";
  if (AI_ASSETS.has(symbol)) return "ai";
  if (DEFI_ASSETS.has(symbol)) return "defi";
  if (MEME_ASSETS.has(symbol)) return "meme";
  return "alts";
}

function easternDateKey(time = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function easternTimeLabel(time = Date.now()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(time));
}

function candleToRow(candle) {
  const time = normalizeTime(candle.t ?? candle.time ?? candle.openTime);
  const open = parseNumber(candle.o ?? candle.open);
  const high = parseNumber(candle.h ?? candle.high);
  const low = parseNumber(candle.l ?? candle.low);
  const close = parseNumber(candle.c ?? candle.close);
  const volume = parseNumber(candle.v ?? candle.volume);
  if (!time || ![open, high, low, close].every((value) => value > 0)) return null;
  return { time, open, high, low, close, volume };
}

function valueAtLookback(candles, lookbackMs) {
  const target = Date.now() - lookbackMs;
  let candidate = null;
  for (const candle of candles) {
    if (candle.time <= target) candidate = candle;
    else break;
  }
  return candidate?.close ?? null;
}

function trueRange(candle, previousClose) {
  return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
}

function computeAtr(candles, length = 14) {
  if (candles.length < 2) return null;
  const scoped = candles.slice(-length);
  if (scoped.length < 2) return null;
  let sum = 0;
  for (let index = 0; index < scoped.length; index += 1) {
    const previousClose = index === 0 ? scoped[index].close : scoped[index - 1].close;
    sum += trueRange(scoped[index], previousClose);
  }
  return sum / scoped.length;
}

function notionalVolume(candles) {
  return candles.reduce((sum, candle) => sum + candle.volume * candle.close, 0);
}

function computeMomentumFeatures(asset, candles, currentPrice) {
  if (candles.length < 60 || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const latest = candles[candles.length - 1];
  const prior1h = valueAtLookback(candles, 60 * 60 * 1000);
  const prior4h = valueAtLookback(candles, 4 * 60 * 60 * 1000);
  const prior24h = valueAtLookback(candles, 24 * 60 * 60 * 1000);
  const return1h = pctChange(currentPrice, prior1h);
  const return4h = pctChange(currentPrice, prior4h);
  const return24h = pctChange(currentPrice, prior24h);
  if ([return1h, return4h, return24h].some((value) => value == null)) return null;

  const recent4h = candles.slice(-48);
  const recent24h = candles.slice(-288);
  const breakoutWindow = candles.slice(Math.max(0, candles.length - 48 - 3), -3);
  const recentHigh = Math.max(...breakoutWindow.map((candle) => candle.high));
  const high24h = Math.max(...recent24h.map((candle) => candle.high));
  const low24h = Math.min(...recent24h.map((candle) => candle.low));
  const range24h = Math.max(high24h - low24h, currentPrice * 0.005);
  const breakout = currentPrice > recentHigh * 1.001;
  const nearHigh = currentPrice >= high24h - range24h * 0.22;
  const lastHourVolume = notionalVolume(candles.slice(-12));
  const previousHourlyVolumes = [];
  const previous = candles.slice(0, -12);
  for (let index = Math.max(0, previous.length - 12 * 23); index < previous.length; index += 12) {
    const chunk = previous.slice(index, index + 12);
    if (chunk.length >= 6) previousHourlyVolumes.push(notionalVolume(chunk));
  }
  const baselineHourlyVolume = average(previousHourlyVolumes) ?? 0;
  const volumeVsBaseline = baselineHourlyVolume > 0 ? lastHourVolume / baselineHourlyVolume : null;
  const atr = computeAtr(candles);
  const localPullbackLow = Math.min(...recent4h.map((candle) => candle.low));
  const localHigh = Math.max(...recent4h.map((candle) => candle.high));

  return {
    latest,
    return1h,
    return4h,
    return24h,
    breakout,
    nearHigh,
    recentHigh,
    high24h,
    low24h,
    range24h,
    volumeVsBaseline,
    lastHourVolume,
    atr,
    localPullbackLow,
    localHigh,
    recent4h,
    asset,
  };
}

async function assertTablesReady() {
  await pool.query(`
    create table if not exists worker_runs (
      id text primary key,
      worker text not null,
      started_at bigint not null,
      completed_at bigint,
      status text not null,
      message text,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await pool.query(`create index if not exists worker_runs_worker_time_idx on worker_runs (worker, started_at desc);`);
  await pool.query(`
    create table if not exists momentum_alert_events (
      id text primary key,
      asset text not null,
      created_at bigint not null,
      alert_price double precision not null,
      current_price_at_eval double precision not null,
      return_1h_pct double precision,
      return_4h_pct double precision,
      return_24h_pct double precision,
      open_interest_usd double precision,
      open_interest_change_pct double precision,
      volume_24h_usd double precision,
      volume_vs_baseline double precision,
      funding_apr double precision,
      trigger_kind text not null,
      score double precision not null,
      severity text not null,
      reason text not null,
      invalidation_price double precision,
      target_price double precision,
      route_href text not null,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await pool.query(`create index if not exists momentum_alert_events_time_idx on momentum_alert_events (created_at desc);`);
  await pool.query(`create index if not exists momentum_alert_events_asset_time_idx on momentum_alert_events (asset, created_at desc);`);
  await pool.query(`
    create table if not exists notification_queue (
      id text primary key,
      event_type text not null,
      event_id text not null,
      channel text not null,
      status text not null default 'queued',
      created_at bigint not null,
      sent_at bigint,
      attempts integer not null default 0,
      message_hash text,
      last_error text,
      payload jsonb not null default '{}'::jsonb,
      unique (event_type, event_id, channel)
    );
  `);
  await pool.query(`create index if not exists notification_queue_status_time_idx on notification_queue (status, created_at asc);`);
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

async function loadUniverse() {
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const assets = meta.universe
    .map((entry, index) => {
      const symbol = normalizeSymbol(entry.name);
      const ctx = ctxs[index] ?? {};
      const markPx = parseNumber(ctx.markPx);
      const dayVolumeUsd = parseNumber(ctx.dayNtlVlm);
      const openInterestCoin = parseNumber(ctx.openInterest);
      const openInterestUsd = openInterestCoin * markPx;
      return {
        asset: symbol,
        rawName: entry.name,
        ctx,
        markPx,
        dayVolumeUsd,
        openInterestUsd,
        fundingApr: parseNumber(ctx.funding) * 8760 * 100,
        score: dayVolumeUsd + openInterestUsd * 0.35,
        isActive: !entry.isDelisted,
      };
    })
    .filter((asset) => {
      if (!asset.isActive || !asset.asset || EXCLUDED_ASSETS.has(asset.asset)) return false;
      if (asset.markPx <= 0) return false;
      return asset.openInterestUsd >= MIN_OI_USD && asset.dayVolumeUsd >= MIN_VOLUME_USD;
    });

  if (CONFIGURED_ASSETS.length > 0) {
    return CONFIGURED_ASSETS
      .map((symbol) => assets.find((asset) => asset.asset === normalizeSymbol(symbol)))
      .filter(Boolean);
  }

  const selected = new Map();
  for (const asset of assets.sort((a, b) => b.score - a.score).slice(0, ASSET_LIMIT)) selected.set(asset.asset, asset);
  for (const symbol of PRIORITY_ASSETS) {
    const match = assets.find((asset) => asset.asset === symbol);
    if (match) selected.set(match.asset, match);
  }
  return [...selected.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(ASSET_LIMIT, PRIORITY_ASSETS.size));
}

async function fetchCandles(asset) {
  const endTime = Date.now();
  const startTime = endTime - LOOKBACK_MS;
  const rows = await info.candleSnapshot({ coin: asset.rawName, interval: CANDLE_INTERVAL, startTime, endTime });
  return rows.map(candleToRow).filter(Boolean).sort((a, b) => a.time - b.time);
}

async function getOpenInterestChangePct(asset) {
  try {
    const key = assetKey(asset.asset);
    const latest = await pool.query(
      `select open_interest_usd from market_context_snapshots where asset_key = $1 order by captured_at desc limit 1`,
      [key],
    );
    const prior = await pool.query(
      `select open_interest_usd from market_context_snapshots where asset_key = $1 and captured_at <= $2 order by captured_at desc limit 1`,
      [key, Date.now() - 4 * 60 * 60 * 1000],
    );
    const latestValue = parseNumber(latest.rows[0]?.open_interest_usd) || asset.openInterestUsd;
    const priorValue = parseNumber(prior.rows[0]?.open_interest_usd);
    return pctChange(latestValue, priorValue);
  } catch {
    return null;
  }
}

async function loadNearestLevel(asset, kind, currentPrice) {
  try {
    const key = assetKey(asset);
    const operator = kind === "support" ? "<" : ">";
    const order = kind === "support" ? "desc" : "asc";
    const result = await pool.query(
      `select level_price, payload, strength, touches
       from level_observations
       where asset_key = $1 and kind = $2 and level_price ${operator} $3 and observed_at > $4
       order by level_price ${order}, observed_at desc
       limit 1`,
      [key, kind, currentPrice, Date.now() - 7 * 24 * 60 * 60 * 1000],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      price: parseNumber(row.level_price),
      zoneLow: parseNumber(row.payload?.zoneLow),
      zoneHigh: parseNumber(row.payload?.zoneHigh),
      touches: Number(row.touches ?? 0),
      strength: parseNumber(row.strength),
    };
  } catch {
    return null;
  }
}

function scoreCandidate(asset, features, oiChangePct) {
  const r1h = features.return1h ?? 0;
  const r4h = features.return4h ?? 0;
  const r24h = features.return24h ?? 0;
  const volumeVs = features.volumeVsBaseline ?? 1;
  const fundingApr = asset.fundingApr;
  const strongMove = (r1h >= 1.2 && r4h >= 3) || (r4h >= 5) || (r24h >= 12 && r4h >= 2.5);
  const confirmation = volumeVs >= 1.25 || (oiChangePct ?? 0) >= 2 || (r24h >= 15 && volumeVs >= 1.1);
  const ignition = features.breakout && r4h >= 3.5 && r1h >= 0.8;
  const continuation = r24h >= 10 && r4h >= 2.5 && features.nearHigh;
  const broadRunner = r24h >= 15 && r4h >= 3.5 && volumeVs >= 1.1;
  const localRunner = r4h >= 7 && r1h >= 1.0 && volumeVs >= 1.15;
  // Catch mature trend days that have already broken out and are consolidating near highs.
  // This is the ZEC/TON case: the 24h move is obvious, but the latest 4h window may have cooled.
  const trendDayRunner =
    r24h >= 18 &&
    r1h >= 0.25 &&
    volumeVs >= 1.1 &&
    (features.nearHigh || r1h >= 1.5);
  const qualifiesByMove = strongMove || trendDayRunner;
  if (!qualifiesByMove || !confirmation || (!ignition && !continuation && !broadRunner && !localRunner && !trendDayRunner)) {
    if (DEBUG && (r24h >= 10 || r4h >= 4 || r1h >= 2)) {
      console.log(
        `[momentum-alerts] reject ${asset.asset} move=${qualifiesByMove} confirm=${confirmation} r1=${r1h.toFixed(2)} r4=${r4h.toFixed(2)} r24=${r24h.toFixed(2)} vol=${volumeVs.toFixed(2)} breakout=${features.breakout} nearHigh=${features.nearHigh}`,
      );
    }
    return null;
  }

  let score = 42;
  score += Math.min(Math.max(r1h, 0) * 4, 14);
  score += Math.min(Math.max(r4h, 0) * 2.8, 22);
  score += Math.min(Math.max(r24h, 0) * 0.9, 18);
  if (features.breakout) score += 12;
  if (features.nearHigh) score += 7;
  if (broadRunner) score += 6;
  if (localRunner) score += 4;
  if (trendDayRunner) score += 5;
  score += Math.min(Math.max(volumeVs - 1, 0) * 7, 14);
  if (oiChangePct != null) score += Math.min(Math.max(oiChangePct, 0) * 1.4, 10);
  if (fundingApr > 65) score -= Math.min((fundingApr - 65) * 0.18, 10);
  if (fundingApr < -40) score -= Math.min(Math.abs(fundingApr + 40) * 0.08, 5);
  score = Math.max(0, Math.min(100, score));
  if (score < SCORE_THRESHOLD) {
    if (DEBUG && (r24h >= 10 || r4h >= 4 || r1h >= 2)) {
      console.log(`[momentum-alerts] reject ${asset.asset} score=${score.toFixed(1)} threshold=${SCORE_THRESHOLD}`);
    }
    return null;
  }

  return {
    triggerKind: ignition ? "momentum_ignition" : "momentum_continuation",
    score,
    severity: score >= HIGH_SCORE_THRESHOLD ? "high" : "medium",
  };
}

async function hasRecentAssetAlert(asset, now) {
  const result = await pool.query(
    `select id, score from momentum_alert_events where asset = $1 and created_at >= $2 order by created_at desc limit 1`,
    [asset, now - PER_ASSET_COOLDOWN_MS],
  );
  return result.rows[0] ?? null;
}

async function countAlertsToday(easternDate) {
  const result = await pool.query(
    `select count(*)::int as count from momentum_alert_events where payload->>'easternDate' = $1`,
    [easternDate],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countQueuedOrSentToday(easternDate) {
  const result = await pool.query(
    `select count(*)::int as count
     from notification_queue nq
     join momentum_alert_events mea on mea.id = nq.event_id and nq.event_type = 'momentum_alert'
     where nq.channel = 'telegram'
       and nq.status in ('queued', 'sent')
       and mea.payload->>'easternDate' = $1`,
    [easternDate],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function buildCandidate(asset) {
  const candles = await fetchCandles(asset);
  const features = computeMomentumFeatures(asset.asset, candles, asset.markPx);
  if (!features) return null;
  const oiChangePct = await getOpenInterestChangePct(asset);
  const score = scoreCandidate(asset, features, oiChangePct);
  if (!score) return null;

  const support = await loadNearestLevel(asset.asset, "support", asset.markPx);
  const resistance = await loadNearestLevel(asset.asset, "resistance", asset.markPx);
  const atr = features.atr ?? asset.markPx * 0.015;
  const invalidationPrice = Math.max(
    support?.zoneLow || support?.price || 0,
    Math.min(features.localPullbackLow, asset.markPx - atr * 1.25),
  );
  const fallbackTarget = Math.max(features.high24h, asset.markPx + atr * 2.2);
  const targetPrice = resistance?.zoneHigh && resistance.zoneHigh > asset.markPx * 1.004
    ? resistance.zoneHigh
    : fallbackTarget;
  const volumeVs = features.volumeVsBaseline ?? 1;
  const oiText = oiChangePct == null ? "OI context limited" : `OI ${formatPct(oiChangePct)}`;
  const bucket = momentumBucket(asset.asset);
  const reason = `${asset.asset} broke higher with ${formatPct(features.return1h)} 1h / ${formatPct(features.return4h)} 4h momentum, ${volumeVs.toFixed(1)}x recent volume, and ${oiText}.`;

  return {
    asset: asset.asset,
    alertPrice: asset.markPx,
    currentPriceAtEval: asset.markPx,
    return1hPct: features.return1h,
    return4hPct: features.return4h,
    return24hPct: features.return24h,
    openInterestUsd: asset.openInterestUsd,
    openInterestChangePct: oiChangePct,
    volume24hUsd: asset.dayVolumeUsd,
    volumeVsBaseline: volumeVs,
    fundingApr: asset.fundingApr,
    triggerKind: score.triggerKind,
    score: score.score,
    severity: score.severity,
    reason,
    invalidationPrice,
    targetPrice,
    routeHref: `/markets?asset=${encodeURIComponent(asset.asset)}`,
    payload: {
      direction: "long",
      signalBucket: bucket,
      easternDate: easternDateKey(),
      interval: CANDLE_INTERVAL,
      breakout: features.breakout,
      nearHigh: features.nearHigh,
      recentHigh: features.recentHigh,
      support,
      resistance,
      atr,
      fundingPenaltyApplied: asset.fundingApr > 65,
      liquidity: {
        minOiUsd: MIN_OI_USD,
        minVolumeUsd: MIN_VOLUME_USD,
      },
    },
  };
}

function eventId(candidate, now) {
  const bucket = Math.floor(now / LOOP_INTERVAL_MS) * LOOP_INTERVAL_MS;
  return createHash("sha256")
    .update(`${candidate.asset}:${candidate.triggerKind}:${bucket}:${candidate.alertPrice.toFixed(8)}`)
    .digest("hex")
    .slice(0, 24);
}

function buildTelegramText(alert) {
  const link = new URL(alert.routeHref, APP_URL).toString();
  const conviction = alert.severity === "high" ? "HIGH" : "MEDIUM";
  const lines = [
    `⚡ MOMENTUM ALERT · ${conviction}`,
    `${alert.asset} Long · ${formatPct(alert.return1hPct)} 1h · ${formatPct(alert.return4hPct)} 4h · ${formatPct(alert.return24hPct)} 24h`,
    `ALERT PRICE: ${formatPrice(alert.alertPrice)} · OI ${formatUsd(alert.openInterestUsd)} · volume ${alert.volumeVsBaseline.toFixed(1)}x`,
    `WHY: ${alert.reason}`,
    `WATCH: target ${formatPrice(alert.targetPrice)} · invalid below ${formatPrice(alert.invalidationPrice)}`,
    `TIME: ${easternTimeLabel(alert.createdAt)}`,
    link,
  ];
  return lines.join("\n");
}

async function persistAlert(candidate, now) {
  const id = eventId(candidate, now);
  const alert = { ...candidate, id, createdAt: now };
  if (DRY_RUN) {
    console.log(`[momentum-alerts] dry-run alert ${alert.asset} score=${alert.score.toFixed(1)} price=${alert.alertPrice}`);
    return { alert, inserted: true, queued: false };
  }

  const payload = JSON.stringify(alert.payload);
  const result = await pool.query(
    `insert into momentum_alert_events (
      id, asset, created_at, alert_price, current_price_at_eval, return_1h_pct, return_4h_pct, return_24h_pct,
      open_interest_usd, open_interest_change_pct, volume_24h_usd, volume_vs_baseline, funding_apr,
      trigger_kind, score, severity, reason, invalidation_price, target_price, route_href, payload
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    on conflict (id) do nothing`,
    [
      alert.id,
      alert.asset,
      alert.createdAt,
      alert.alertPrice,
      alert.currentPriceAtEval,
      alert.return1hPct,
      alert.return4hPct,
      alert.return24hPct,
      alert.openInterestUsd,
      alert.openInterestChangePct,
      alert.volume24hUsd,
      alert.volumeVsBaseline,
      alert.fundingApr,
      alert.triggerKind,
      alert.score,
      alert.severity,
      alert.reason,
      alert.invalidationPrice,
      alert.targetPrice,
      alert.routeHref,
      payload,
    ],
  );
  const inserted = result.rowCount > 0;
  if (!inserted) return { alert, inserted: false, queued: false };

  const easternDate = alert.payload.easternDate;
  const telegramCount = await countQueuedOrSentToday(easternDate);
  const canSendTelegram = TELEGRAM_ENABLED && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && telegramCount < TELEGRAM_DAILY_CAP;
  const message = buildTelegramText(alert);
  const queueStatus = canSendTelegram ? "queued" : "disabled";
  const lastError = canSendTelegram
    ? null
    : TELEGRAM_ENABLED
      ? "Telegram daily cap reached or credentials missing."
      : "Telegram disabled.";

  await pool.query(
    `insert into notification_queue (id, event_type, event_id, channel, status, created_at, message_hash, last_error, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (event_type, event_id, channel) do nothing`,
    [
      `telegram:momentum_alert:${alert.id}`,
      "momentum_alert",
      alert.id,
      "telegram",
      queueStatus,
      now,
      createHash("sha256").update(message).digest("hex"),
      lastError,
      JSON.stringify({ text: message, routeHref: alert.routeHref, asset: alert.asset }),
    ],
  );
  return { alert, inserted: true, queued: canSendTelegram };
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram request failed with ${response.status}`);
  }
}

async function flushTelegramQueue() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || DRY_RUN) return 0;
  const result = await pool.query(
    `select id, payload, attempts from notification_queue
     where event_type = 'momentum_alert' and channel = 'telegram' and status = 'queued'
     order by created_at asc
     limit 10`,
  );
  let sent = 0;
  for (const row of result.rows) {
    try {
      const text = row.payload?.text;
      if (!text) throw new Error("Notification payload missing text.");
      await sendTelegramMessage(text);
      await pool.query(
        `update notification_queue set status = 'sent', sent_at = $2, attempts = attempts + 1, last_error = null where id = $1`,
        [row.id, Date.now()],
      );
      sent += 1;
    } catch (error) {
      await pool.query(
        `update notification_queue set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1`,
        [row.id, error instanceof Error ? error.message : String(error)],
      );
      console.error("[momentum-alerts] telegram send failed", error);
    }
  }
  return sent;
}

async function runCycle() {
  await assertTablesReady();
  const runId = await startRun({ network: NETWORK, dryRun: DRY_RUN, storeDailyCap: STORE_DAILY_CAP, telegramDailyCap: TELEGRAM_DAILY_CAP });
  const now = Date.now();
  const easternDate = easternDateKey(now);
  try {
    const universe = await loadUniverse();
    const candidates = [];
    for (const asset of universe) {
      try {
        const candidate = await buildCandidate(asset);
        if (!candidate) continue;
        const recent = await hasRecentAssetAlert(candidate.asset, now);
        if (recent) continue;
        candidates.push(candidate);
      } catch (error) {
        console.warn(`[momentum-alerts] candidate failed ${asset.asset}`, error instanceof Error ? error.message : error);
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    let remaining = Math.max(STORE_DAILY_CAP - await countAlertsToday(easternDate), 0);
    let inserted = 0;
    let queued = 0;
    const selected = [];
    const bucketCounts = new Map();
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const bucket = candidate.payload?.signalBucket ?? momentumBucket(candidate.asset);
      const bucketCount = bucketCounts.get(bucket) ?? 0;
      if (bucketCount >= MAX_PER_SIGNAL_BUCKET) continue;
      const result = await persistAlert({
        ...candidate,
        payload: { ...candidate.payload, easternDate },
      }, now);
      if (!result.inserted) continue;
      inserted += 1;
      queued += result.queued ? 1 : 0;
      selected.push(result.alert.asset);
      bucketCounts.set(bucket, bucketCount + 1);
      remaining -= 1;
    }
    const sent = await flushTelegramQueue();
    await finishRun(runId, "success", null, {
      scanned: universe.length,
      candidates: candidates.length,
      inserted,
      queued,
      sent,
      selected,
      buckets: Object.fromEntries(bucketCounts.entries()),
      easternDate,
    });
    console.log(`[momentum-alerts] success scanned=${universe.length} candidates=${candidates.length} inserted=${inserted} queued=${queued} sent=${sent}`);
  } catch (error) {
    await finishRun(runId, "failed", error instanceof Error ? error.message : String(error), { stack: error?.stack });
    throw error;
  }
}

async function main() {
  console.log(`[momentum-alerts] starting network=${NETWORK} interval=${LOOP_INTERVAL_MS}ms storeCap=${STORE_DAILY_CAP}/day telegramCap=${TELEGRAM_DAILY_CAP}/day assets=${CONFIGURED_ASSETS.join(",") || `liquid top ${ASSET_LIMIT}`}`);
  await runCycle();
  if (RUN_ONCE) {
    await pool.end();
    return;
  }
  setInterval(() => {
    runCycle().catch((error) => console.error("[momentum-alerts] cycle failed", error));
  }, LOOP_INTERVAL_MS);
}

main().catch(async (error) => {
  console.error("[momentum-alerts] fatal", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
