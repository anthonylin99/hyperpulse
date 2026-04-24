import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { computeCorrelationMatrix } from "@/lib/correlation";
import { getResearchDailyPrices, normalizeResearchAssets } from "@/lib/researchMarketData";
import type { CorrelationCluster, DailyMarketPrice } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawAssetPosition = {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    unrealizedPnl: string;
  };
};

function parseDays(value: string | null): number {
  const parsed = Number(value ?? 90);
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(Math.max(Math.round(parsed), 30), 365);
}

function parseNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function markPrice(position: RawAssetPosition["position"]): number {
  const entryPrice = parseNumber(position.entryPx);
  const szi = parseNumber(position.szi);
  const absSize = Math.abs(szi);
  const pnlPerUnit = absSize > 0 ? parseNumber(position.unrealizedPnl) / absSize : 0;
  return szi >= 0 ? entryPrice + pnlPerUnit : entryPrice - pnlPerUnit;
}

function assetFromFill(fill: Record<string, unknown>): string | null {
  const coin = String(fill.coin ?? "").trim();
  if (!coin || coin.startsWith("@")) return null;
  return coin;
}

function groupPricesByAsset(prices: DailyMarketPrice[]): Record<string, DailyMarketPrice[]> {
  const grouped: Record<string, DailyMarketPrice[]> = {};
  for (const price of prices) {
    grouped[price.asset] = [...(grouped[price.asset] ?? []), price];
  }
  return grouped;
}

function buildClusters(args: {
  matrix: ReturnType<typeof computeCorrelationMatrix>;
  exposures: Record<string, number>;
}): CorrelationCluster[] {
  const clusters: CorrelationCluster[] = [];
  const seen = new Set<string>();

  for (const entry of args.matrix) {
    if (entry.assetA === entry.assetB || entry.correlation == null) continue;
    const key = [entry.assetA, entry.assetB].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);

    if (Math.abs(entry.correlation) < 0.65) continue;
    const notionalA = args.exposures[entry.assetA] ?? 0;
    const notionalB = args.exposures[entry.assetB] ?? 0;
    if (notionalA <= 0 || notionalB <= 0) continue;

    const direction = entry.correlation > 0 ? "same-risk cluster" : "hedge-like offset";
    clusters.push({
      primaryAsset: entry.assetA,
      secondaryAsset: entry.assetB,
      correlation: entry.correlation,
      combinedNotionalUsd: notionalA + notionalB,
      note: `${entry.assetA}/${entry.assetB} ${direction} over this window.`,
    });
  }

  return clusters.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 5);
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-portfolio-correlations",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  const now = Date.now();

  try {
    const [state, fills] = await Promise.all([
      info.clearinghouseState({ user: address as `0x${string}` }),
      info.userFillsByTime({
        user: address as `0x${string}`,
        startTime: now - Math.min(days * 2, 365) * 24 * 60 * 60 * 1000,
        aggregateByTime: true,
      }).catch(() => []),
    ]);

    const exposures: Record<string, number> = {};
    const openAssets = (state.assetPositions as RawAssetPosition[])
      .filter((item) => parseNumber(item.position.szi) !== 0)
      .map((item) => {
        const asset = item.position.coin;
        exposures[asset] = Math.abs(parseNumber(item.position.szi)) * Math.max(markPrice(item.position), 0);
        return asset;
      });
    const fillAssets = (Array.isArray(fills) ? fills : [])
      .map((fill) => assetFromFill(fill as Record<string, unknown>))
      .filter((asset): asset is string => asset != null);
    const assets = normalizeResearchAssets([...openAssets, ...fillAssets]).slice(0, 8);

    if (assets.length < 2) {
      return jsonSuccess({
        configured: true,
        windowDays: days,
        assets,
        matrix: [],
        clusters: [],
        warning: "Correlation needs at least two traded assets.",
        updatedAt: Date.now(),
      });
    }

    const priceResult = await getResearchDailyPrices({ info, assets, days, marketType: "perp" });
    const pricesByAsset = groupPricesByAsset(priceResult.prices);
    const matrix = computeCorrelationMatrix({ assets, pricesByAsset, minSamples: 30 });
    const clusters = buildClusters({ matrix, exposures });
    const warning =
      clusters.length > 0
        ? "Some open positions are moving as one risk bucket. Size them like correlated exposure, not separate bets."
        : null;

    return jsonSuccess({
      configured: priceResult.configured,
      windowDays: days,
      assets,
      matrix,
      clusters,
      warning,
      updatedAt: Date.now(),
    });
  } catch (error) {
    logServerError("api/portfolio/correlations", error);
    return jsonSuccess({
      configured: false,
      windowDays: days,
      assets: [],
      matrix: [],
      clusters: [],
      warning: "Correlation research is unavailable right now.",
      updatedAt: Date.now(),
    });
  }
}
