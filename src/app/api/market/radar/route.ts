import { NextRequest } from "next/server";
import { Pool } from "pg";
import { MIN_OI_USD } from "@/lib/constants";
import { isWhalesEnabled } from "@/lib/appConfig";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { computeMomentumEdges, selectMomentumEdges, type MomentumEdgeAsset, type RadarBetaInfo } from "@/lib/marketRadarScoring";
import { listPositioningAlerts } from "@/lib/whaleStore";
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

const RADAR_MAX_PER_BUCKET = 3;
const RADAR_MIN_VOLUME_USD = 20_000_000;
const RADAR_SCORE_THRESHOLD = 0.75;
const RADAR_WEAK_SCORE_THRESHOLD = 0.35;
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const BETA_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const BETA_MIN_SAMPLES = 72;

let pool: Pool | null = null;
let betaStoreDisabledUntil = 0;

function getPool(): Pool | null {
  if (!DATABASE_URL || betaStoreDisabledUntil > Date.now()) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  return pool;
}

function disableBetaStore(error: unknown) {
  betaStoreDisabledUntil = Date.now() + 5 * 60 * 1000;
  console.warn("[market-radar] beta history unavailable", error);
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

function buildMomentumSignal(kind: "strongest_asset" | "weakest_asset", asset: MomentumEdgeAsset, index: number, timestamp: number): MarketRadarSignal {
  const details = kind === "strongest_asset" ? asset.strongDetails : asset.weakDetails;
  const score = kind === "strongest_asset" ? asset.strongScore : asset.weakScore;
  const edgeLabel = kind === "strongest_asset" ? "Long Momentum" : "Short Momentum";
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
  return {
    id: `${kind}:${asset.coin}:${timestamp}`,
    kind,
    asset: asset.coin,
    label: `${edgeLabel} #${index + 1}`,
    value: `${score >= 0 ? "+" : ""}${score.toFixed(2)}σ`,
    severity: severityFromRadarScore(score),
    timestamp,
    evidence: [
      ...(kind === "strongest_asset"
        ? [
            `Outperformed BTC by ${formatPct(details.btcResidualPct)}`,
            `Outperformed liquid perp basket by ${formatPct(details.basketResidualPct)}`,
          ]
        : weakEvidence),
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

    const betas = await loadBtcBetas(rows.map((asset) => asset.coin));
    const scored = computeMomentumEdges(rows, betas);
    const strongestAssets = selectMomentumEdges({ assets: scored, direction: "strong", limit: RADAR_MAX_PER_BUCKET, threshold: RADAR_SCORE_THRESHOLD });
    const weakestAssets = selectMomentumEdges({ assets: scored, direction: "weak", limit: RADAR_MAX_PER_BUCKET, threshold: RADAR_WEAK_SCORE_THRESHOLD });
    const crowdedLong = [...rows].sort((a, b) => b.fundingAPR - a.fundingAPR)[0];
    const crowdedShort = [...rows].sort((a, b) => a.fundingAPR - b.fundingAPR)[0];

    strongestAssets.forEach((asset, index) => signals.push(buildMomentumSignal("strongest_asset", asset, index, timestamp)));
    weakestAssets.forEach((asset, index) => signals.push(buildMomentumSignal("weakest_asset", asset, index, timestamp)));
    if (crowdedLong) signals.push(buildCrowdingSignal("crowded_long", crowdedLong, "Most expensive long crowd", timestamp));
    if (crowdedShort) signals.push(buildCrowdingSignal("crowded_short", crowdedShort, "Most paid short crowd", timestamp));

    if (isWhalesEnabled()) {
      const alerts = await listPositioningAlerts({ timeframeMs: 24 * 60 * 60 * 1000, limit: 40 });
      const whale = alerts.find((alert) => alert.alertType === "high_conviction_whale");
      const liquidation = alerts.find((alert) => alert.alertType === "liquidation_pressure");
      if (whale) {
        signals.push({
          id: `whale_flow:${whale.id}`,
          kind: "whale_flow",
          asset: whale.asset,
          label: "Tracked whale flow",
          value: whale.severity.toUpperCase(),
          severity: whale.severity,
          timestamp: whale.timestamp,
          evidence: [whale.whyItMatters, whale.walletLabel ?? "tracked wallet"].filter(Boolean),
          routeHref: whale.walletAddress ? `/whales/${whale.walletAddress}?alert=${whale.id}` : `/markets?asset=${whale.asset}`,
        });
      }
      if (liquidation) {
        signals.push({
          id: `liquidation_pressure:${liquidation.id}`,
          kind: "liquidation_pressure",
          asset: liquidation.asset,
          label: "Nearby liquidation pressure",
          value: liquidation.severity.toUpperCase(),
          severity: liquidation.severity,
          timestamp: liquidation.timestamp,
          evidence: [liquidation.whyItMatters],
          routeHref: `/markets?asset=${liquidation.asset}`,
        });
      }
    }

    return jsonSuccess({
      signals,
      generatedAt: timestamp,
      source: isWhalesEnabled() ? "quant-radar-plus-tracked-flow" : "quant-radar",
      factorsIncluded: false,
    });
  } catch (error) {
    logServerError("api/market/radar", error);
    return jsonError("Unable to build market radar right now.", { status: 502 });
  }
}
