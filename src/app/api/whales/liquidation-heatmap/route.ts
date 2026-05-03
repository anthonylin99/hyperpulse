import { NextRequest } from "next/server";
import { enforceRateLimit, jsonError, jsonSuccess, validateCoin } from "@/lib/security";
import { isWhalesEnabled } from "@/lib/appConfig";
import { listPositioningMarketSnapshots, listTrackedLiquidationBuckets, listTrackedWhaleProfiles } from "@/lib/whaleStore";

export const dynamic = "force-dynamic";

const MAJOR_ASSETS = ["BTC", "ETH", "SOL", "HYPE", "AAVE"] as const;
const MAX_DISTANCE_PCT = 25;
const BUCKET_STEP_PCT = 0.5;
const SNAPSHOT_LIMIT = 288;

type HeatmapBand = {
  price: number;
  notionalUsd: number;
  walletCount: number;
  positionCount: number;
  weightedAvgLeverage: number | null;
  marginUsd: number | null;
  distancePct: number;
  side: "short_liq" | "long_liq";
  source: "tracked_wallet_sample" | "profile_fallback";
};

function roundBucket(distancePct: number) {
  return Math.round(distancePct / BUCKET_STEP_PCT) * BUCKET_STEP_PCT;
}

export async function GET(req: NextRequest) {
  if (!isWhalesEnabled()) {
    return jsonError("Not found.", { status: 404 });
  }
  const limited = enforceRateLimit(req, {
    key: "api-whales-liquidation-heatmap",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const requestedCoin = validateCoin(req.nextUrl.searchParams.get("coin")) ?? "BTC";
  const coin = MAJOR_ASSETS.includes(requestedCoin as (typeof MAJOR_ASSETS)[number]) ? requestedCoin : "BTC";

  const [snapshots, profiles, storedBuckets] = await Promise.all([
    listPositioningMarketSnapshots(coin, SNAPSHOT_LIMIT),
    listTrackedWhaleProfiles(750),
    listTrackedLiquidationBuckets(coin, 180),
  ]);

  const priceSeries = [...snapshots]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((snapshot) => ({
      time: snapshot.timestamp,
      price: snapshot.price,
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0);

  const currentPrice = priceSeries[priceSeries.length - 1]?.price ?? null;
  if (!currentPrice) {
    return jsonSuccess({
      assets: [...MAJOR_ASSETS],
      selectedAsset: coin,
      currentPrice: null,
      updatedAt: null,
      windowHours: 24,
      maxDistancePct: MAX_DISTANCE_PCT,
      bucketStepPct: BUCKET_STEP_PCT,
      source: storedBuckets.length > 0 ? "stored_tracked_position_buckets" : "profile_fallback",
      priceSeries: [],
      bands: [],
      summary: {
        shortTotalNotionalUsd: 0,
        longTotalNotionalUsd: 0,
        nearestShortDistancePct: null,
        nearestLongDistancePct: null,
        trackedWallets: profiles.length,
      },
    });
  }

  let bands: HeatmapBand[] = storedBuckets
    .filter((bucket) => Math.abs(bucket.distancePct) <= MAX_DISTANCE_PCT)
    .map((bucket) => ({
      price: bucket.price,
      notionalUsd: bucket.totalNotionalUsd,
      walletCount: bucket.walletCount,
      positionCount: bucket.positionCount,
      weightedAvgLeverage: bucket.weightedAvgLeverage,
      marginUsd: bucket.marginUsd,
      distancePct: bucket.distancePct,
      side: bucket.side,
      source: bucket.source,
    }))
    .sort((a, b) => b.price - a.price);

  if (bands.length === 0) {
    const shortBands = new Map<number, HeatmapBand>();
    const longBands = new Map<number, HeatmapBand>();

    for (const profile of profiles) {
      const matchingPositions = (profile.positions ?? []).filter(
        (position) =>
          position.marketType === "crypto_perp" &&
          position.coin === coin &&
          position.notionalUsd > 0 &&
          position.liquidationPx != null,
      );

      for (const position of matchingPositions) {
        const liqPrice = Number(position.liquidationPx);
        if (!Number.isFinite(liqPrice) || liqPrice <= 0) continue;
        const distancePct = ((liqPrice - currentPrice) / currentPrice) * 100;
        if (!Number.isFinite(distancePct) || Math.abs(distancePct) > MAX_DISTANCE_PCT) continue;

        const isShort = position.side === "short";
        if (isShort && distancePct <= 0) continue;
        if (!isShort && distancePct >= 0) continue;

        const bucketDistancePct = roundBucket(distancePct);
        const bucketPrice = currentPrice * (1 + bucketDistancePct / 100);
        const target = isShort ? shortBands : longBands;
        const existing = target.get(bucketDistancePct) ?? {
          price: bucketPrice,
          notionalUsd: 0,
          walletCount: 0,
          positionCount: 0,
          weightedAvgLeverage: null,
          marginUsd: null,
          distancePct: bucketDistancePct,
          side: isShort ? "short_liq" : "long_liq",
          source: "profile_fallback",
        };
        existing.notionalUsd += position.notionalUsd;
        existing.walletCount += 1;
        existing.positionCount += 1;
        target.set(bucketDistancePct, existing);
      }
    }

    bands = [...shortBands.values(), ...longBands.values()].sort((a, b) => b.price - a.price);
  }

  const shortBuckets = bands.filter((band) => band.side === "short_liq");
  const longBuckets = bands.filter((band) => band.side === "long_liq");
  const shortTotalNotionalUsd = shortBuckets.reduce((sum, band) => sum + band.notionalUsd, 0);
  const longTotalNotionalUsd = longBuckets.reduce((sum, band) => sum + band.notionalUsd, 0);
  const nearestShortDistancePct = shortBuckets.sort((a, b) => a.distancePct - b.distancePct)[0]?.distancePct ?? null;
  const nearestLongDistancePct = longBuckets.sort((a, b) => b.distancePct - a.distancePct)[0]?.distancePct ?? null;

  return jsonSuccess({
    assets: [...MAJOR_ASSETS],
    selectedAsset: coin,
    currentPrice,
    updatedAt: priceSeries[priceSeries.length - 1]?.time ?? null,
    windowHours: 24,
    maxDistancePct: MAX_DISTANCE_PCT,
    bucketStepPct: BUCKET_STEP_PCT,
    source: storedBuckets.length > 0 ? "stored_tracked_position_buckets" : "profile_fallback",
    priceSeries,
    bands,
    summary: {
      shortTotalNotionalUsd,
      longTotalNotionalUsd,
      nearestShortDistancePct,
      nearestLongDistancePct,
      trackedWallets: profiles.length,
    },
  });
}
