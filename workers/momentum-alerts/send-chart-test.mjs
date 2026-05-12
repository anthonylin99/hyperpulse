import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { renderMomentumChartPng } from "./chart.mjs";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

const workerDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(workerDir, "../..");

loadEnv(resolve(repoDir, ".env.local"));
loadEnv(resolve(repoDir, ".env"));
loadEnv(resolve(workerDir, ".env"));

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
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

function candleToRow(candle) {
  const time = normalizeTime(candle.t ?? candle.time ?? candle.openTime);
  const open = parseNumber(candle.o ?? candle.open);
  const high = parseNumber(candle.h ?? candle.high);
  const low = parseNumber(candle.l ?? candle.low);
  const close = parseNumber(candle.c ?? candle.close);
  if (!time || ![open, high, low, close].every((value) => value > 0)) return null;
  return { time, open, high, low, close };
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function valueAtLookback(candles, lookbackMs) {
  const target = Date.now() - lookbackMs;
  let candidate = null;
  for (const candle of candles) {
    if (candle.time <= target) candidate = candle;
    else break;
  }
  return candidate?.close ?? candles[0]?.close ?? null;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
if (!token || !chatId) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
  process.exit(1);
}

const asset = cleanEnv(process.argv[2]) || "BTC";
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: false }) });
const endTime = Date.now();
const startTime = endTime - 30 * 60 * 60 * 1000;
const candles = (await info.candleSnapshot({ coin: asset, interval: "5m", startTime, endTime }))
  .map(candleToRow)
  .filter(Boolean)
  .sort((a, b) => a.time - b.time);

if (candles.length < 5) {
  console.error(`Not enough candles returned for ${asset}.`);
  process.exit(1);
}

const last = candles[candles.length - 1];
const oneHour = valueAtLookback(candles, 60 * 60 * 1000);
const fourHour = valueAtLookback(candles, 4 * 60 * 60 * 1000);
const day = valueAtLookback(candles, 24 * 60 * 60 * 1000);
const highs = candles.slice(-48).map((row) => row.high);
const lows = candles.slice(-48).map((row) => row.low);
const recentHigh = Math.max(...highs);
const recentLow = Math.min(...lows);
const range = Math.max(recentHigh - recentLow, last.close * 0.01);
const alert = {
  asset,
  alertPrice: last.close,
  targetPrice: recentHigh + range * 0.28,
  invalidationPrice: recentLow,
  return1hPct: pctChange(last.close, oneHour),
  return4hPct: pctChange(last.close, fourHour),
  return24hPct: pctChange(last.close, day),
  volumeVsBaseline: 1.8,
  triggerKind: "momentum_ignition",
  payload: {
    direction: "long",
  },
};

const png = await renderMomentumChartPng({ alert, candles });
const caption = [
  "HYPERPULSE · CHART TEST",
  `${asset} LONG · Telegram chart card`,
  `Now: ${formatPrice(alert.alertPrice)} · 1h ${formatPct(alert.return1hPct)} · 4h ${formatPct(alert.return4hPct)} · 24h ${formatPct(alert.return24hPct)}`,
  `Trim: ${formatPrice(alert.targetPrice)} · Invalid < ${formatPrice(alert.invalidationPrice)}`,
  "This is a test image only.",
].join("\n");

const form = new FormData();
form.append("chat_id", chatId);
form.append("caption", caption.slice(0, 1024));
form.append("photo", new Blob([png], { type: "image/png" }), `hyperpulse-${asset.toLowerCase()}-chart-test.png`);

const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
  method: "POST",
  body: form,
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.ok === false) {
  console.error(payload?.description || `Telegram photo request failed with ${response.status}`);
  process.exit(1);
}

console.log(`telegram chart smoke sent for ${asset}`);
