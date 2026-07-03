import { getInfoClient } from "@/lib/hyperliquid";
import { getHypeLiveContext } from "@/lib/hypeFundamentals";
import { deriveHypeLevelPlan, type HypeResearchLevel } from "@/lib/hypeLevels";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { calculateSupportResistanceLevels, type ChartInterval, type LevelCandle } from "@/lib/supportResistance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type HypeResearchInterval = Exclude<ChartInterval, "5m">;

const TIMEFRAMES: Array<{ interval: HypeResearchInterval; lookbackMs: number }> = [
  { interval: "15m", lookbackMs: 7 * DAY_MS },
  { interval: "1h", lookbackMs: 30 * DAY_MS },
  { interval: "4h", lookbackMs: 120 * DAY_MS },
  { interval: "1d", lookbackMs: 180 * DAY_MS },
];

function normalizeCandles(raw: unknown): LevelCandle[] {
  const rows = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((candle: Record<string, unknown>) => ({
      time: Number(candle.t ?? candle.T ?? candle.time),
      open: Number(candle.o ?? candle.open),
      high: Number(candle.h ?? candle.high),
      low: Number(candle.l ?? candle.low),
      close: Number(candle.c ?? candle.close),
      volume: Number(candle.v ?? candle.vlm ?? candle.volume ?? 0),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.open > 0 &&
        candle.high > 0 &&
        candle.low > 0 &&
        candle.close > 0 &&
        candle.high >= candle.low,
    )
    .sort((a, b) => a.time - b.time);
}

function distancePct(mark: number, price: number): number {
  return ((price - mark) / mark) * 100;
}

function localSwingLevels(candles: LevelCandle[], interval: HypeResearchInterval, mark: number): HypeResearchLevel[] {
  const width = interval === "15m" ? 3 : interval === "1h" ? 2 : 1;
  const scoped = candles.slice(interval === "15m" ? -192 : -120);
  const levels: HypeResearchLevel[] = [];

  for (let index = width; index < scoped.length - width; index += 1) {
    const candle = scoped[index];
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= width; offset += 1) {
      if (scoped[index - offset].high >= candle.high || scoped[index + offset].high > candle.high) isHigh = false;
      if (scoped[index - offset].low <= candle.low || scoped[index + offset].low < candle.low) isLow = false;
    }

    if (isHigh && candle.high > mark && Math.abs(distancePct(mark, candle.high)) <= 10) {
      levels.push({
        price: candle.high,
        kind: "resistance",
        label: "Recent swing high",
        source: "recent_swing",
        timeframe: interval,
        confidence: interval === "15m" ? "low" : "medium",
        strength: Math.max(2, candle.volume),
        touches: 1,
        reason: `Recent ${interval} swing high from closed candles.`,
        evidence: [`Closed ${interval} swing high`, new Date(candle.time).toISOString()],
      });
    }

    if (isLow && candle.low < mark && Math.abs(distancePct(mark, candle.low)) <= 10) {
      levels.push({
        price: candle.low,
        kind: "support",
        label: "Recent swing low",
        source: "recent_swing",
        timeframe: interval,
        confidence: interval === "15m" ? "low" : "medium",
        strength: Math.max(2, candle.volume),
        touches: 1,
        reason: `Recent ${interval} swing low from closed candles.`,
        evidence: [`Closed ${interval} swing low`, new Date(candle.time).toISOString()],
      });
    }
  }

  return levels;
}

function volumeProfileLevels(candles: LevelCandle[], mark: number): HypeResearchLevel[] {
  const bucketSize = mark >= 100 ? 0.5 : 0.25;
  const buckets = new Map<number, { volumeUsd: number; touches: number }>();
  for (const candle of candles.slice(-960)) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const bucket = Math.round(typical / bucketSize) * bucketSize;
    const existing = buckets.get(bucket) ?? { volumeUsd: 0, touches: 0 };
    existing.volumeUsd += typical * Math.max(candle.volume, 0);
    existing.touches += 1;
    buckets.set(bucket, existing);
  }

  return [...buckets.entries()]
    .map(([price, bucket]) => ({
      price,
      bucket,
      dist: distancePct(mark, price),
    }))
    .filter((row) => Math.abs(row.dist) >= 0.35 && Math.abs(row.dist) <= 12)
    .sort((a, b) => b.bucket.volumeUsd - a.bucket.volumeUsd)
    .slice(0, 8)
    .map((row): HypeResearchLevel => ({
      price: row.price,
      kind: row.price < mark ? "support" : "resistance",
      label: "Volume node",
      source: "volume_profile",
      timeframe: "volume",
      confidence: row.bucket.volumeUsd > 200_000_000 ? "high" : row.bucket.volumeUsd > 75_000_000 ? "medium" : "low",
      strength: Math.log10(row.bucket.volumeUsd + 10),
      touches: row.bucket.touches,
      reason: `10d volume-by-price node with about $${Math.round(row.bucket.volumeUsd / 1_000_000)}M traded.`,
      evidence: [`Volume-by-price node`, `$${Math.round(row.bucket.volumeUsd / 1_000_000)}M notional`],
    }));
}

async function fetchHypeCandles() {
  const info = getInfoClient("mainnet");
  const endTime = Date.now();
  const entries = await Promise.all(
    TIMEFRAMES.map(async ({ interval, lookbackMs }) => {
      const raw = await info.candleSnapshot({
        coin: "HYPE",
        interval,
        startTime: endTime - lookbackMs,
        endTime,
      });
      return [interval, normalizeCandles(raw)] as const;
    }),
  );
  return { endTime, byInterval: Object.fromEntries(entries) as Record<HypeResearchInterval, LevelCandle[]> };
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-hype-levels",
    limit: 45,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const [{ byInterval, endTime }, live] = await Promise.all([
      fetchHypeCandles(),
      getHypeLiveContext(),
    ]);
    const mark = live.markPrice ?? byInterval["15m"].at(-1)?.close ?? null;
    if (mark == null || !Number.isFinite(mark) || mark <= 0) {
      return jsonError("Unable to research HYPE levels without a live mark.", {
        status: 502,
        cache: "public-market",
      });
    }

    const researchedLevels: HypeResearchLevel[] = [];
    for (const { interval } of TIMEFRAMES) {
      const candles = byInterval[interval] ?? [];
      researchedLevels.push(
        ...calculateSupportResistanceLevels(candles, interval)
          .filter((level) => level.status !== "broken" && level.status !== "expired")
          .filter((level) => level.kind === "support" || level.kind === "resistance")
          .map((level): HypeResearchLevel => ({
            price: level.price,
            kind: level.kind as "support" | "resistance",
            label: level.label,
            source: level.source,
            timeframe: interval,
            confidence: level.confidence,
            strength: level.strength,
            touches: level.touches,
            distancePct: level.distancePct,
            reason: level.reason,
            evidence: level.evidence,
          })),
        ...localSwingLevels(candles, interval, mark),
      );
    }
    researchedLevels.push(...volumeProfileLevels(byInterval["15m"], mark));

    const allTimeHigh = Math.max(
      ...Object.values(byInterval)
        .flat()
        .map((candle) => candle.high)
        .filter((price) => Number.isFinite(price) && price > 0),
    );

    const plan = deriveHypeLevelPlan({
      mark,
      priceChange24h: live.priceChange24hPct,
      oiChangePct: null,
      fundingApr: live.fundingApr,
      levelBias: undefined,
      researchedLevels,
      allTimeHigh,
      generatedAt: endTime,
    });

    return jsonSuccess(
      {
        ...plan,
        mark,
        allTimeHigh,
        researchedLevelCount: researchedLevels.length,
        methodology: "Official Hyperliquid HYPE candles across 15m/1h/4h/1d; levels are selected from closed-candle pivots, recent swings, and 10d volume-by-price nodes.",
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/hype/levels", error);
    return jsonError("Unable to research HYPE levels right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
