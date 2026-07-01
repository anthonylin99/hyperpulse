import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG,
  analyzeEventVolumeAnomaly,
  findRollingVolumeAnomalies,
  type EventBacktestCandle,
  type EventVolumeBacktestConfig,
} from "../src/lib/eventVolumeAnomalyBacktest.ts";

type AnnouncementEvent = {
  id: string;
  asset: string;
  title: string;
  eventTime: string;
  category?: string;
  sourceUrl?: string;
  notes?: string;
};

type UniverseAsset = {
  asset: string;
  markPx: number;
  dayVolumeUsd: number;
  openInterestUsd: number;
  score: number;
};

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_EVENTS_PATH = "quant_research/data/announcement_events.json";
const DEFAULT_OUTPUT_PATH = "quant_research/reports/announcement_volume_anomaly_backtest.json";

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function parseNumberArg(name: string, fallback: number) {
  const parsed = Number(argValue(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMode() {
  const mode = argValue("mode", "both");
  if (mode === "events" || mode === "discover" || mode === "both") return mode;
  throw new Error("--mode must be one of events, discover, both");
}

async function hyperliquidInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid info ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    results.push(...(await Promise.all(batch.map((item, batchIndex) => fn(item, index + batchIndex)))));
    if (index + limit < items.length) await sleep(250);
  }
  return results;
}

function loadEvents(path: string): AnnouncementEvent[] {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) throw new Error(`Event file not found: ${fullPath}`);
  const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as AnnouncementEvent[];
  return parsed
    .filter((event) => event.id && event.asset && event.eventTime)
    .map((event) => ({ ...event, asset: event.asset.toUpperCase() }));
}

function normalizeCandle(candle: Record<string, unknown>): EventBacktestCandle | null {
  const time = Number(candle.t ?? candle.time ?? candle.openTime);
  const open = Number(candle.o ?? candle.open);
  const high = Number(candle.h ?? candle.high);
  const low = Number(candle.l ?? candle.low);
  const close = Number(candle.c ?? candle.close);
  const rawVolume = Number(candle.v ?? candle.volume ?? 0);
  if (![time, open, high, low, close, rawVolume].every(Number.isFinite)) return null;
  if (time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || rawVolume < 0) return null;
  return { time, open, high, low, close, volumeUsd: rawVolume * close };
}

async function fetchCandles(asset: string, startTime: number, endTime: number): Promise<EventBacktestCandle[]> {
  const raw = await hyperliquidInfo<Array<Record<string, unknown>>>({
    type: "candleSnapshot",
    req: { coin: asset, interval: "1h", startTime, endTime },
  });
  return raw.map(normalizeCandle).filter((candle): candle is EventBacktestCandle => candle != null);
}

async function loadUniverse(assetLimit: number, minOiUsd: number, minVolumeUsd: number): Promise<UniverseAsset[]> {
  const [meta, contexts] = await hyperliquidInfo<[
    { universe?: Array<{ name: string; isDelisted?: boolean }> },
    Array<Record<string, unknown>>,
  ]>({ type: "metaAndAssetCtxs" });

  return (meta.universe ?? [])
    .map((asset, index): UniverseAsset | null => {
      if (asset.isDelisted) return null;
      const ctx = contexts[index] ?? {};
      const markPx = Number(ctx.markPx);
      const dayVolumeUsd = Number(ctx.dayNtlVlm);
      const openInterestUsd = Number(ctx.openInterest) * markPx;
      if (![markPx, dayVolumeUsd, openInterestUsd].every(Number.isFinite) || markPx <= 0) return null;
      if (openInterestUsd < minOiUsd || dayVolumeUsd < minVolumeUsd) return null;
      return {
        asset: asset.name.toUpperCase(),
        markPx,
        dayVolumeUsd,
        openInterestUsd,
        score: dayVolumeUsd + openInterestUsd * 0.35,
      };
    })
    .filter((asset): asset is UniverseAsset => asset != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, assetLimit);
}

function writeJson(path: string, payload: unknown) {
  const fullPath = resolve(path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function compactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function winRate(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (clean.length === 0) return null;
  return (clean.filter((value) => value > 0).length / clean.length) * 100;
}

async function runEventBacktests(events: AnnouncementEvent[], config: EventVolumeBacktestConfig) {
  return mapLimit(events, 4, async (event) => {
    const eventTime = Date.parse(event.eventTime);
    const startTime = eventTime - (config.baselineHours + config.preEventHours + 24) * 60 * 60 * 1000;
    const endTime = eventTime + config.postEventHours * 60 * 60 * 1000;
    const candles = await fetchCandles(event.asset, startTime, endTime);
    const result = analyzeEventVolumeAnomaly(event.asset, event.id, eventTime, candles, config);
    return { event, result, candleCount: candles.length };
  });
}

async function runDiscoveryScan(universe: UniverseAsset[], discoverDays: number, minScore: number) {
  const endTime = Date.now();
  const startTime = endTime - discoverDays * 24 * 60 * 60 * 1000;
  const rows = await mapLimit(universe, 6, async (asset) => {
    try {
      const candles = await fetchCandles(asset.asset, startTime, endTime);
      const anomalies = findRollingVolumeAnomalies({
        asset: asset.asset,
        candles,
        minScore,
        baselineHours: 7 * 24,
        windowHours: 4,
        cooldownHours: 12,
      });
      return { asset, anomalies, candleCount: candles.length, error: null };
    } catch (error) {
      return {
        asset,
        anomalies: [],
        candleCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  return rows;
}

async function main() {
  const mode = parseMode();
  const eventsPath = argValue("events", DEFAULT_EVENTS_PATH) ?? DEFAULT_EVENTS_PATH;
  const outputPath = argValue("output", DEFAULT_OUTPUT_PATH) ?? DEFAULT_OUTPUT_PATH;
  const noOutput = hasFlag("no-output");
  const assetLimit = parseNumberArg("asset-limit", 80);
  const minOiUsd = parseNumberArg("min-oi-usd", 3_000_000);
  const minVolumeUsd = parseNumberArg("min-volume-usd", 8_000_000);
  const discoverDays = parseNumberArg("discover-days", 30);
  const minScore = parseNumberArg("min-score", 70);
  const config: EventVolumeBacktestConfig = {
    ...DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG,
    baselineHours: parseNumberArg("baseline-hours", DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG.baselineHours),
    preEventHours: parseNumberArg("pre-event-hours", DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG.preEventHours),
    postEventHours: parseNumberArg("post-event-hours", DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG.postEventHours),
  };

  const generatedAt = Date.now();
  const events = mode === "discover" ? [] : loadEvents(eventsPath);
  const universe = mode === "events" ? [] : await loadUniverse(assetLimit, minOiUsd, minVolumeUsd);
  const eventBacktests = mode === "discover" ? [] : await runEventBacktests(events, config);
  const discovery = mode === "events" ? [] : await runDiscoveryScan(universe, discoverDays, minScore);
  const discoveryAnomalies = discovery.flatMap((row) => row.anomalies).sort((a, b) => b.score - a.score || b.detectedAt - a.detectedAt);
  const sideAdjusted4h = discoveryAnomalies.map((anomaly) => anomaly.sideAdjustedForward4hPct);
  const sideAdjusted24h = discoveryAnomalies.map((anomaly) => anomaly.sideAdjustedForward24hPct);

  const report = {
    generatedAt,
    config: {
      mode,
      eventsPath,
      assetLimit,
      minOiUsd,
      minVolumeUsd,
      discoverDays,
      minScore,
      ...config,
    },
    eventBacktests,
    discovery: {
      universeCount: universe.length,
      failedAssets: discovery.filter((row) => row.error).map((row) => ({ asset: row.asset.asset, error: row.error })),
      anomalyCount: discoveryAnomalies.length,
      outcomeSummary: {
        sideAdjusted4hWinRatePct: winRate(sideAdjusted4h),
        averageSideAdjusted4hPct: average(sideAdjusted4h),
        sideAdjusted24hWinRatePct: winRate(sideAdjusted24h),
        averageSideAdjusted24hPct: average(sideAdjusted24h),
      },
      topAnomalies: discoveryAnomalies.slice(0, 50),
    },
  };

  if (!noOutput) writeJson(outputPath, report);

  console.log(`Event volume anomaly backtest generated ${new Date(generatedAt).toISOString()}`);
  if (eventBacktests.length > 0) {
    console.log("\nAnnouncement windows:");
    for (const row of eventBacktests) {
      const result = row.result;
      console.log(
        `${row.event.asset} ${row.event.title} | severity=${result.severity} score=${result.score} side=${result.side} preVol=${result.preEventVolumeMultiple?.toFixed(1) ?? "n/a"}x preRet=${pct(result.preEventReturnPct)} baseline=${compactUsd(result.baselineHourlyVolumeUsd)}`,
      );
    }
  }
  if (discoveryAnomalies.length > 0) {
    console.log(
      `\nDiscovery markout: 4h win=${pct(winRate(sideAdjusted4h))} avg=${pct(average(sideAdjusted4h))} | 24h win=${pct(winRate(sideAdjusted24h))} avg=${pct(average(sideAdjusted24h))}`,
    );
    console.log("\nTop rolling anomalies:");
    for (const anomaly of discoveryAnomalies.slice(0, 15)) {
      console.log(
        `${anomaly.asset} ${new Date(anomaly.detectedAt).toISOString()} | severity=${anomaly.severity} score=${anomaly.score} side=${anomaly.side} vol=${anomaly.volumeMultiple.toFixed(1)}x ret=${pct(anomaly.windowReturnPct)} fwd4=${pct(anomaly.sideAdjustedForward4hPct)} fwd24=${pct(anomaly.sideAdjustedForward24hPct)} fav24=${pct(anomaly.maxFavorable24hPct)} adv24=${pct(anomaly.maxAdverse24hPct)} price=${anomaly.price}`,
      );
    }
  } else if (mode !== "events") {
    console.log("\nNo rolling anomalies matched the current thresholds.");
  }
  if (!noOutput) console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error("[event-volume-backtest] failed", error);
  process.exit(1);
});
