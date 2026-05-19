import { NextRequest } from "next/server";
import { Pool } from "pg";
import { MIN_OI_USD } from "@/lib/constants";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { computeMomentumEdges, selectHoldingUpEdges, selectMomentumEdges, type MomentumEdgeAsset, type RadarBetaInfo } from "@/lib/marketRadarScoring";
import type { MarketRadarSignal, WhaleSeverity } from "@/types";

export const dynamic = "force-dynamic";

type ParsedAsset = {
  coin: string;
  markPx: number;
  prevDayPx: number;
  priceChange24h: number;
  fundingAPR: number;
  openInterestUsd: number;
  dayVolumeUsd: number;
};

type RadarHistory = {
  return1hPct: number | null;
  return4hPct: number | null;
  fridayHigh: number | null;
  fridayLow: number | null;
};

type CandleRow = {
  time: number;
  high: number;
  low: number;
  close: number;
};

const RADAR_MAX_PER_BUCKET = 3;
const RADAR_MIN_VOLUME_USD = 20_000_000;
const RADAR_SCORE_THRESHOLD = 0.75;
const RADAR_WEAK_SCORE_THRESHOLD = 0.35;
const RADAR_HISTORY_CANDIDATE_LIMIT = 36;
const DATABASE_URL = getPooledDatabaseUrl();
const BETA_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const BETA_MIN_SAMPLES = 72;

let pool: Pool | null = null;
let betaStoreDisabledUntil = 0;
let marketCandlesChecked = false;
let marketCandlesAvailable = false;

function getPool(): Pool | null {
  if (!DATABASE_URL || betaStoreDisabledUntil > Date.now()) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  return pool;
}

function disableBetaStore(error: unknown) {
  betaStoreDisabledUntil = Date.now() + 5 * 60 * 1000;
  console.warn("[market-radar] beta history unavailable", error);
}

async function hasMarketCandlesTable(client: Pool): Promise<boolean> {
  if (marketCandlesChecked) return marketCandlesAvailable;
  const result = await client.query("select to_regclass('public.market_candles') as table_name");
  marketCandlesAvailable = Boolean(result.rows[0]?.table_name);
  marketCandlesChecked = true;
  if (!marketCandlesAvailable) betaStoreDisabledUntil = Date.now() + 5 * 60 * 1000;
  return marketCandlesAvailable;
}

function parseAssetRows(data: unknown): ParsedAsset[] {
  const [meta, assetCtxs] = data as [
    { universe?: Array<{ name: string; isDelisted?: boolean }> },
    Array<Record<string, string | number | undefined>>,
  ];

  if (!Array.isArray(meta?.universe) || !Array.isArray(assetCtxs)) return [];

  return meta.universe
    .map((asset, index): ParsedAsset | null => {
      if (asset.isDelisted) return null;
      const ctx = assetCtxs[index];
      if (!ctx) return null;

      const markPx = Number(ctx.markPx);
      const prevDayPx = Number(ctx.prevDayPx);
      const fundingRate = Number(ctx.funding);
      const openInterest = Number(ctx.openInterest) * markPx;
      if (!Number.isFinite(markPx) || markPx <= 0 || !Number.isFinite(prevDayPx) || prevDayPx <= 0) return null;

      return {
        coin: asset.name,
        markPx,
        prevDayPx,
        priceChange24h: ((markPx - prevDayPx) / prevDayPx) * 100,
        fundingAPR: Number.isFinite(fundingRate) ? fundingRate * 8760 * 100 : 0,
        openInterestUsd: Number.isFinite(openInterest) ? openInterest : 0,
        dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
      };
    })
    .filter((asset): asset is ParsedAsset => asset != null);
}

function severityFromAbsPct(value: number): WhaleSeverity {
  const abs = Math.abs(value);
  if (abs >= 8) return "high";
  if (abs >= 4) return "medium";
  return "low";
}

function severityFromRadarScore(score: number): WhaleSeverity {
  if (score >= 1.75) return "high";
  if (score >= 1.1) return "medium";
  return "low";
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return null;
  return Math.log(to / from);
}

function normalizeCandle(candle: Record<string, unknown>): CandleRow | null {
  const time = Number(candle.t ?? candle.T ?? candle.time ?? candle.openTime);
  const high = Number(candle.h ?? candle.high);
  const low = Number(candle.l ?? candle.low);
  const close = Number(candle.c ?? candle.close);
  if (![time, high, low, close].every(Number.isFinite)) return null;
  if (time <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  return { time, high, low, close };
}

function valueAtLookback(candles: CandleRow[], lookbackMs: number): number | null {
  const target = Date.now() - lookbackMs;
  let candidate: CandleRow | null = null;
  for (const candle of candles) {
    if (candle.time <= target) candidate = candle;
    else break;
  }
  return candidate?.close ?? null;
}

function lastFridayWindow(now = Date.now()): { start: number; end: number } {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(start).getUTCDay();
  const daysSinceFriday = day === 5 ? 0 : (day - 5 + 7) % 7;
  const fridayStart = start - daysSinceFriday * 24 * 60 * 60 * 1000;
  return { start: fridayStart, end: fridayStart + 24 * 60 * 60 * 1000 };
}

function computeRadarHistory(candles: CandleRow[], markPx: number): RadarHistory {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const oneHourClose = valueAtLookback(sorted, 60 * 60 * 1000);
  const fourHourClose = valueAtLookback(sorted, 4 * 60 * 60 * 1000);
  const friday = lastFridayWindow();
  const fridayCandles = sorted.filter((candle) => candle.time >= friday.start && candle.time < friday.end);
  const fridayHigh = fridayCandles.length > 0 ? Math.max(...fridayCandles.map((candle) => candle.high)) : null;
  const fridayLow = fridayCandles.length > 0 ? Math.min(...fridayCandles.map((candle) => candle.low)) : null;
  const return1h = oneHourClose == null ? null : pctChange(oneHourClose, markPx);
  const return4h = fourHourClose == null ? null : pctChange(fourHourClose, markPx);

  return {
    return1hPct: return1h == null ? null : return1h * 100,
    return4hPct: return4h == null ? null : return4h * 100,
    fridayHigh,
    fridayLow,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

function selectHistoryCandidates(rows: ParsedAsset[]): ParsedAsset[] {
  const selected = new Map<string, ParsedAsset>();
  const byLiquidity = [...rows]
    .sort((a, b) => b.dayVolumeUsd + b.openInterestUsd * 0.35 - (a.dayVolumeUsd + a.openInterestUsd * 0.35))
    .slice(0, RADAR_HISTORY_CANDIDATE_LIMIT);
  const byMove = [...rows]
    .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h))
    .slice(0, Math.floor(RADAR_HISTORY_CANDIDATE_LIMIT / 2));

  for (const asset of [...byLiquidity, ...byMove]) selected.set(asset.coin, asset);
  const btc = rows.find((asset) => asset.coin === "BTC");
  if (btc) selected.set("BTC", btc);
  return [...selected.values()];
}

async function loadRadarHistory(
  info: ReturnType<typeof getInfoClient>,
  rows: ParsedAsset[],
): Promise<Map<string, RadarHistory>> {
  const candidates = selectHistoryCandidates(rows);
  const endTime = Date.now();
  const startTime = endTime - 8 * 24 * 60 * 60 * 1000;
  const entries = await mapLimit(candidates, 8, async (asset) => {
    try {
      const raw = await info.candleSnapshot({
        coin: asset.coin,
        interval: "1h",
        startTime,
        endTime,
      });
      const candles = Array.isArray(raw)
        ? raw
            .map((candle) => normalizeCandle(candle as Record<string, unknown>))
            .filter((candle): candle is CandleRow => candle != null)
        : [];
      return [asset.coin, computeRadarHistory(candles, asset.markPx)] as const;
    } catch {
      return [asset.coin, null] as const;
    }
  });

  const history = new Map<string, RadarHistory>();
  for (const [coin, item] of entries) {
    if (item) history.set(coin, item);
  }
  return history;
}

function computeBeta(assetReturns: number[], btcReturns: number[]): number | null {
  const count = Math.min(assetReturns.length, btcReturns.length);
  if (count < BETA_MIN_SAMPLES) return null;
  const xs = btcReturns.slice(0, count);
  const ys = assetReturns.slice(0, count);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / count;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < count; index += 1) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY);
    variance += (xs[index] - meanX) ** 2;
  }
  if (variance <= 0) return null;
  return covariance / variance;
}

function returnsByBtcTime(btcByTime: Map<number, number>, assetByTime: Map<number, number>): { asset: number[]; btc: number[] } {
  const times = [...btcByTime.keys()].sort((a, b) => a - b);
  const assetReturns: number[] = [];
  const btcReturns: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1];
    const current = times[index];
    const previousBtc = btcByTime.get(previous);
    const currentBtc = btcByTime.get(current);
    const previousAsset = assetByTime.get(previous);
    const currentAsset = assetByTime.get(current);
    if (previousBtc == null || currentBtc == null || previousAsset == null || currentAsset == null) continue;
    const btcReturn = pctChange(previousBtc, currentBtc);
    const assetReturn = pctChange(previousAsset, currentAsset);
    if (btcReturn == null || assetReturn == null) continue;
    btcReturns.push(btcReturn);
    assetReturns.push(assetReturn);
  }
  return { asset: assetReturns, btc: btcReturns };
}

async function loadBtcBetas(coins: string[]): Promise<Record<string, RadarBetaInfo>> {
  const client = getPool();
  if (!client) return {};
  const symbols = Array.from(new Set([...coins.map((coin) => coin.toUpperCase()), "BTC"]));
  try {
    if (!(await hasMarketCandlesTable(client))) return {};
    const result = await client.query(
      `select upper(asset) as asset, open_time, close
       from market_candles
       where interval = '1h'
         and upper(asset) = any($1::text[])
         and open_time >= $2
       order by asset asc, open_time asc`,
      [symbols, Date.now() - BETA_LOOKBACK_MS],
    );
    const closesByAsset = new Map<string, Map<number, number>>();
    for (const row of result.rows) {
      const asset = String(row.asset).toUpperCase();
      const openTime = Number(row.open_time);
      const close = Number(row.close);
      if (!Number.isFinite(openTime) || !Number.isFinite(close) || close <= 0) continue;
      const bucket = closesByAsset.get(asset) ?? new Map<number, number>();
      bucket.set(openTime, close);
      closesByAsset.set(asset, bucket);
    }
    const btcByTime = closesByAsset.get("BTC");
    if (!btcByTime || btcByTime.size < BETA_MIN_SAMPLES + 1) return {};
    const betas: Record<string, RadarBetaInfo> = { BTC: { beta: 1, status: "ready", samples: btcByTime.size - 1 } };
    for (const symbol of symbols) {
      if (symbol === "BTC") continue;
      const assetByTime = closesByAsset.get(symbol);
      if (!assetByTime) continue;
      const aligned = returnsByBtcTime(btcByTime, assetByTime);
      const beta = computeBeta(aligned.asset, aligned.btc);
      if (beta == null) continue;
      betas[symbol] = { beta, status: "ready", samples: aligned.asset.length };
    }
    return betas;
  } catch (error) {
    disableBetaStore(error);
    return {};
  }
}

function buildCrowdingSignal(kind: MarketRadarSignal["kind"], asset: ParsedAsset, label: string, timestamp: number): MarketRadarSignal {
  return {
    id: `${kind}:${asset.coin}:${timestamp}`,
    kind,
    asset: asset.coin,
    label,
    value: `${asset.fundingAPR.toFixed(1)}% APR`,
    severity: severityFromAbsPct(asset.fundingAPR),
    timestamp,
    evidence: [
      `${formatCompactUsd(asset.openInterestUsd)} open interest`,
      `${formatCompactUsd(asset.dayVolumeUsd)} 24h volume`,
      `24h move ${formatPct(asset.priceChange24h)}`,
    ],
    routeHref: `/markets?asset=${encodeURIComponent(asset.coin)}`,
  };
}

function buildMomentumSignal(kind: "strongest_asset" | "holding_up" | "weakest_asset", asset: MomentumEdgeAsset, index: number, timestamp: number): MarketRadarSignal {
  const isWeak = kind === "weakest_asset";
  const details = isWeak ? asset.weakDetails : asset.strongDetails;
  const score = isWeak ? asset.weakScore : asset.strongScore;
  const edgeLabel = kind === "strongest_asset" ? "Long Momentum" : kind === "holding_up" ? "Holding Up" : "Relative Weakness";
  const divergenceEvidence = !isWeak
    ? details.assetAboveFridayHigh && !details.btcAboveFridayHigh
      ? "Structure divergence: asset above Friday high while BTC is not"
      : `Structure score ${details.structureDivergenceScore.toFixed(2)}`
    : details.assetBelowFridayLow && !details.btcBelowFridayLow
      ? "Structure divergence: asset below Friday low while BTC is not"
      : `Structure score ${details.structureDivergenceScore.toFixed(2)}`;
  const accelerationEvidence =
    details.return1hPct == null || details.return4hPct == null
      ? `Acceleration z ${details.accelerationScore.toFixed(2)}`
      : `1h ${formatPct(details.return1hPct)} · 4h ${formatPct(details.return4hPct)} · accel z ${details.accelerationScore.toFixed(2)}`;
  const weakEvidence =
    asset.coin === "BTC"
      ? [
          `Lagged liquid perp basket by ${Math.abs(details.basketResidualPct).toFixed(2)}%`,
          `Raw 24h BTC move ${formatPct(details.rawReturn24hPct)}`,
        ]
      : [
          `Lagged BTC by ${Math.abs(details.btcResidualPct).toFixed(2)}%`,
          `Lagged liquid perp basket by ${Math.abs(details.basketResidualPct).toFixed(2)}%`,
        ];
  const holdingEvidence = [
    `Holding up versus BTC by ${formatPct(details.btcResidualPct)}`,
    `Holding up versus liquid perp basket by ${formatPct(details.basketResidualPct)}`,
    `Raw 24h move ${formatPct(details.rawReturn24hPct)}; not a long entry by itself`,
  ];
  return {
    id: `${kind}:${asset.coin}:${timestamp}`,
    kind,
    asset: asset.coin,
    label: `${edgeLabel} #${index + 1}`,
    value: `${score >= 0 ? "+" : ""}${score.toFixed(2)}σ`,
    severity: severityFromRadarScore(score),
    timestamp,
    evidence: [
      ...(kind === "holding_up"
        ? holdingEvidence
        : kind === "strongest_asset"
        ? [
            `Outperformed BTC by ${formatPct(details.btcResidualPct)}`,
            `Outperformed liquid perp basket by ${formatPct(details.basketResidualPct)}`,
          ]
        : weakEvidence),
      divergenceEvidence,
      accelerationEvidence,
      `Momentum z-score ${details.crossSectionalZ >= 0 ? "+" : ""}${details.crossSectionalZ.toFixed(2)}`,
      `Beta to BTC ${details.betaStatus === "ready" ? details.btcBeta.toFixed(2) : "fallback 1.00"}`,
      `${details.volumeConfirmation ? "Volume confirming" : "Volume below universe median"} · ${details.oiConfirmation ? "OI base liquid" : "OI below universe median"}`,
    ],
    routeHref: `/markets?asset=${encodeURIComponent(asset.coin)}`,
    scoreDetails: details,
  };
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-market-radar",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
    const rows = parseAssetRows(await info.metaAndAssetCtxs()).filter(
      (asset) => asset.openInterestUsd >= MIN_OI_USD && asset.dayVolumeUsd >= RADAR_MIN_VOLUME_USD,
    );
    const timestamp = Date.now();
    const signals: MarketRadarSignal[] = [];
    const history = await loadRadarHistory(info, rows);
    const btc = rows.find((asset) => asset.coin === "BTC");
    const btcHistory = history.get("BTC");
    const enrichedRows = rows.map((asset) => {
      const item = history.get(asset.coin);
      return {
        ...asset,
        return1hPct: item?.return1hPct ?? null,
        return4hPct: item?.return4hPct ?? null,
        fridayHigh: item?.fridayHigh ?? null,
        fridayLow: item?.fridayLow ?? null,
        btcFridayHigh: btcHistory?.fridayHigh ?? null,
        btcFridayLow: btcHistory?.fridayLow ?? null,
        btcMarkPx: btc?.markPx ?? null,
      };
    });

    const betas = await loadBtcBetas(rows.map((asset) => asset.coin));
    const scored = computeMomentumEdges(enrichedRows, betas);
    const strongestAssets = selectMomentumEdges({ assets: scored, direction: "strong", limit: RADAR_MAX_PER_BUCKET, threshold: RADAR_SCORE_THRESHOLD });
    const holdingUpAssets =
      strongestAssets.length === 0
        ? selectHoldingUpEdges({ assets: scored, limit: RADAR_MAX_PER_BUCKET, threshold: 0.25 })
        : [];
    const weakestAssets = selectMomentumEdges({ assets: scored, direction: "weak", limit: RADAR_MAX_PER_BUCKET, threshold: RADAR_WEAK_SCORE_THRESHOLD })
      .filter((asset) => asset.coin !== "BTC");
    const crowdedLong = [...rows].sort((a, b) => b.fundingAPR - a.fundingAPR)[0];
    const crowdedShort = [...rows].sort((a, b) => a.fundingAPR - b.fundingAPR)[0];

    strongestAssets.forEach((asset, index) => signals.push(buildMomentumSignal("strongest_asset", asset, index, timestamp)));
    holdingUpAssets.forEach((asset, index) => signals.push(buildMomentumSignal("holding_up", asset, index, timestamp)));
    weakestAssets.forEach((asset, index) => signals.push(buildMomentumSignal("weakest_asset", asset, index, timestamp)));
    if (crowdedLong) signals.push(buildCrowdingSignal("crowded_long", crowdedLong, "Most expensive long crowd", timestamp));
    if (crowdedShort) signals.push(buildCrowdingSignal("crowded_short", crowdedShort, "Most paid short crowd", timestamp));

    return jsonSuccess({
      signals,
      generatedAt: timestamp,
      source: "quant-radar",
      factorsIncluded: false,
    }, { cache: "public-market" });
  } catch (error) {
    logServerError("api/market/radar", error);
    return jsonError("Unable to build market radar right now.", { status: 502, cache: "public-market" });
  }
}
