import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Pool } from "pg";

const PG_SSL_MODES_TO_PIN = new Set(["prefer", "require", "verify-ca"]);

function loadLocalEnv() {
  for (const file of [".env.local", ".env", "workers/momentum-alerts/.env"]) {
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

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function normalizeDatabaseUrl(value) {
  const cleaned = cleanEnv(value);
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

function envFlag(name, fallback = false) {
  const value = cleanEnv(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

if (!envFlag("HYPERPULSE_DB_ENABLED")) {
  console.log("[momentum-alerts] database frozen; set HYPERPULSE_DB_ENABLED=true to resume Neon/Postgres-backed alerts.");
  process.exit(0);
}

const DATABASE_URL = normalizeDatabaseUrl(
  process.env.NEON_DATABASE_URL_POOLING ??
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "",
);
if (!DATABASE_URL) {
  console.error("[momentum-alerts] NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required.");
  process.exit(1);
}

const ENABLE_MOMENTUM_ALERTS_ENV = cleanEnv(process.env.ENABLE_MOMENTUM_ALERTS).toLowerCase();
const MOMENTUM_ALERTS_ENABLED =
  ENABLE_MOMENTUM_ALERTS_ENV === "" ? true : envFlag("ENABLE_MOMENTUM_ALERTS");

if (!MOMENTUM_ALERTS_ENABLED) {
  console.log("[momentum-alerts] disabled; ENABLE_MOMENTUM_ALERTS=false");
  process.exit(0);
}

const WORKER = "momentum-alerts";
const BUILD_ID = cleanEnv(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA) || "local";
const NETWORK = cleanEnv(process.env.HYPERPULSE_NETWORK) === "testnet" ? "testnet" : "mainnet";
const RUN_ONCE = process.argv.includes("--once") || envFlag("MOMENTUM_ALERT_ONCE");
const LOOP_INTERVAL_MS = Math.max(envNumber("MOMENTUM_ALERT_INTERVAL_MS", 5 * 60 * 1000), 60_000);
const ASSET_LIMIT = clamp(envNumber("MOMENTUM_ALERT_ASSET_LIMIT", 80), 5, 160);
const DYNAMIC_MOVER_LIMIT = clamp(envNumber("MOMENTUM_ALERT_DYNAMIC_MOVER_LIMIT", 60), 5, 120);
const EXCEPTIONAL_MOVE_PCT = envNumber("MOMENTUM_ALERT_EXCEPTIONAL_MOVE_PCT", 18);
const MIN_OI_USD = envNumber("MOMENTUM_ALERT_MIN_OI_USD", 8_000_000);
const MIN_VOLUME_USD = envNumber("MOMENTUM_ALERT_MIN_VOLUME_USD", 20_000_000);
const LARGE_CAP_OI_USD = envNumber("MOMENTUM_ALERT_LARGE_CAP_OI_USD", 35_000_000);
const LARGE_CAP_VOLUME_USD = envNumber("MOMENTUM_ALERT_LARGE_CAP_VOLUME_USD", 75_000_000);
const EXCEPTIONAL_MIN_OI_USD = envNumber("MOMENTUM_ALERT_EXCEPTIONAL_MIN_OI_USD", 3_000_000);
const EXCEPTIONAL_MIN_VOLUME_USD = envNumber("MOMENTUM_ALERT_EXCEPTIONAL_MIN_VOLUME_USD", 8_000_000);
const PER_ASSET_COOLDOWN_MS = envNumber("MOMENTUM_ALERT_ASSET_COOLDOWN_MS", 12 * 60 * 60 * 1000);
const TELEGRAM_DAILY_CAP = clamp(envNumber("MOMENTUM_ALERT_DAILY_CAP", 6), 1, 6);
const TELEGRAM_HOURLY_CAP = clamp(envNumber("MOMENTUM_ALERT_HOURLY_CAP", 1), 1, 1);
const STORE_DAILY_CAP = clamp(envNumber("MOMENTUM_ALERT_STORE_DAILY_CAP", 30), TELEGRAM_DAILY_CAP, 60);
const MAX_ALERTS_PER_CYCLE = clamp(envNumber("MOMENTUM_ALERT_MAX_PER_CYCLE", 3), 1, 8);
const MAX_TELEGRAM_PER_CYCLE = clamp(envNumber("MOMENTUM_ALERT_MAX_TELEGRAM_PER_CYCLE", 1), 1, 1);
const TELEGRAM_QUEUE_MAX_AGE_MS = envNumber("MOMENTUM_ALERT_QUEUE_MAX_AGE_MS", 12 * 60 * 60 * 1000);
const TELEGRAM_TIME_ZONE = cleanEnv(process.env.MOMENTUM_ALERT_TELEGRAM_TIME_ZONE) || "America/New_York";
const TELEGRAM_ACTIVE_START_HOUR = clamp(envNumber("MOMENTUM_ALERT_TELEGRAM_START_HOUR", 8), 0, 23);
const TELEGRAM_ACTIVE_END_HOUR = clamp(envNumber("MOMENTUM_ALERT_TELEGRAM_END_HOUR", 23), 1, 24);
const MAX_PER_SIGNAL_BUCKET = clamp(envNumber("MOMENTUM_ALERT_MAX_PER_SIGNAL_BUCKET", 2), 1, 5);
const CANDLE_INTERVAL = cleanEnv(process.env.MOMENTUM_ALERT_CANDLE_INTERVAL) || "5m";
const LOOKBACK_MS = envNumber("MOMENTUM_ALERT_LOOKBACK_MS", 30 * 60 * 60 * 1000);
const SCORE_THRESHOLD = envNumber("MOMENTUM_ALERT_SCORE_THRESHOLD", 68);
const HIGH_SCORE_THRESHOLD = envNumber("MOMENTUM_ALERT_HIGH_SCORE_THRESHOLD", 78);
const RADAR_LONG_STD_ALERT_THRESHOLD = envNumber("MOMENTUM_ALERT_RADAR_LONG_STD_THRESHOLD", 2);
const RADAR_SHORT_STD_ALERT_THRESHOLD = envNumber("MOMENTUM_ALERT_RADAR_SHORT_STD_THRESHOLD", 2.6);
const RADAR_LONG_STORE_THRESHOLD = envNumber("MOMENTUM_ALERT_RADAR_LONG_STORE_THRESHOLD", 1.35);
const RADAR_SHORT_STORE_THRESHOLD = envNumber("MOMENTUM_ALERT_RADAR_SHORT_STORE_THRESHOLD", 1.9);
const TELEGRAM_LONG_SOFT_CHASE_PCT = envNumber("MOMENTUM_ALERT_LONG_SOFT_CHASE_PCT", 10);
const TELEGRAM_LONG_HARD_CHASE_PCT = envNumber("MOMENTUM_ALERT_LONG_HARD_CHASE_PCT", 24);
const TELEGRAM_SHORT_MIN_DOWN_24H_PCT = envNumber("MOMENTUM_ALERT_SHORT_MIN_DOWN_24H_PCT", 2.5);
const TELEGRAM_MIN_VOLUME_VS = envNumber("MOMENTUM_ALERT_MIN_VOLUME_VS", 1.3);
const TELEGRAM_SHORT_MIN_VOLUME_VS = envNumber("MOMENTUM_ALERT_SHORT_MIN_VOLUME_VS", 1.6);
const TELEGRAM_TP1_MIN_PCT = envNumber("MOMENTUM_ALERT_TP1_MIN_PCT", 1.8);
const TELEGRAM_TP1_BASE_PCT = envNumber("MOMENTUM_ALERT_TP1_BASE_PCT", 2.5);
const TELEGRAM_TP1_MAX_PCT = envNumber("MOMENTUM_ALERT_TP1_MAX_PCT", 6.0);
const TELEGRAM_STOP_MIN_PCT = envNumber("MOMENTUM_ALERT_STOP_MIN_PCT", 0.8);
const TELEGRAM_STOP_MAX_PCT = envNumber("MOMENTUM_ALERT_STOP_MAX_PCT", 2.5);
const TELEGRAM_MIN_REWARD_RISK = envNumber("MOMENTUM_ALERT_MIN_REWARD_RISK", 2.0);
const TELEGRAM_DEFAULT_LEVERAGE = envNumber("MOMENTUM_ALERT_DEFAULT_LEVERAGE", 10);
const PROD_LIKE = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME);
const TELEGRAM_BOT_TOKEN = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = cleanEnv(process.env.TELEGRAM_CHAT_ID);
const TELEGRAM_CONFIGURED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
const TELEGRAM_ENV = cleanEnv(process.env.TELEGRAM_ENABLED).toLowerCase();
const TELEGRAM_ENABLED = TELEGRAM_ENV === "false"
  ? false
  : TELEGRAM_ENV === "true" || TELEGRAM_CONFIGURED;
const TELEGRAM_CHARTS_ENV = cleanEnv(process.env.TELEGRAM_CHARTS_ENABLED || process.env.MOMENTUM_ALERT_TELEGRAM_CHARTS).toLowerCase();
const TELEGRAM_CHARTS_ENABLED = TELEGRAM_CHARTS_ENV === ""
  ? false
  : TELEGRAM_CHARTS_ENV === "true" || TELEGRAM_CHARTS_ENV === "1" || TELEGRAM_CHARTS_ENV === "yes";
const DRY_RUN_REQUESTED = envFlag("MOMENTUM_ALERT_DRY_RUN");
const DRY_RUN =
  DRY_RUN_REQUESTED &&
  !TELEGRAM_ENABLED &&
  (!PROD_LIKE || envFlag("MOMENTUM_ALERT_ALLOW_PROD_DRY_RUN"));
if (DRY_RUN_REQUESTED && !DRY_RUN) {
  console.warn("[momentum-alerts] ignoring MOMENTUM_ALERT_DRY_RUN=true because Telegram/prod delivery is enabled");
}
function normalizeAppUrl(value) {
  const raw = cleanEnv(value) || "https://hyperpulsehl.com";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return "https://hyperpulsehl.com";
  }
}

const RAW_APP_URL = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
const APP_URL = RAW_APP_URL.includes("hyperpulse-gold.vercel.app") ? "https://hyperpulsehl.com" : RAW_APP_URL;
const CONFIGURED_ASSETS = parseList(process.env.MOMENTUM_ALERT_ASSETS);
const DEBUG = envFlag("MOMENTUM_ALERT_DEBUG");
const HYPERLIQUID_RETRY_ATTEMPTS = clamp(envNumber("MOMENTUM_ALERT_HL_RETRY_ATTEMPTS", 3), 1, 6);
const HYPERLIQUID_RETRY_BASE_MS = envNumber("MOMENTUM_ALERT_HL_RETRY_BASE_MS", 1250);

const PRIORITY_ASSETS = new Set([
  "BTC", "ETH", "SOL", "HYPE", "ZEC", "TAO", "TON", "AAVE", "NEAR", "LINK", "SUI", "DOGE",
  "AVAX", "BNB", "XRP", "ENA", "PENDLE", "ONDO", "ARB", "OP", "INJ", "LTC", "BCH", "WLD", "RENDER", "VVV", "JTO",
]);
const EXCLUDED_ASSETS = new Set(parseList(process.env.MOMENTUM_ALERT_EXCLUDED_ASSETS, ["PURR", "HFUN"]));
const AI_ASSETS = new Set(["TAO", "NEAR", "RENDER", "FET", "AIXBT", "WLD", "IO"]);
const DEFI_ASSETS = new Set(["AAVE", "UNI", "CRV", "GMX", "JUP", "PENDLE", "ONDO", "MORPHO", "ENA", "CAKE"]);
const MEME_ASSETS = new Set(["DOGE", "WIF", "POPCAT", "FARTCOIN", "TRUMP", "kPEPE", "PENGU", "BRETT", "VVV"]);
const MAJOR_ASSETS = new Set(["BTC", "ETH", "SOL", "HYPE"]);

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: NETWORK === "testnet" }) });

function envNumber(name, fallback) {
  const parsed = Number(cleanEnv(process.env[name]));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return cleanEnv(value).split(",").map((item) => cleanEnv(item)).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableHyperliquidError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|Too Many Requests|rate limit|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
}

async function withHyperliquidRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= HYPERLIQUID_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableHyperliquidError(error) || attempt === HYPERLIQUID_RETRY_ATTEMPTS) break;
      const waitMs = HYPERLIQUID_RETRY_BASE_MS * attempt + Math.floor(Math.random() * 350);
      console.warn(`[momentum-alerts] ${label} retry ${attempt}/${HYPERLIQUID_RETRY_ATTEMPTS} after ${waitMs}ms`, error instanceof Error ? error.message : error);
      await sleep(waitMs);
    }
  }
  throw lastError;
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

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
}

function standardDeviation(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return 0;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length;
  return Math.sqrt(variance);
}

function robustStats(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { center: 0, scale: 1 };
  const center = median(clean);
  const mad = median(clean.map((value) => Math.abs(value - center))) * 1.4826;
  return { center, scale: Math.max(mad, standardDeviation(clean), 0.0001) };
}

function robustZ(value, stats) {
  return clampFloat(((Number.isFinite(value) ? value : 0) - stats.center) / stats.scale, -5, 5);
}

function clampFloat(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function liquidityWeight(asset) {
  return Math.sqrt(Math.max(asset.dayVolumeUsd, 0) + Math.max(asset.openInterestUsd, 0) * 0.35);
}

function weightedAverage(items) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(item.weight, 0), 0);
  if (totalWeight <= 0) return average(items.map((item) => item.value)) ?? 0;
  return items.reduce((sum, item) => sum + item.value * Math.max(item.weight, 0), 0) / totalWeight;
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

function isLargeCapLike(asset) {
  return PRIORITY_ASSETS.has(asset.asset) || asset.openInterestUsd >= LARGE_CAP_OI_USD || asset.dayVolumeUsd >= LARGE_CAP_VOLUME_USD;
}

function passesExceptionalLiquidityFloor(asset) {
  return asset.openInterestUsd >= EXCEPTIONAL_MIN_OI_USD || asset.dayVolumeUsd >= EXCEPTIONAL_MIN_VOLUME_USD;
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

function hourInTimeZone(time = Date.now(), timeZone = TELEGRAM_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0);
}

function isTelegramActiveWindow(time = Date.now()) {
  const hour = hourInTimeZone(time);
  if (TELEGRAM_ACTIVE_START_HOUR === TELEGRAM_ACTIVE_END_HOUR) return true;
  if (TELEGRAM_ACTIVE_START_HOUR < TELEGRAM_ACTIVE_END_HOUR) {
    return hour >= TELEGRAM_ACTIVE_START_HOUR && hour < TELEGRAM_ACTIVE_END_HOUR;
  }
  return hour >= TELEGRAM_ACTIVE_START_HOUR || hour < TELEGRAM_ACTIVE_END_HOUR;
}

function telegramQuietHoursReason() {
  return `Telegram quiet hours: sends only ${TELEGRAM_ACTIVE_START_HOUR}:00-${TELEGRAM_ACTIVE_END_HOUR}:00 ${TELEGRAM_TIME_ZONE}.`;
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
  const breakdownWindow = candles.slice(Math.max(0, candles.length - 48 - 3), -3);
  const recentLow = Math.min(...breakdownWindow.map((candle) => candle.low));
  const breakdown = currentPrice < recentLow * 0.999;
  const nearLow = currentPrice <= low24h + range24h * 0.26;
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
    breakdown,
    nearHigh,
    nearLow,
    recentHigh,
    recentLow,
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
  const [meta, ctxs] = await withHyperliquidRetry("metaAndAssetCtxs", () => info.metaAndAssetCtxs());
  const assets = meta.universe
    .map((entry, index) => {
      const symbol = normalizeSymbol(entry.name);
      const ctx = ctxs[index] ?? {};
      const markPx = parseNumber(ctx.markPx);
      const prevDayPx = parseNumber(ctx.prevDayPx);
      const dayVolumeUsd = parseNumber(ctx.dayNtlVlm);
      const openInterestCoin = parseNumber(ctx.openInterest);
      const openInterestUsd = openInterestCoin * markPx;
      return {
        asset: symbol,
        rawName: entry.name,
        ctx,
        markPx,
        dayChangePct: pctChange(markPx, prevDayPx) ?? 0,
        dayVolumeUsd,
        openInterestUsd,
        fundingApr: parseNumber(ctx.funding) * 8760 * 100,
        score: dayVolumeUsd + openInterestUsd * 0.35,
        isActive: !entry.isDelisted,
        liquidityQualified: openInterestUsd >= MIN_OI_USD && dayVolumeUsd >= MIN_VOLUME_USD,
      };
    })
    .filter((asset) => {
      if (!asset.isActive || !asset.asset || EXCLUDED_ASSETS.has(asset.asset)) return false;
      if (asset.markPx <= 0) return false;
      return true;
    });

  if (CONFIGURED_ASSETS.length > 0) {
    return CONFIGURED_ASSETS
      .map((symbol) => assets.find((asset) => asset.asset === normalizeSymbol(symbol)))
      .filter(Boolean);
  }

  const selected = new Map();
  const liquidAssets = assets.filter((asset) => asset.liquidityQualified);
  for (const asset of liquidAssets.sort((a, b) => b.score - a.score).slice(0, ASSET_LIMIT)) selected.set(asset.asset, asset);
  for (const symbol of PRIORITY_ASSETS) {
    const match = assets.find((asset) => asset.asset === symbol);
    if (match) selected.set(match.asset, match);
  }
  for (const asset of assets
    .filter((item) => item.liquidityQualified && Math.abs(item.dayChangePct) >= 7.5)
    .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
    .slice(0, DYNAMIC_MOVER_LIMIT)) {
    selected.set(asset.asset, asset);
  }
  for (const asset of assets
    .filter((item) => Math.abs(item.dayChangePct) >= EXCEPTIONAL_MOVE_PCT && (item.liquidityQualified || isLargeCapLike(item) || passesExceptionalLiquidityFloor(item)))
    .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))) {
    selected.set(asset.asset, asset);
  }
  return [...selected.values()].sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct) || b.score - a.score);
}

function buildRadarContext(universe) {
  const liquid = universe.filter((asset) => asset.markPx > 0 && Number.isFinite(asset.dayChangePct));
  if (!liquid.length) return null;
  const btcReturn = liquid.find((asset) => asset.asset === "BTC")?.dayChangePct ?? 0;
  const basketReturn = weightedAverage(
    liquid.map((asset) => ({
      value: asset.dayChangePct,
      weight: liquidityWeight(asset),
    })),
  );
  const rawReturns = liquid.map((asset) => asset.dayChangePct);
  const btcResiduals = liquid.map((asset) => asset.dayChangePct - btcReturn);
  const basketResiduals = liquid.map((asset) => asset.dayChangePct - basketReturn);
  return {
    btcReturn,
    basketReturn,
    rawStats: robustStats(rawReturns),
    btcResidualStats: robustStats(btcResiduals),
    basketResidualStats: robustStats(basketResiduals),
  };
}

function radarQualityScore(edgeScore, direction) {
  const base = direction === "short" ? 76 : 78;
  return clampFloat(base + Math.max(edgeScore, 0) * 7, HIGH_SCORE_THRESHOLD, 100);
}

function computeRadarEdge(asset, features, radarContext, direction) {
  if (!radarContext) return null;
  const rawReturn24hPct = Number.isFinite(features.return24h) ? features.return24h : asset.dayChangePct;
  const btcResidualPct = rawReturn24hPct - radarContext.btcReturn;
  const basketResidualPct = rawReturn24hPct - radarContext.basketReturn;
  const rawReturnZ = robustZ(rawReturn24hPct, radarContext.rawStats);
  const btcResidualZ = robustZ(btcResidualPct, radarContext.btcResidualStats);
  const basketResidualZ = robustZ(basketResidualPct, radarContext.basketResidualStats);
  const return1h = features.return1h ?? 0;
  const return4h = features.return4h ?? 0;
  const accelerationRaw = return1h - return4h / 4 + (return4h - rawReturn24hPct / 6) * 0.35;
  const accelerationScore = clampFloat(accelerationRaw / 1.5, -2.5, 2.5);
  const volumeVs = features.volumeVsBaseline ?? 1;
  const participationScore = clampFloat((volumeVs - 1) * 0.55 + (asset.liquidityQualified ? 0.25 : 0), -0.75, 1.5);

  if (direction === "long") {
    const structureScore = features.breakout ? 1.2 : features.nearHigh ? 0.55 : 0;
    const score =
      0.3 * btcResidualZ +
      0.22 * basketResidualZ +
      0.12 * rawReturnZ +
      0.12 * structureScore +
      0.06 * accelerationScore +
      0.18 * participationScore;
    const outperformanceBreakout =
      rawReturn24hPct >= 8 &&
      btcResidualPct >= 5 &&
      basketResidualPct >= 3 &&
      (features.breakout || features.nearHigh || return4h >= 2);
    return {
      direction,
      score,
      rawReturn24hPct,
      btcReturn24hPct: radarContext.btcReturn,
      basketReturn24hPct: radarContext.basketReturn,
      btcResidualPct,
      basketResidualPct,
      rawReturnZ,
      btcResidualZ,
      basketResidualZ,
      structureScore,
      accelerationScore,
      participationScore,
      storeEligible: score >= RADAR_LONG_STORE_THRESHOLD || outperformanceBreakout,
      telegramEligible: score >= RADAR_LONG_STD_ALERT_THRESHOLD || outperformanceBreakout,
      triggerLabel: outperformanceBreakout ? "relative breakout" : "relative momentum",
    };
  }

  const weakBtcResidualPct = -btcResidualPct;
  const weakBasketResidualPct = -basketResidualPct;
  const weakRawZ = -rawReturnZ;
  const weakBtcZ = -btcResidualZ;
  const weakBasketZ = -basketResidualZ;
  const structureScore = features.breakdown ? 1.25 : features.nearLow ? 0.65 : 0;
  const score =
    0.3 * weakBtcZ +
    0.22 * weakBasketZ +
    0.12 * weakRawZ +
    0.12 * structureScore +
    0.06 * -accelerationScore +
    0.18 * participationScore;
  const downsidePressure =
    weakBtcResidualPct >= 4.5 &&
    weakBasketResidualPct >= 3.5 &&
    (rawReturn24hPct <= -2 || features.breakdown || features.nearLow);
  return {
    direction,
    score,
    rawReturn24hPct,
    btcReturn24hPct: radarContext.btcReturn,
    basketReturn24hPct: radarContext.basketReturn,
    btcResidualPct,
    basketResidualPct,
    rawReturnZ,
    btcResidualZ: weakBtcZ,
    basketResidualZ: weakBasketZ,
    structureScore,
    accelerationScore: -accelerationScore,
    participationScore,
    storeEligible: score >= RADAR_SHORT_STORE_THRESHOLD && downsidePressure,
    telegramEligible: score >= RADAR_SHORT_STD_ALERT_THRESHOLD && downsidePressure,
    triggerLabel: "relative weakness",
  };
}

function radarEdgeToScore(edge) {
  return {
    direction: edge.direction,
    triggerKind: edge.direction === "short" ? "momentum_continuation" : "momentum_continuation",
    score: radarQualityScore(edge.score, edge.direction),
    severity: edge.telegramEligible ? "high" : "medium",
    radarEdge: edge,
  };
}

async function fetchCandles(asset) {
  const endTime = Date.now();
  const startTime = endTime - LOOKBACK_MS;
  const rows = await withHyperliquidRetry(`candles:${asset.asset}`, () =>
    info.candleSnapshot({ coin: asset.rawName, interval: CANDLE_INTERVAL, startTime, endTime }),
  );
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

function scoreCandidate(asset, features, oiChangePct, direction = "long") {
  const r1h = features.return1h ?? 0;
  const r4h = features.return4h ?? 0;
  const r24h = features.return24h ?? 0;
  const volumeVs = features.volumeVsBaseline ?? 1;
  const fundingApr = asset.fundingApr;
  const sign = direction === "short" ? -1 : 1;
  const d1h = r1h * sign;
  const d4h = r4h * sign;
  const d24h = r24h * sign;
  const structureBreak = direction === "short" ? features.breakdown : features.breakout;
  const nearExtreme = direction === "short" ? features.nearLow : features.nearHigh;
  const strongMove = (d1h >= 1.0 && d4h >= 2.6) || (d4h >= 4.6) || (d24h >= 9.5 && d4h >= 1.8);
  const majorDayMove = d24h >= 22 && d1h >= -1.5 && volumeVs >= 0.7;
  const confirmation = volumeVs >= 1.18 || (oiChangePct ?? 0) >= 1.5 || (d24h >= 12 && volumeVs >= 1.05) || majorDayMove;
  const ignition = structureBreak && d4h >= 3 && d1h >= 0.6;
  const continuation = d24h >= 8.5 && d4h >= 1.6 && nearExtreme;
  const broadRunner = d24h >= 12 && d4h >= 2.2 && volumeVs >= 1.05;
  const localRunner = d4h >= 5.5 && d1h >= 0.75 && volumeVs >= 1.05;
  // Catch mature trend days that have already broken out and are consolidating near highs.
  // This is the ZEC/TON case: the 24h move is obvious, but the latest 4h window may have cooled.
  const trendDayRunner =
    d24h >= 14 &&
    d1h >= -1.25 &&
    volumeVs >= 0.85 &&
    (nearExtreme || d4h >= 1.5 || d1h >= 0.4 || d24h >= 25);
  // Exceptional 24h movers should not disappear just because they were outside
  // the curated liquid universe. If the move is extreme and not fully reversing,
  // evaluate it, then let scoring/caps decide whether it deserves an alert.
  const exceptionalRunner =
    d24h >= EXCEPTIONAL_MOVE_PCT &&
    d1h >= -2.5 &&
    (asset.liquidityQualified || isLargeCapLike(asset) || passesExceptionalLiquidityFloor(asset)) &&
    (nearExtreme || d4h >= 0.5 || d24h >= EXCEPTIONAL_MOVE_PCT + 8);
  const qualifiesByMove = strongMove || trendDayRunner || majorDayMove;
  const qualifies = qualifiesByMove || exceptionalRunner;
  const confirmed = confirmation || exceptionalRunner;
  if (!qualifies || !confirmed || (!ignition && !continuation && !broadRunner && !localRunner && !trendDayRunner && !exceptionalRunner)) {
    if (DEBUG && (d24h >= 8 || d4h >= 3 || d1h >= 1.5)) {
      console.log(
        `[momentum-alerts] reject ${asset.asset} ${direction} move=${qualifiesByMove} confirm=${confirmation} r1=${r1h.toFixed(2)} r4=${r4h.toFixed(2)} r24=${r24h.toFixed(2)} vol=${volumeVs.toFixed(2)} break=${structureBreak} nearExtreme=${nearExtreme}`,
      );
    }
    return null;
  }

  let score = 42;
  score += Math.min(Math.max(d1h, 0) * 4, 14);
  score += Math.min(Math.max(d4h, 0) * 2.8, 22);
  score += Math.min(Math.max(d24h, 0) * 0.9, 18);
  if (structureBreak) score += 12;
  if (nearExtreme) score += 7;
  if (broadRunner) score += 6;
  if (localRunner) score += 4;
  if (trendDayRunner) score += 5;
  if (exceptionalRunner) score += 12;
  if (majorDayMove) score += 6;
  score += Math.min(Math.max(volumeVs - 1, 0) * 10, 20);
  if (oiChangePct != null) score += Math.min(Math.max(oiChangePct, 0) * 1.4, 10);
  if (!asset.liquidityQualified) score -= 4;
  if (direction === "long" && fundingApr > 65) score -= Math.min((fundingApr - 65) * 0.18, 10);
  if (direction === "long" && fundingApr < -40) score -= Math.min(Math.abs(fundingApr + 40) * 0.08, 5);
  if (direction === "short" && fundingApr < -65) score -= Math.min((Math.abs(fundingApr) - 65) * 0.18, 10);
  score = Math.max(0, Math.min(100, score));
  const qualityScoreThreshold = asset.liquidityQualified || isLargeCapLike(asset)
    ? SCORE_THRESHOLD
    : Math.max(SCORE_THRESHOLD, HIGH_SCORE_THRESHOLD + 3);
  if (score < qualityScoreThreshold) {
    if (DEBUG && (d24h >= 8 || d4h >= 3 || d1h >= 1.5)) {
      console.log(`[momentum-alerts] reject ${asset.asset} ${direction} score=${score.toFixed(1)} threshold=${qualityScoreThreshold}`);
    }
    return null;
  }

  return {
    direction,
    triggerKind: ignition ? "momentum_ignition" : "momentum_continuation",
    score,
    severity: score >= HIGH_SCORE_THRESHOLD ? "high" : "medium",
  };
}

async function hasRecentAssetAlert(asset, direction, now) {
  const result = await pool.query(
    `select id, score, payload
     from momentum_alert_events
     where asset = $1
       and coalesce(payload->>'direction', 'long') = $2
       and created_at >= $3
     order by created_at desc
     limit 1`,
    [asset, direction, now - PER_ASSET_COOLDOWN_MS],
  );
  return result.rows[0] ?? null;
}

function shouldSkipForRecentAlert(recent, candidate) {
  if (!recent) return false;
  const candidateTelegram = candidate.payload?.telegramEligible === true;
  const recentTelegram = recent.payload?.telegramEligible === true;
  const candidateRadar = candidate.payload?.radarEdge?.telegramEligible === true;
  const recentRadar = recent.payload?.radarEdge?.telegramEligible === true;
  // Let a new website-aligned high-conviction radar signal upgrade an older
  // stored-only row, otherwise the 12h cooldown can hide the exact alert the UI
  // is currently recommending.
  if (candidateTelegram && candidateRadar && (!recentTelegram || !recentRadar)) return false;
  return true;
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

async function countQueuedOrSentSince(cutoffMs) {
  const result = await pool.query(
    `select count(*)::int as count
     from notification_queue
     where event_type = 'momentum_alert'
       and channel = 'telegram'
       and status in ('queued', 'sent')
       and created_at >= $1`,
    [cutoffMs],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countSentSince(cutoffMs) {
  const result = await pool.query(
    `select count(*)::int as count
     from notification_queue
     where event_type = 'momentum_alert'
       and channel = 'telegram'
       and status = 'sent'
       and sent_at >= $1`,
    [cutoffMs],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function loadOutcomeQuality(asset, direction) {
  try {
    const result = await pool.query(
      `select outcome, max_favorable_pct, max_adverse_pct, time_to_hit_ms
       from alert_outcomes
       where asset = $1
         and direction = $2
         and outcome in ('tp_first', 'sl_first')
       order by evaluated_at desc
       limit 20`,
      [asset, direction],
    );
    const rows = result.rows;
    const resolved = rows.length;
    const wins = rows.filter((row) => row.outcome === "tp_first").length;
    const losses = rows.filter((row) => row.outcome === "sl_first").length;
    const winRatePct = resolved > 0 ? (wins / resolved) * 100 : null;
    const avgMfe = average(rows.map((row) => Number(row.max_favorable_pct)).filter(Number.isFinite));
    const avgAbsMae = average(rows.map((row) => Math.abs(Number(row.max_adverse_pct))).filter(Number.isFinite));
    const medianTimeToHitMs = median(rows.map((row) => Number(row.time_to_hit_ms)).filter(Number.isFinite));

    let passes = true;
    let reason = "Limited TP/SL sample; high-conviction alerts can still qualify.";
    if (resolved >= 3) {
      passes = (winRatePct ?? 0) >= 50 && (avgMfe ?? 0) >= Math.max((avgAbsMae ?? 0) * 0.75, 0.25);
      reason = passes
        ? `TP/SL sample passes: ${wins}/${resolved} wins, avg MFE ${formatPct(avgMfe ?? 0)}, avg MAE -${formatPct(avgAbsMae ?? 0).replace("+", "")}.`
        : `TP/SL sample blocked Telegram: ${wins}/${resolved} wins, avg MFE ${formatPct(avgMfe ?? 0)}, avg MAE -${formatPct(avgAbsMae ?? 0).replace("+", "")}.`;
    }

    return {
      status: resolved >= 3 ? "tested" : "thin_sample",
      passes,
      resolved,
      wins,
      losses,
      winRatePct,
      avgMfe,
      avgAbsMae,
      medianTimeToHitMs,
      reason,
    };
  } catch (error) {
    if (DEBUG) console.warn("[momentum-alerts] outcome quality unavailable", error instanceof Error ? error.message : error);
    return {
      status: "unavailable",
      passes: true,
      resolved: 0,
      wins: 0,
      losses: 0,
      winRatePct: null,
      avgMfe: null,
      avgAbsMae: null,
      medianTimeToHitMs: null,
      reason: "TP/SL outcome history unavailable; using live signal quality only.",
    };
  }
}

function directionalReturn(direction, value) {
  if (!Number.isFinite(value)) return 0;
  return direction === "short" ? -value : value;
}

function chaseState(direction, d24h, volumeVs, edgeScore = null) {
  if (direction !== "long") return "clean";
  const edge = Number(edgeScore);
  if (d24h > TELEGRAM_LONG_HARD_CHASE_PCT) return "late_chase";
  if (d24h > TELEGRAM_LONG_SOFT_CHASE_PCT && !(Number.isFinite(edge) && edge >= RADAR_LONG_STD_ALERT_THRESHOLD && volumeVs >= 1.35)) {
    return "late_chase";
  }
  return "clean";
}

function telegramQualityDecision({ asset, features, score, direction, volumeVs }) {
  const d1h = directionalReturn(direction, features.return1h);
  const d4h = directionalReturn(direction, features.return4h);
  const d24h = directionalReturn(direction, features.return24h);
  const structureBreak = direction === "short" ? features.breakdown : features.breakout;
  const nearExtreme = direction === "short" ? features.nearLow : features.nearHigh;
  const confirmedMove = structureBreak || nearExtreme;
  const liquidityOk = asset.liquidityQualified || isLargeCapLike(asset);
  const edgeScore = Number(score.radarEdge?.score);
  const highQualityScore = score.score >= HIGH_SCORE_THRESHOLD;
  const radarQualified = score.radarEdge?.telegramEligible === true;
  const chase = chaseState(direction, d24h, volumeVs, edgeScore);

  if (!liquidityOk) return { eligible: false, reason: "Liquidity below Telegram gate." };
  if (!confirmedMove && !radarQualified) return { eligible: false, reason: "No breakout, breakdown, or near-extreme confirmation." };

  if (direction === "long") {
    const volumeOk = volumeVs >= TELEGRAM_MIN_VOLUME_VS || (radarQualified && volumeVs >= 1.05);
    const radarOk =
      radarQualified &&
      Number.isFinite(edgeScore) &&
      edgeScore >= RADAR_LONG_STD_ALERT_THRESHOLD &&
      d1h >= -1.25 &&
      d4h >= -2 &&
      volumeOk &&
      chase === "clean";
    const strictBreakout =
      d24h >= TELEGRAM_LONG_SOFT_CHASE_PCT &&
      d24h <= 22 &&
      d4h >= 4 &&
      d1h >= 0.8 &&
      volumeVs >= TELEGRAM_MIN_VOLUME_VS;
    const fundingPenalty = asset.fundingApr > 65;
    const fundingOk = !fundingPenalty || score.score >= HIGH_SCORE_THRESHOLD + 8;
    const eligible = fundingOk && ((radarOk && highQualityScore) || (highQualityScore && strictBreakout));
    return {
      eligible,
      reason: eligible
        ? radarOk
          ? "High relative-strength edge with volume confirmation."
          : "Strict breakout gate passed."
        : chase !== "clean"
          ? "Stored only: move is already extended for Telegram."
          : "Stored only: long momentum did not clear strict Telegram gate.",
      chase,
    };
  }

  const volumeOk = volumeVs >= TELEGRAM_SHORT_MIN_VOLUME_VS;
  const actualDownside = d24h >= TELEGRAM_SHORT_MIN_DOWN_24H_PCT || d4h >= 2 || d1h >= 0.6 || structureBreak;
  const strictShortBreakdown =
    d24h >= 6 &&
    d4h >= 3 &&
    d1h >= 0.6 &&
    volumeOk;
  const radarOk =
    radarQualified &&
    d24h >= TELEGRAM_SHORT_MIN_DOWN_24H_PCT &&
    d4h >= 1.5 &&
    volumeOk;
  const fundingPenalty = asset.fundingApr < -65;
  const fundingOk = !fundingPenalty || score.score >= HIGH_SCORE_THRESHOLD + 8;
  const eligible = fundingOk && actualDownside && highQualityScore && (radarOk || strictShortBreakdown);
  return {
    eligible,
    reason: eligible ? "High-confidence relative weakness with actual downside." : "Stored only: short-bias gate requires real downside and stronger volume.",
    chase: "clean",
  };
}

function isTelegramQualityCandidate({ asset, features, oiChangePct, score, direction, volumeVs }) {
  void oiChangePct;
  return telegramQualityDecision({ asset, features, score, direction, volumeVs }).eligible;
}

function isStoredTelegramQualityAlert(alert) {
  const direction = alert.payload?.direction === "short" ? "short" : "long";
  if (alert.payload?.outcomeQuality?.passes === false) return false;
  const d1h = directionalReturn(direction, alert.return1hPct);
  const d4h = directionalReturn(direction, alert.return4hPct);
  const d24h = directionalReturn(direction, alert.return24hPct);
  const volumeVs = Number(alert.volumeVsBaseline);
  const structureBreak = direction === "short" ? Boolean(alert.payload?.breakdown) : Boolean(alert.payload?.breakout);
  const nearExtreme = direction === "short" ? Boolean(alert.payload?.nearLow) : Boolean(alert.payload?.nearHigh);
  const confirmedMove = structureBreak || nearExtreme;
  const liquidity = alert.payload?.liquidity ?? {};
  const liquidityOk = Boolean(liquidity.qualified || liquidity.largeCapLike);
  const radarEdge = alert.payload?.radarEdge ?? {};
  const radarQualified = radarEdge.telegramEligible === true;
  const edgeScore = Number(radarEdge.score);
  if (!liquidityOk || alert.score < HIGH_SCORE_THRESHOLD || (!confirmedMove && !radarQualified)) return false;

  if (direction === "long") {
    const volumeOk = volumeVs >= TELEGRAM_MIN_VOLUME_VS || (radarQualified && volumeVs >= 1.05);
    const chase = chaseState(direction, d24h, volumeVs, edgeScore);
    const radarOk =
      radarQualified &&
      Number.isFinite(edgeScore) &&
      edgeScore >= RADAR_LONG_STD_ALERT_THRESHOLD &&
      d1h >= -1.25 &&
      d4h >= -2 &&
      volumeOk &&
      chase === "clean";
    const strictLongBreakout =
      d24h >= TELEGRAM_LONG_SOFT_CHASE_PCT &&
      d24h <= 22 &&
      d4h >= 4 &&
      d1h >= 0.8 &&
      volumeVs >= TELEGRAM_MIN_VOLUME_VS;
    return radarOk || strictLongBreakout;
  }

  const actualDownside = d24h >= TELEGRAM_SHORT_MIN_DOWN_24H_PCT || d4h >= 2 || d1h >= 0.6 || structureBreak;
  const radarOk = radarQualified && d24h >= TELEGRAM_SHORT_MIN_DOWN_24H_PCT && d4h >= 1.5 && volumeVs >= TELEGRAM_SHORT_MIN_VOLUME_VS;
  const strictShortBreakdown = d24h >= 6 && d4h >= 3 && d1h >= 0.6 && volumeVs >= TELEGRAM_SHORT_MIN_VOLUME_VS;
  return actualDownside && (radarOk || strictShortBreakdown);
}

function buildTradePlan({ direction, markPrice, invalidationPrice, fullTargetPrice, atr, edgeScore }) {
  const safeAtr = Number.isFinite(atr) && atr > 0 ? atr : markPrice * 0.015;
  const directionSign = direction === "short" ? -1 : 1;
  const stopDirectionSign = direction === "short" ? 1 : -1;
  const minStopMove = markPrice * (TELEGRAM_STOP_MIN_PCT / 100);
  const maxStopMove = markPrice * (TELEGRAM_STOP_MAX_PCT / 100);
  const maxMove = markPrice * (TELEGRAM_TP1_MAX_PCT / 100);
  const maxStopByReward = maxMove / TELEGRAM_MIN_REWARD_RISK;
  const effectiveMaxStopMove = Math.min(maxStopMove, maxStopByReward);
  const fallbackStopMove = clampFloat(Math.max(safeAtr * 0.8, minStopMove), minStopMove, effectiveMaxStopMove);
  const rawStopValid = direction === "short" ? invalidationPrice > markPrice : invalidationPrice < markPrice;
  const rawStopMove = rawStopValid ? Math.abs(invalidationPrice - markPrice) : fallbackStopMove;
  const stopMove = clampFloat(rawStopMove, minStopMove, effectiveMaxStopMove);
  const normalizedInvalidationPrice = markPrice + stopDirectionSign * stopMove;
  const edgeBoostPct = Number.isFinite(edgeScore) && edgeScore >= 2.4 ? 0.4 : 0;
  const tpPct = clampFloat(TELEGRAM_TP1_BASE_PCT + edgeBoostPct, TELEGRAM_TP1_MIN_PCT, TELEGRAM_TP1_MAX_PCT);
  const minMove = markPrice * (TELEGRAM_TP1_MIN_PCT / 100);
  const baseMove = Math.max(markPrice * (tpPct / 100), safeAtr * 0.95);
  const plannedMove = clampFloat(Math.max(baseMove, stopMove * TELEGRAM_MIN_REWARD_RISK), minMove, maxMove);
  const minimumTarget = markPrice + directionSign * minMove;
  const candidateTp1 = markPrice + directionSign * plannedMove;
  const fullTargetValid = direction === "short" ? fullTargetPrice < markPrice : fullTargetPrice > markPrice;
  let targetPrice = candidateTp1;

  if (fullTargetValid) {
    const fullTargetIsCloser = direction === "short" ? fullTargetPrice > candidateTp1 : fullTargetPrice < candidateTp1;
    targetPrice = fullTargetIsCloser ? fullTargetPrice : candidateTp1;
    const tooTight = direction === "short" ? targetPrice > minimumTarget : targetPrice < minimumTarget;
    if (tooTight) targetPrice = minimumTarget;
  }

  const protectAfterPrice = markPrice + directionSign * Math.max(markPrice * 0.015, safeAtr);
  const riskPct = Math.abs(((markPrice - normalizedInvalidationPrice) / markPrice) * 100);
  const rewardPct = Math.abs(((targetPrice - markPrice) / markPrice) * 100);
  const finalTargetPct = fullTargetValid ? Math.abs(((fullTargetPrice - markPrice) / markPrice) * 100) : null;
  const rewardRisk = riskPct > 0 ? rewardPct / riskPct : null;
  const valid =
    Number.isFinite(targetPrice) &&
    Number.isFinite(normalizedInvalidationPrice) &&
    rewardPct >= TELEGRAM_TP1_MIN_PCT * 0.95 &&
    riskPct >= TELEGRAM_STOP_MIN_PCT * 0.5 &&
    riskPct <= TELEGRAM_STOP_MAX_PCT * 1.05 &&
    rewardRisk != null &&
    rewardRisk >= TELEGRAM_MIN_REWARD_RISK &&
    (direction === "short" ? targetPrice < markPrice && normalizedInvalidationPrice > markPrice : targetPrice > markPrice && normalizedInvalidationPrice < markPrice);

  return {
    targetPrice,
    invalidationPrice: normalizedInvalidationPrice,
    finalTargetPrice: fullTargetValid ? fullTargetPrice : null,
    protectAfterPrice,
    tp1ReturnPct: rewardPct,
    stopDistancePct: riskPct,
    rewardRisk,
    finalTargetPct,
    leveragedTp1ReturnPct: rewardPct * TELEGRAM_DEFAULT_LEVERAGE,
    leveragedStopDistancePct: riskPct * TELEGRAM_DEFAULT_LEVERAGE,
    assumedLeverage: TELEGRAM_DEFAULT_LEVERAGE,
    stopWasNormalized: !rawStopValid || Math.abs(stopMove - rawStopMove) > markPrice * 0.00001,
    valid,
    methodologyVersion: "tp-sl-v3-2r",
    timeStopHours: 8,
  };
}

async function buildCandidate(asset, radarContext) {
  const candles = await fetchCandles(asset);
  const features = computeMomentumFeatures(asset.asset, candles, asset.markPx);
  if (!features) return null;
  const oiChangePct = await getOpenInterestChangePct(asset);
  const longScore = scoreCandidate(asset, features, oiChangePct, "long");
  const shortScore = scoreCandidate(asset, features, oiChangePct, "short");
  const longRadar = computeRadarEdge(asset, features, radarContext, "long");
  const shortRadar = computeRadarEdge(asset, features, radarContext, "short");
  const scoreOptions = [longScore, shortScore];
  if (longRadar?.storeEligible) scoreOptions.push(radarEdgeToScore(longRadar));
  if (shortRadar?.storeEligible) scoreOptions.push(radarEdgeToScore(shortRadar));
  const scoredOptions = scoreOptions
    .filter(Boolean)
    .map((option) => ({
      ...option,
      telegramEligible: isTelegramQualityCandidate({
        asset,
        features,
        oiChangePct,
        score: option,
        direction: option.direction,
        volumeVs: features.volumeVsBaseline ?? 1,
      }),
    }))
    .sort((a, b) =>
      Number(b.telegramEligible) - Number(a.telegramEligible) ||
      Number(Boolean(b.radarEdge)) - Number(Boolean(a.radarEdge)) ||
      b.score - a.score,
    );
  const score = scoredOptions[0] ?? null;
  if (!score) return null;
  const direction = score.direction;

  const support = await loadNearestLevel(asset.asset, "support", asset.markPx);
  const resistance = await loadNearestLevel(asset.asset, "resistance", asset.markPx);
  const atr = features.atr ?? asset.markPx * 0.015;
  const longInvalidation = Math.max(
    support?.zoneLow || support?.price || 0,
    Math.min(features.localPullbackLow, asset.markPx - atr * 1.25),
  );
  const shortInvalidation = resistance?.zoneHigh && resistance.zoneHigh > asset.markPx
    ? resistance.zoneHigh
    : Math.max(features.localHigh, asset.markPx + atr * 1.25);
  const invalidationPrice = direction === "short" ? shortInvalidation : longInvalidation;
  const longFallbackTarget = Math.max(features.high24h, asset.markPx + atr * 2.2);
  const shortFallbackTarget = Math.min(features.low24h, asset.markPx - atr * 2.2);
  const longTarget = resistance?.zoneHigh && resistance.zoneHigh > asset.markPx * 1.004
    ? resistance.zoneHigh
    : longFallbackTarget;
  const shortTarget = support?.zoneLow && support.zoneLow < asset.markPx * 0.996
    ? support.zoneLow
    : shortFallbackTarget;
  const fullTargetPrice = direction === "short" ? shortTarget : longTarget;
  const volumeVs = features.volumeVsBaseline ?? 1;
  const oiText = oiChangePct == null ? "OI context limited" : `OI ${formatPct(oiChangePct)}`;
  const bucket = momentumBucket(asset.asset);
  const outcomeQuality = await loadOutcomeQuality(asset.asset, direction);
  const radarEdge = score.radarEdge ?? null;
  const tradePlan = buildTradePlan({
    direction,
    markPrice: asset.markPx,
    invalidationPrice,
    fullTargetPrice,
    atr,
    edgeScore: radarEdge?.score,
  });
  const telegramDecision = telegramQualityDecision({
    asset,
    features,
    score,
    direction,
    volumeVs,
  });
  if (!tradePlan.valid) return null;
  const telegramEligible = score.telegramEligible && telegramDecision.eligible && outcomeQuality.passes && tradePlan.valid;
  const reason = radarEdge
    ? direction === "short"
      ? `${asset.asset} is a ${radarEdge.score.toFixed(2)}σ relative weakness signal: lags BTC by ${Math.abs(radarEdge.btcResidualPct).toFixed(1)}%, lags basket by ${Math.abs(radarEdge.basketResidualPct).toFixed(1)}%, and ${oiText}.`
      : `${asset.asset} is a ${radarEdge.score.toFixed(2)}σ long momentum leader: outperformed BTC by ${formatPct(radarEdge.btcResidualPct)}, outperformed basket by ${formatPct(radarEdge.basketResidualPct)}, and ${oiText}.`
    : direction === "short"
      ? `${asset.asset} broke lower with ${formatPct(features.return1h)} 1h / ${formatPct(features.return4h)} 4h downside momentum, ${volumeVs.toFixed(1)}x recent volume, and ${oiText}.`
      : `${asset.asset} broke higher with ${formatPct(features.return1h)} 1h / ${formatPct(features.return4h)} 4h momentum, ${volumeVs.toFixed(1)}x recent volume, and ${oiText}.`;

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
    invalidationPrice: tradePlan.invalidationPrice,
    targetPrice: tradePlan.targetPrice,
    routeHref: `/markets?asset=${encodeURIComponent(asset.asset)}`,
    payload: {
      direction,
      rawName: asset.rawName,
      signalBucket: bucket,
      easternDate: easternDateKey(),
      interval: CANDLE_INTERVAL,
      breakout: features.breakout,
      breakdown: features.breakdown,
      nearHigh: features.nearHigh,
      nearLow: features.nearLow,
      recentHigh: features.recentHigh,
      recentLow: features.recentLow,
      support,
      resistance,
      atr,
      rawInvalidationPrice: invalidationPrice,
      tradePlan,
      fullTargetPrice: tradePlan.finalTargetPrice,
      protectAfterPrice: tradePlan.protectAfterPrice,
      tp1ReturnPct: tradePlan.tp1ReturnPct,
      stopDistancePct: tradePlan.stopDistancePct,
      rewardRisk: tradePlan.rewardRisk,
      leveragedTp1ReturnPct: tradePlan.leveragedTp1ReturnPct,
      leveragedStopDistancePct: tradePlan.leveragedStopDistancePct,
      assumedLeverage: tradePlan.assumedLeverage,
      timeStopHours: tradePlan.timeStopHours,
      fundingPenaltyApplied: direction === "short" ? asset.fundingApr < -65 : asset.fundingApr > 65,
      outcomeQuality,
      telegramGate: telegramDecision,
      radarEdge: radarEdge
        ? {
            direction: radarEdge.direction,
            score: Number(radarEdge.score.toFixed(2)),
            rawReturn24hPct: Number(radarEdge.rawReturn24hPct.toFixed(2)),
            btcReturn24hPct: Number(radarEdge.btcReturn24hPct.toFixed(2)),
            basketReturn24hPct: Number(radarEdge.basketReturn24hPct.toFixed(2)),
            btcResidualPct: Number(radarEdge.btcResidualPct.toFixed(2)),
            basketResidualPct: Number(radarEdge.basketResidualPct.toFixed(2)),
            rawReturnZ: Number(radarEdge.rawReturnZ.toFixed(2)),
            btcResidualZ: Number(radarEdge.btcResidualZ.toFixed(2)),
            basketResidualZ: Number(radarEdge.basketResidualZ.toFixed(2)),
            structureScore: Number(radarEdge.structureScore.toFixed(2)),
            accelerationScore: Number(radarEdge.accelerationScore.toFixed(2)),
            participationScore: Number(radarEdge.participationScore.toFixed(2)),
            triggerLabel: radarEdge.triggerLabel,
            telegramEligible: radarEdge.telegramEligible,
          }
        : null,
      liquidity: {
        minOiUsd: MIN_OI_USD,
        minVolumeUsd: MIN_VOLUME_USD,
        qualified: asset.liquidityQualified,
        largeCapLike: isLargeCapLike(asset),
        openInterestUsd: asset.openInterestUsd,
        dayVolumeUsd: asset.dayVolumeUsd,
        exceptionalMovePct: EXCEPTIONAL_MOVE_PCT,
        exceptionalMinOiUsd: EXCEPTIONAL_MIN_OI_USD,
        exceptionalMinVolumeUsd: EXCEPTIONAL_MIN_VOLUME_USD,
      },
      telegramEligible,
    },
  };
}

function eventId(candidate, now) {
  const bucket = Math.floor(now / LOOP_INTERVAL_MS) * LOOP_INTERVAL_MS;
  return createHash("sha256")
    .update(`${candidate.asset}:${candidate.payload?.direction ?? "long"}:${candidate.triggerKind}:${bucket}:${candidate.alertPrice.toFixed(8)}`)
    .digest("hex")
    .slice(0, 24);
}

function formatMultiple(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}x`;
}

function volumeContextTag(value) {
  if (!Number.isFinite(value)) return "Volume: n/a";
  if (value >= 3) return `Volume: ${formatMultiple(value)} recent avg (surge)`;
  if (value >= 1.5) return `Volume: ${formatMultiple(value)} recent avg`;
  if (value >= 1) return `Volume: ${formatMultiple(value)} recent avg (active)`;
  return `Volume: ${formatMultiple(value)} recent avg (light)`;
}

function buildTelegramText(alert) {
  const severity = alert.severity === "high" ? "HIGH" : "MED";
  const direction = alert.payload?.direction === "short" ? "SHORT" : "LONG";
  const invalidationLabel = direction === "SHORT" ? "Invalid above" : "Invalid below";
  const radarEdge = alert.payload?.radarEdge;
  const score = Number(radarEdge?.score);
  const edgeLine = radarEdge
    ? `vs BTC ${formatPct(Number(radarEdge.btcResidualPct))} · vs Basket ${formatPct(Number(radarEdge.basketResidualPct))}`
    : alert.triggerKind === "momentum_ignition"
      ? "Breakout alert"
      : "Momentum alert";
  const contextLine = volumeContextTag(alert.volumeVsBaseline);
  const outcomeQuality = alert.payload?.outcomeQuality;
  const sampleLine = outcomeQuality?.status === "tested" && Number(outcomeQuality.resolved) > 0
    ? `TP/SL sample: ${Number(outcomeQuality.wins)}/${Number(outcomeQuality.resolved)} wins`
    : null;
  const tpLabel = direction === "SHORT" ? "TP1 cover" : "TP1 trim";
  const actionLine = `${tpLabel}: ${formatPrice(alert.targetPrice)} · ${invalidationLabel}: ${formatPrice(alert.invalidationPrice)}`;
  const tradePlan = alert.payload?.tradePlan ?? {};
  const rr = Number(alert.payload?.rewardRisk ?? tradePlan.rewardRisk);
  const tp1Pct = Number(alert.payload?.tp1ReturnPct ?? tradePlan.tp1ReturnPct);
  const stopPct = Number(alert.payload?.stopDistancePct ?? tradePlan.stopDistancePct);
  const leverage = Number(alert.payload?.assumedLeverage ?? tradePlan.assumedLeverage ?? TELEGRAM_DEFAULT_LEVERAGE);
  const riskLine =
    Number.isFinite(rr) && Number.isFinite(tp1Pct) && Number.isFinite(stopPct)
      ? `Plan: ${rr.toFixed(1)}R · 10x approx +${(tp1Pct * leverage).toFixed(0)}% / -${(stopPct * leverage).toFixed(0)}%`
      : null;
  const protectAfter = Number(alert.payload?.protectAfterPrice);
  const protectLine = Number.isFinite(protectAfter)
    ? `Protect after: ${formatPrice(protectAfter)} · Time stop: ${Number(alert.payload?.timeStopHours ?? 8)}h`
    : null;
  const returnLine = `1h ${formatPct(alert.return1hPct)} · 4h ${formatPct(alert.return4hPct)} · 24h ${formatPct(alert.return24hPct)}`;
  const qualityLine = Number.isFinite(score) ? `${severity} · ${score.toFixed(2)}σ edge` : `${severity} · breakout`;
  return [
    `${alert.asset} ${direction}`,
    qualityLine,
    "",
    `Price ${formatPrice(alert.alertPrice)}`,
    returnLine,
    edgeLine,
    "",
    actionLine,
    riskLine,
    protectLine,
    contextLine,
    sampleLine,
  ].filter((line) => line != null).join("\n");
}

function dbRowToAlert(row) {
  return {
    id: row.id,
    asset: row.asset,
    createdAt: Number(row.created_at),
    alertPrice: parseNumber(row.alert_price),
    currentPriceAtEval: parseNumber(row.current_price_at_eval),
    return1hPct: parseNumber(row.return_1h_pct),
    return4hPct: parseNumber(row.return_4h_pct),
    return24hPct: parseNumber(row.return_24h_pct),
    openInterestUsd: parseNumber(row.open_interest_usd),
    openInterestChangePct: row.open_interest_change_pct == null ? null : parseNumber(row.open_interest_change_pct),
    volume24hUsd: parseNumber(row.volume_24h_usd),
    volumeVsBaseline: parseNumber(row.volume_vs_baseline),
    fundingApr: parseNumber(row.funding_apr),
    triggerKind: row.trigger_kind,
    score: parseNumber(row.score),
    severity: row.severity,
    reason: row.reason,
    invalidationPrice: parseNumber(row.invalidation_price),
    targetPrice: parseNumber(row.target_price),
    routeHref: row.route_href || `/markets?asset=${encodeURIComponent(row.asset)}`,
    payload: row.payload ?? {},
  };
}

function normalizeTelegramText(text) {
  const appUrl = APP_URL.replace(/\/$/, "");
  return String(text).replace(/https:\/\/hyperpulse-gold\.vercel\.app/g, appUrl);
}

async function persistAlert(candidate, now, options = {}) {
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
  const telegramHourCount = await countQueuedOrSentSince(now - 60 * 60 * 1000);
  const telegramQualityEligible = alert.payload?.telegramEligible !== false;
  const telegramCycleAllowed = options.allowTelegram !== false;
  const telegramActiveWindow = isTelegramActiveWindow(now);
  const canSendTelegram =
    telegramCycleAllowed &&
    telegramQualityEligible &&
    telegramActiveWindow &&
    TELEGRAM_ENABLED &&
    TELEGRAM_BOT_TOKEN &&
    TELEGRAM_CHAT_ID &&
    telegramCount < TELEGRAM_DAILY_CAP &&
    telegramHourCount < TELEGRAM_HOURLY_CAP;
  const message = buildTelegramText(alert);
  const queueStatus = canSendTelegram ? "queued" : "disabled";
  const lastError = canSendTelegram
    ? null
    : !telegramCycleAllowed
      ? "Stored only: Telegram per-cycle pacing."
      : !telegramQualityEligible
      ? "Stored only: below Telegram quality gate."
      : !telegramActiveWindow
      ? telegramQuietHoursReason()
      : TELEGRAM_ENABLED && telegramHourCount >= TELEGRAM_HOURLY_CAP
      ? "Telegram hourly cap reached."
      : TELEGRAM_ENABLED && telegramCount >= TELEGRAM_DAILY_CAP
      ? "Telegram daily cap reached."
      : TELEGRAM_ENABLED
      ? "Telegram credentials missing."
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
      JSON.stringify({
        text: message,
        routeHref: alert.routeHref,
        asset: alert.asset,
        alert,
        telegramQuietHoursBlocked: !telegramActiveWindow,
      }),
    ],
  );
  return { alert, inserted: true, queued: canSendTelegram };
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: normalizeTelegramText(text), disable_web_page_preview: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram request failed with ${response.status}`);
  }
  return telegramReceipt(payload, "sendMessage");
}

async function fetchAlertChartCandles(alert) {
  const endTime = Date.now();
  const startTime = endTime - LOOKBACK_MS;
  const coin = cleanEnv(alert?.payload?.rawName) || cleanEnv(alert?.asset);
  if (!coin) throw new Error("Chart snapshot missing asset.");
  const rows = await withHyperliquidRetry(`telegram-chart:${coin}`, () =>
    info.candleSnapshot({ coin, interval: CANDLE_INTERVAL, startTime, endTime }),
  );
  return rows.map(candleToRow).filter(Boolean).sort((a, b) => a.time - b.time);
}

async function sendTelegramPhoto({ text, alert }) {
  const candles = await fetchAlertChartCandles(alert);
  const { renderMomentumChartPng } = await import("./chart.mjs");
  const png = await renderMomentumChartPng({ alert, candles });
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("caption", normalizeTelegramText(text).slice(0, 1024));
  form.append("photo", new Blob([png], { type: "image/png" }), `hyperpulse-${String(alert.asset).toLowerCase()}-momentum.png`);

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram photo request failed with ${response.status}`);
  }
  return telegramReceipt(payload, "sendPhoto");
}

function telegramReceipt(payload, method) {
  const message = payload?.result ?? {};
  return {
    method,
    messageId: message.message_id ?? null,
    chatId: message.chat?.id == null ? null : String(message.chat.id),
    sentAt: message.date ? message.date * 1000 : Date.now(),
  };
}

async function sendTelegramNotification(payload) {
  if (!isTelegramActiveWindow()) {
    throw new Error(telegramQuietHoursReason());
  }
  const text = payload?.text;
  if (!text) throw new Error("Notification payload missing text.");
  if (TELEGRAM_CHARTS_ENABLED && payload?.alert) {
    try {
      return await sendTelegramPhoto({ text, alert: payload.alert });
    } catch (error) {
      console.warn("[momentum-alerts] telegram chart failed; falling back to text", error instanceof Error ? error.message : error);
    }
  }
  return await sendTelegramMessage(text);
}

async function flushTelegramQueue() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || DRY_RUN) return 0;
  if (!isTelegramActiveWindow()) return 0;
  let hourlySent = await countSentSince(Date.now() - 60 * 60 * 1000);
  if (hourlySent >= TELEGRAM_HOURLY_CAP) return 0;

  const result = await pool.query(
    `select nq.id, nq.payload, nq.attempts
     from notification_queue nq
     join momentum_alert_events mea
       on mea.id = nq.event_id
      and nq.event_type = 'momentum_alert'
     where nq.event_type = 'momentum_alert'
       and nq.channel = 'telegram'
       and nq.status = 'queued'
       and nq.created_at >= $1
     order by
       coalesce(nullif(mea.payload #>> '{radarEdge,score}', '')::double precision, mea.score) desc,
       mea.score desc,
       nq.created_at asc
     limit 10`,
    [Date.now() - TELEGRAM_QUEUE_MAX_AGE_MS],
  );
  let sent = 0;
  for (const row of result.rows) {
    if (sent >= MAX_TELEGRAM_PER_CYCLE || hourlySent >= TELEGRAM_HOURLY_CAP) break;

    try {
      const receipt = await sendTelegramNotification(row.payload);
      const nextPayload = JSON.stringify({
        ...(row.payload ?? {}),
        telegramReceipt: receipt,
      });
      await pool.query(
        `update notification_queue
         set status = 'sent',
             sent_at = $2,
             attempts = attempts + 1,
             last_error = null,
             payload = $3::jsonb
         where id = $1`,
        [row.id, Date.now(), nextPayload],
      );
      sent += 1;
      hourlySent += 1;
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

async function recoverTelegramNotifications(now) {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || DRY_RUN) return 0;
  if (!isTelegramActiveWindow(now)) return 0;

  const dailyRemaining = Math.max(TELEGRAM_DAILY_CAP - await countQueuedOrSentToday(easternDateKey(now)), 0);
  const hourlyRemaining = Math.max(TELEGRAM_HOURLY_CAP - await countQueuedOrSentSince(now - 60 * 60 * 1000), 0);
  const limit = Math.min(MAX_TELEGRAM_PER_CYCLE, dailyRemaining, hourlyRemaining);
  if (limit <= 0) return 0;

  const result = await pool.query(
    `select mea.*, nq.id as queue_id
     from momentum_alert_events mea
     left join notification_queue nq
       on nq.event_type = 'momentum_alert'
      and nq.event_id = mea.id
      and nq.channel = 'telegram'
     where mea.created_at >= $1
       and (nq.id is null or nq.status = 'disabled')
       and coalesce(mea.payload->>'telegramEligible', 'true') <> 'false'
       and coalesce(nq.payload->>'telegramQuietHoursBlocked', 'false') <> 'true'
     order by
       coalesce(nullif(mea.payload #>> '{radarEdge,score}', '')::double precision, mea.score) desc,
       mea.score desc,
       mea.created_at desc
     limit $2`,
    [now - TELEGRAM_QUEUE_MAX_AGE_MS, limit],
  );
  if (result.rows.length === 0) return 0;

  let recovered = 0;
  for (const row of result.rows) {
    const alert = dbRowToAlert(row);
    if (!isStoredTelegramQualityAlert(alert)) continue;
    const message = buildTelegramText(alert);
    await pool.query(
      `insert into notification_queue (id, event_type, event_id, channel, status, created_at, message_hash, last_error, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (event_type, event_id, channel)
       do update set
         status = 'queued',
         message_hash = excluded.message_hash,
         last_error = null,
         payload = excluded.payload`,
      [
        `telegram:momentum_alert:${alert.id}`,
        "momentum_alert",
        alert.id,
        "telegram",
        "queued",
        alert.createdAt || now,
        createHash("sha256").update(message).digest("hex"),
        null,
        JSON.stringify({ text: message, routeHref: alert.routeHref, asset: alert.asset, alert }),
      ],
    );
    recovered += 1;
  }
  return recovered;
}

async function runCycle() {
  await assertTablesReady();
  const runId = await startRun({
    buildId: BUILD_ID,
    network: NETWORK,
    dryRun: DRY_RUN,
    dynamicMoverLimit: DYNAMIC_MOVER_LIMIT,
    exceptionalMovePct: EXCEPTIONAL_MOVE_PCT,
    maxAlertsPerCycle: MAX_ALERTS_PER_CYCLE,
    telegramConfigured: TELEGRAM_CONFIGURED,
    telegramEnabled: TELEGRAM_ENABLED,
    telegramChartsEnabled: TELEGRAM_CHARTS_ENABLED,
    storeDailyCap: STORE_DAILY_CAP,
    telegramDailyCap: TELEGRAM_DAILY_CAP,
    telegramHourlyCap: TELEGRAM_HOURLY_CAP,
    telegramActiveWindow: isTelegramActiveWindow(),
    telegramActiveHours: `${TELEGRAM_ACTIVE_START_HOUR}:00-${TELEGRAM_ACTIVE_END_HOUR}:00 ${TELEGRAM_TIME_ZONE}`,
    maxTelegramPerCycle: MAX_TELEGRAM_PER_CYCLE,
    radarLongStdAlertThreshold: RADAR_LONG_STD_ALERT_THRESHOLD,
    radarShortStdAlertThreshold: RADAR_SHORT_STD_ALERT_THRESHOLD,
  });
  const now = Date.now();
  const easternDate = easternDateKey(now);
  try {
    const universe = await loadUniverse();
    const radarContext = buildRadarContext(universe);
    const candidates = [];
    for (const asset of universe) {
      try {
        const candidate = await buildCandidate(asset, radarContext);
        if (!candidate) continue;
        const recent = await hasRecentAssetAlert(candidate.asset, candidate.payload?.direction ?? "long", now);
        if (shouldSkipForRecentAlert(recent, candidate)) continue;
        candidates.push(candidate);
      } catch (error) {
        console.warn(`[momentum-alerts] candidate failed ${asset.asset}`, error instanceof Error ? error.message : error);
      }
    }

    candidates.sort((a, b) =>
      Number(b.payload?.telegramEligible === true) - Number(a.payload?.telegramEligible === true) ||
      b.score - a.score,
    );
    let remaining = Math.max(STORE_DAILY_CAP - await countAlertsToday(easternDate), 0);
    let inserted = 0;
    let queued = 0;
    const selected = [];
    const bucketCounts = new Map();
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      if (inserted >= MAX_ALERTS_PER_CYCLE) break;
      const bucket = `${candidate.payload?.direction ?? "long"}:${candidate.payload?.signalBucket ?? momentumBucket(candidate.asset)}`;
      const bucketCount = bucketCounts.get(bucket) ?? 0;
      if (bucketCount >= MAX_PER_SIGNAL_BUCKET) continue;
      const result = await persistAlert({
        ...candidate,
        payload: { ...candidate.payload, easternDate },
      }, now, {
        allowTelegram: queued < MAX_TELEGRAM_PER_CYCLE,
      });
      if (!result.inserted) continue;
      inserted += 1;
      queued += result.queued ? 1 : 0;
      selected.push(result.alert.asset);
      bucketCounts.set(bucket, bucketCount + 1);
      remaining -= 1;
    }
    const requeued = await recoverTelegramNotifications(now);
    const sent = await flushTelegramQueue();
    await finishRun(runId, "success", null, {
      scanned: universe.length,
      candidates: candidates.length,
      inserted,
      queued,
      requeued,
      sent,
      selected,
      buckets: Object.fromEntries(bucketCounts.entries()),
      easternDate,
      radarContext: radarContext
        ? {
            btcReturn: Number(radarContext.btcReturn.toFixed(2)),
            basketReturn: Number(radarContext.basketReturn.toFixed(2)),
          }
        : null,
    });
    console.log(`[momentum-alerts] success scanned=${universe.length} candidates=${candidates.length} inserted=${inserted} queued=${queued} requeued=${requeued} sent=${sent}`);
  } catch (error) {
    await finishRun(runId, "failed", error instanceof Error ? error.message : String(error), { stack: error?.stack });
    throw error;
  }
}

async function main() {
  console.log(`[momentum-alerts] starting build=${BUILD_ID.slice(0, 12)} network=${NETWORK} interval=${LOOP_INTERVAL_MS}ms storeCap=${STORE_DAILY_CAP}/day telegramCap=${TELEGRAM_DAILY_CAP}/day telegramHourly=${TELEGRAM_HOURLY_CAP}/hour maxCycle=${MAX_ALERTS_PER_CYCLE} maxTelegramCycle=${MAX_TELEGRAM_PER_CYCLE} radarLong>=${RADAR_LONG_STD_ALERT_THRESHOLD}σ radarShort>=${RADAR_SHORT_STD_ALERT_THRESHOLD}σ telegram=${TELEGRAM_ENABLED ? "enabled" : "disabled"} charts=${TELEGRAM_CHARTS_ENABLED ? "enabled" : "disabled"} dynamicMovers=${DYNAMIC_MOVER_LIMIT} exceptionalMove=${EXCEPTIONAL_MOVE_PCT}% assets=${CONFIGURED_ASSETS.join(",") || `liquid top ${ASSET_LIMIT} + gated movers`}`);
  await runCycle();
  if (RUN_ONCE) {
    await pool.end();
    return;
  }
  setInterval(() => {
    runCycle().catch((error) => console.error("[momentum-alerts] cycle failed", error));
  }, LOOP_INTERVAL_MS);
}

process.on("unhandledRejection", (error) => {
  console.error("[momentum-alerts] unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
  console.error("[momentum-alerts] uncaught exception", error);
  process.exit(1);
});

main().catch(async (error) => {
  console.error("[momentum-alerts] fatal", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
