// Regenerates src/data/crowding-track-record.json — the pooled backtest stats
// shown in the crowding desk UI. Run periodically (walk-forward) so the shipped
// numbers never go stale:
//
//   npm run research:crowding-track
//
// Fetches 120 days of 1h candles + funding history for a fixed liquid basket
// from the public Hyperliquid info API (sequential, paced, exponential backoff
// on 429/5xx — the API rate-limits unpaced funding pagination hard).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  computeTrackRecord,
  type HistoryCandle,
  type HistoryFundingPoint,
} from "../src/lib/crowdingHistory.ts";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const OUTPUT_PATH = "src/data/crowding-track-record.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 120;
const PACE_MS = 300;
const MAX_RETRIES = 6;

const BASKET = [
  "BTC", "ETH", "SOL", "HYPE", "AAVE", "BNB", "ZEC", "TAO", "TON", "ONDO",
  "JTO", "NEAR", "PENDLE", "INJ", "VVV", "WLD", "BCH", "SUI", "ARB", "LTC",
  "ENA", "RENDER", "OP", "DOGE", "XRP",
];

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function hyperliquidInfo<T>(body: Record<string, unknown>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return (await response.json()) as T;
    if (response.status === 429 || response.status >= 500) {
      const wait = Math.min(1000 * 2 ** attempt, 32_000);
      process.stderr.write(`  ${label}: HTTP ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms\n`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: HTTP ${response.status} ${await response.text()}`);
  }
  throw new Error(`${label}: exhausted ${MAX_RETRIES} retries`);
}

async function fetchCandles(coin: string, startTime: number, endTime: number): Promise<HistoryCandle[]> {
  const rows = await hyperliquidInfo<Array<Record<string, unknown>>>(
    { type: "candleSnapshot", req: { coin, interval: "1h", startTime, endTime } },
    `candles:${coin}`,
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    t: Number(row.t),
    c: Number(row.c),
    v: Number(row.v),
  }));
}

async function fetchFunding(coin: string, startTime: number, endTime: number): Promise<HistoryFundingPoint[]> {
  const out: HistoryFundingPoint[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const rows = await hyperliquidInfo<Array<Record<string, unknown>>>(
      { type: "fundingHistory", coin, startTime: cursor, endTime },
      `funding:${coin}`,
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) out.push({ t: Number(row.time), rate: Number(row.fundingRate) });
    const lastTime = Number(rows[rows.length - 1].time);
    if (!Number.isFinite(lastTime) || lastTime <= cursor) break;
    cursor = lastTime + 1;
    await sleep(PACE_MS);
  }
  return out;
}

async function main() {
  const endTime = Date.now();
  const startTime = endTime - WINDOW_DAYS * DAY_MS;
  const datasets: Array<{ coin: string; candles: HistoryCandle[]; funding: HistoryFundingPoint[] }> = [];
  for (const coin of BASKET) {
    const candles = await fetchCandles(coin, startTime, endTime);
    await sleep(PACE_MS);
    const funding = await fetchFunding(coin, startTime, endTime);
    await sleep(PACE_MS);
    datasets.push({ coin, candles, funding });
    process.stderr.write(`${coin}: ${candles.length} candles, ${funding.length} funding rows\n`);
  }

  const record = computeTrackRecord(datasets, { startTime, endTime, windowDays: WINDOW_DAYS });
  const outPath = resolve(OUTPUT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  process.stderr.write(`Wrote ${outPath} (${record.assetCount} assets)\n`);
  process.stdout.write(`${JSON.stringify(record.tiers.high_actionable, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
