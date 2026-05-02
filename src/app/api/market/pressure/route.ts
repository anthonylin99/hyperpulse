import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import {
  buildMarketInferredLfxLevels,
  calculateLeverageMultiplier,
  calculateMarketPressureScore,
  classifyLfxZone,
  dominantPressureLevel,
  isLfxMajorCoin,
  nearestPressureLevel,
  strongestPressureLevel,
  type LfxBookDepth,
} from "@/lib/pressureLevels";
import { listTrackedLiquidationBuckets } from "@/lib/whaleStore";
import type { PressureBatchPayload, PressureLevel, PressurePayload, TrackedLiquidationBucket } from "@/types";

export const dynamic = "force-dynamic";

type MetaAsset = {
  name?: string;
  isDelisted?: boolean;
  maxLeverage?: number;
};

type AssetContext = {
  markPx?: string | number;
  midPx?: string | number;
  oraclePx?: string | number;
  funding?: string | number;
  openInterest?: string | number;
};

type MetaAndAssetContexts = [
  {
    universe?: MetaAsset[];
  },
  AssetContext[],
];

type BookLevel = {
  px?: string | number;
  sz?: string | number;
};

type L2Book = {
  levels?: [BookLevel[], BookLevel[]];
};

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositive(...values: Array<unknown>): number | null {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function sumVisibleDepthUsd(levels: BookLevel[] | undefined): number | null {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const total = levels.slice(0, 10).reduce((sum, level) => {
    const price = parseNumber(level.px);
    const size = parseNumber(level.sz);
    if (price == null || size == null || price <= 0 || size <= 0) return sum;
    return sum + price * size;
  }, 0);
  return total > 0 ? Math.round(total) : null;
}

function calculateBookImbalancePct(bidDepthUsd: number | null, askDepthUsd: number | null): number | null {
  if (bidDepthUsd == null || askDepthUsd == null) return null;
  const total = bidDepthUsd + askDepthUsd;
  if (total <= 0) return null;
  return Number((((bidDepthUsd - askDepthUsd) / total) * 100).toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function confidenceForTrackedLevel(score: number, walletCount: number): PressureLevel["confidence"] {
  if (score >= 70 && walletCount >= 5) return "high";
  if (score >= 38 && walletCount >= 2) return "medium";
  return "low";
}

function trackedBucketToPressureLevel(bucket: TrackedLiquidationBucket, rank: number): PressureLevel {
  const absDistancePct = Math.abs(bucket.distancePct);
  const weightedLeverage = bucket.weightedAvgLeverage ?? 1;
  const leverageMultiplier = calculateLeverageMultiplier(weightedLeverage);
  const distanceDecay = Number(clamp(Math.exp(-absDistancePct / 6), 0.14, 1).toFixed(4));
  const volatilityReach = Number(clamp(1 / (1 + absDistancePct / 4), 0.12, 1).toFixed(4));
  const notionalTerm = clamp(Math.log10(bucket.totalNotionalUsd / 500_000 + 1) * 28, 5, 58);
  const walletTerm = clamp(Math.log10(bucket.walletCount + 1) * 16, 0, 24);
  const leverageTerm = clamp(leverageMultiplier * 6, 4, 22);
  const lfxScore = Math.round(clamp((notionalTerm + walletTerm + leverageTerm) * distanceDecay * volatilityReach, 1, 100));
  const flowSide = bucket.side === "long_liq" ? "forced_sell" : "forced_buy";
  const zoneType = classifyLfxZone({
    flowSide,
    depthAdjustedImpact: null,
    volatilityReach,
    absDistancePct,
  });
  const sideLabel = bucket.side === "long_liq" ? "long" : "short";
  const directionLabel = bucket.side === "long_liq" ? "below" : "above";

  return {
    id: `${bucket.asset}-${bucket.side}-tracked-${bucket.price}`,
    price: bucket.price,
    side: bucket.side,
    source: "tracked_liquidation",
    distancePct: bucket.distancePct,
    notionalUsd: Math.round(bucket.totalNotionalUsd),
    weightedLeverage,
    leverageMultiplier,
    pressureScore: lfxScore,
    lfxScore,
    depthAdjustedImpact: null,
    volatilityReach,
    distanceDecay,
    flowSide,
    zoneType,
    coverage: "wallet_sample",
    explanation: `Tracked trader ${sideLabel} liquidation pocket ${directionLabel} price. This comes from our monitored-wallet sample, not the full exchange book.`,
    evidence: [
      `${bucket.walletCount} tracked wallets`,
      `${bucket.positionCount} open positions`,
      `$${Math.round(bucket.totalNotionalUsd).toLocaleString()} tracked notional`,
      weightedLeverage > 0 ? `${weightedLeverage.toFixed(1)}x avg lev` : "avg lev n/a",
    ],
    flowRank: rank,
    flowRelative: 1,
    leverageBucket: weightedLeverage > 0 ? `${weightedLeverage.toFixed(1)}x avg` : undefined,
    confidence: confidenceForTrackedLevel(lfxScore, bucket.walletCount),
    walletCount: bucket.walletCount,
  };
}

function trackedBucketsToPressureLevels(buckets: TrackedLiquidationBucket[]): PressureLevel[] {
  const rankedBySide = new Map<PressureLevel["side"], TrackedLiquidationBucket[]>();
  for (const side of ["long_liq", "short_liq"] as const) {
    rankedBySide.set(
      side,
      buckets
        .filter((bucket) => bucket.side === side)
        .sort((a, b) => b.totalNotionalUsd - a.totalNotionalUsd)
        .slice(0, 3),
    );
  }

  return [...rankedBySide.entries()].flatMap(([, sideBuckets]) =>
    sideBuckets.map((bucket, index) => trackedBucketToPressureLevel(bucket, index + 1)),
  );
}

function parseRequestedCoins(url: URL): string[] {
  const raw = url.searchParams.get("coins") ?? url.searchParams.get("coin") ?? "";
  const seen = new Set<string>();
  const coins: string[] = [];

  for (const part of raw.split(",")) {
    const coin = validateCoin(part);
    if (!coin || seen.has(coin)) continue;
    seen.add(coin);
    coins.push(coin);
    if (coins.length >= 24) break;
  }

  return coins;
}

function parseAtrPct(url: URL): number | null {
  const value = parseNumber(url.searchParams.get("atrPct"));
  if (value == null || value <= 0 || value > 100) return null;
  return value;
}

function normalizeBook(bookData: L2Book | null): LfxBookDepth | null {
  if (!bookData?.levels) return null;
  return {
    bids: bookData.levels[0],
    asks: bookData.levels[1],
  };
}

async function buildPressurePayload({
  coin,
  meta,
  assetContexts,
  bookData,
  atrPct,
}: {
  coin: string;
  meta: MetaAndAssetContexts[0];
  assetContexts: AssetContext[];
  bookData: L2Book | null;
  atrPct: number | null;
}): Promise<PressurePayload | null> {
  const assetIndex = (meta.universe ?? []).findIndex(
    (asset) => asset.name?.toUpperCase() === coin && asset.isDelisted !== true,
  );
  if (assetIndex < 0) return null;

  const asset = meta.universe?.[assetIndex] ?? {};
  const context = assetContexts[assetIndex] ?? {};
  const currentPrice = firstPositive(context.markPx, context.midPx, context.oraclePx);
  if (currentPrice == null) return null;

  const fundingRate = parseNumber(context.funding);
  const fundingAPR = fundingRate == null ? null : Number((fundingRate * 8760 * 100).toFixed(2));
  const openInterest = parseNumber(context.openInterest);
  const openInterestUsd =
    openInterest == null || openInterest <= 0 ? null : Math.round(openInterest * currentPrice);
  const maxLeverage = parseNumber(asset.maxLeverage);
  const bidDepthUsd = sumVisibleDepthUsd(bookData?.levels?.[0]);
  const askDepthUsd = sumVisibleDepthUsd(bookData?.levels?.[1]);
  const topBookImbalancePct = calculateBookImbalancePct(bidDepthUsd, askDepthUsd);
  const marketLevels = buildMarketInferredLfxLevels({
    coin,
    currentPrice,
    fundingAPR,
    openInterestUsd,
    maxLeverage,
    topBookImbalancePct,
    atrPct,
    book: normalizeBook(bookData),
  });
  const trackedBuckets = await listTrackedLiquidationBuckets(coin).catch((error: unknown) => {
    logServerError("api/market/pressure.tracked-buckets", error);
    return [] as TrackedLiquidationBucket[];
  });
  const trackedLevels = trackedBucketsToPressureLevels(trackedBuckets);
  const levels = [...trackedLevels, ...marketLevels];
  const longLiquidationNotionalUsd = levels
    .filter((level) => level.side === "long_liq")
    .reduce((sum, level) => sum + level.notionalUsd, 0);
  const shortLiquidationNotionalUsd = levels
    .filter((level) => level.side === "short_liq")
    .reduce((sum, level) => sum + level.notionalUsd, 0);
  const marketPressureScore = calculateMarketPressureScore({
    fundingAPR,
    openInterestUsd,
    maxLeverage,
    topBookImbalancePct,
  });

  return {
    coin,
    coverage: trackedLevels.length > 0 ? "wallet_sample" : "market_only",
    currentPrice,
    updatedAt: Date.now(),
    market: {
      fundingAPR,
      openInterestUsd,
      oiChangePct: null,
      maxLeverage,
      bidDepthUsd,
      askDepthUsd,
      topBookImbalancePct,
      pressureScore: marketPressureScore,
    },
    levels,
    summary: {
      nearestPressureLevel: nearestPressureLevel(levels),
      dominantPressureLevel: dominantPressureLevel(levels),
      strongestLongLiquidationLevel: strongestPressureLevel(levels, "long_liq", currentPrice),
      strongestShortLiquidationLevel: strongestPressureLevel(levels, "short_liq", currentPrice),
      longLiquidationNotionalUsd,
      shortLiquidationNotionalUsd,
      trackedWallets: Math.max(...trackedBuckets.map((bucket) => bucket.trackedWalletCount ?? bucket.walletCount), 0),
    },
  };
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-pressure",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const requestedCoins = parseRequestedCoins(url);
  const batchRequested = url.searchParams.has("coins");
  const atrPct = parseAtrPct(url);

  if (requestedCoins.length === 0) {
    return jsonError("At least one valid coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  const lfxCoins = requestedCoins.filter(isLfxMajorCoin);
  if (lfxCoins.length === 0) {
    if (batchRequested) {
      return jsonSuccess({ updatedAt: Date.now(), assets: {} } satisfies PressureBatchPayload, {
        cache: "public-market",
      });
    }
    return jsonError("LFX v1 covers BTC, ETH, SOL, HYPE.", {
      status: 400,
      cache: "public-market",
    });
  }

  const info = getInfoClient(resolveNetworkFromRequest(url));

  try {
    const [marketData, bookResults] = await Promise.all([
      info.metaAndAssetCtxs() as Promise<MetaAndAssetContexts>,
      Promise.all(
        lfxCoins.map((coin) =>
          info.l2Book({ coin }).catch((error: unknown) => {
            logServerError("api/market/pressure.orderbook", error);
            return null;
          }) as Promise<L2Book | null>,
        ),
      ),
    ]);

    const [meta, assetContexts] = marketData;
    const entries = await Promise.all(
      lfxCoins.map(async (coin, index) => {
        const payload = await buildPressurePayload({
          coin,
          meta,
          assetContexts,
          bookData: bookResults[index] ?? null,
          atrPct,
        });
        return [coin, payload] as const;
      }),
    );
    const assets = Object.fromEntries(
      entries.filter((entry): entry is readonly [string, PressurePayload] => entry[1] != null),
    );

    if (requestedCoins.length === 1 && !batchRequested) {
      const payload = assets[lfxCoins[0]];
      if (!payload) {
        return jsonError("Market not found or price is unavailable.", {
          status: 404,
          cache: "public-market",
        });
      }
      return jsonSuccess(payload, { cache: "public-market" });
    }

    const batchPayload: PressureBatchPayload = {
      updatedAt: Date.now(),
      assets,
    };

    return jsonSuccess(batchPayload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/market/pressure", error);
    return jsonError("Unable to fetch LFX context right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
