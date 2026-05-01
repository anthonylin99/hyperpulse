import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  parseInterval,
  validateMarketCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { calculateSupportResistanceLevels, type ChartInterval } from "@/lib/supportResistance";
import { listTrackedWhaleProfiles } from "@/lib/whaleStore";

export const dynamic = "force-dynamic";

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};
const DEFAULT_RANGE = "3d";
const DEFAULT_INTERVAL_BY_RANGE: Record<string, "5m" | "15m" | "1h"> = {
  "24h": "5m",
  "3d": "15m",
  "7d": "1h",
};
const MAX_DISTANCE_PCT = 18;
const TRACKED_BUCKET_STEP_PCT = 0.25;
const BOOK_BUCKET_STEP_PCT = 0.1;
const MIN_BOOK_DISTANCE_PCT = 0.25;
const TRACKED_PROFILE_LIMIT = 750;
const TRACKED_PNL_FLOOR_USD = 200_000;
const BOOK_BAND_LIMIT_PER_SIDE = 18;
const STRUCTURE_LEVEL_LIMIT_PER_SIDE = 4;

type LiquidityBandSide = "short_liq" | "long_liq" | "ask_liquidity" | "bid_liquidity" | "structure_resistance" | "structure_support";
type LiquidityBandSource = "tracked_liquidation" | "visible_orderbook" | "price_structure";

type LiquidityBand = {
  price: number;
  lowPrice: number;
  highPrice: number;
  notionalUsd: number;
  walletCount: number;
  orderCount: number;
  distancePct: number;
  side: LiquidityBandSide;
  source: LiquidityBandSource;
  confidence: "high" | "medium" | "low";
  strength?: number;
  touches?: number;
};

function parseRange(value: string | null) {
  return value && value in RANGE_MS ? value : DEFAULT_RANGE;
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function quantizeDistance(value: number, step: number) {
  const rounded = roundToStep(value, step);
  if (value > 0 && rounded <= 0) return step;
  if (value < 0 && rounded >= 0) return -step;
  return rounded;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildBandPrices(currentPrice: number, distancePct: number, stepPct: number) {
  const halfStep = stepPct / 2;
  return {
    price: currentPrice * (1 + distancePct / 100),
    lowPrice: currentPrice * (1 + (distancePct - halfStep) / 100),
    highPrice: currentPrice * (1 + (distancePct + halfStep) / 100),
  };
}

function addBand(map: Map<string, LiquidityBand>, band: LiquidityBand) {
  const key = `${band.source}:${band.side}:${band.distancePct.toFixed(3)}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, band);
    return;
  }
  existing.notionalUsd += band.notionalUsd;
  existing.walletCount += band.walletCount;
  existing.orderCount += band.orderCount;
  existing.lowPrice = Math.min(existing.lowPrice, band.lowPrice);
  existing.highPrice = Math.max(existing.highPrice, band.highPrice);
}

function confidenceForTracked(notionalUsd: number) {
  if (notionalUsd >= 2_000_000) return "high" as const;
  if (notionalUsd >= 500_000) return "medium" as const;
  return "low" as const;
}

function confidenceForBook(notionalUsd: number) {
  if (notionalUsd >= 5_000_000) return "medium" as const;
  return "low" as const;
}

function structureSizing(strength: number, touches: number) {
  return Math.max(500_000, (Math.max(strength, 1) + Math.max(touches, 1)) * 650_000);
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-liquidity-map",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const coin = validateMarketCoin(url.searchParams.get("coin"));
  const range = parseRange(url.searchParams.get("range"));
  const interval = parseInterval(url.searchParams.get("interval"), DEFAULT_INTERVAL_BY_RANGE[range]);

  if (!coin || coin.includes(":")) {
    return jsonError("A valid Hyperliquid perp coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  try {
    const info = getInfoClient(resolveNetworkFromRequest(url));
    const endTime = Date.now();
    const startTime = endTime - RANGE_MS[range];

    const [candlesRaw, book, profiles] = await Promise.all([
      info.candleSnapshot({ coin, interval, startTime, endTime }),
      info.l2Book({ coin, nSigFigs: 5 }).catch(() => null),
      listTrackedWhaleProfiles(TRACKED_PROFILE_LIMIT).catch(() => []),
    ]);

    const candles = candlesRaw
      .map((candle) => ({
        time: Number(candle.t),
        open: Number(candle.o),
        high: Number(candle.h),
        low: Number(candle.l),
        close: Number(candle.c),
        volume: Number(candle.v),
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
          candle.close > 0,
      );

    const currentPrice = candles[candles.length - 1]?.close ?? null;
    if (!currentPrice) {
      return jsonError("No candle history is available for this market right now.", {
        status: 404,
        cache: "public-market",
      });
    }

    const bandsByKey = new Map<string, LiquidityBand>();
    const qualifyingProfiles = profiles.filter((profile) => profile.realizedPnl30d >= TRACKED_PNL_FLOOR_USD);

    for (const profile of qualifyingProfiles) {
      for (const position of profile.positions ?? []) {
        if (position.marketType !== "crypto_perp" || position.coin !== coin) continue;
        if (position.notionalUsd <= 0 || position.liquidationPx == null) continue;
        const liquidationPx = finiteNumber(position.liquidationPx);
        if (liquidationPx == null || liquidationPx <= 0) continue;
        const rawDistancePct = ((liquidationPx - currentPrice) / currentPrice) * 100;
        if (!Number.isFinite(rawDistancePct) || Math.abs(rawDistancePct) > MAX_DISTANCE_PCT) continue;
        const isShort = position.side === "short";
        if (isShort && rawDistancePct <= 0) continue;
        if (!isShort && rawDistancePct >= 0) continue;
        const distancePct = quantizeDistance(rawDistancePct, TRACKED_BUCKET_STEP_PCT);
        const prices = buildBandPrices(currentPrice, distancePct, TRACKED_BUCKET_STEP_PCT);
        addBand(bandsByKey, {
          ...prices,
          notionalUsd: position.notionalUsd,
          walletCount: 1,
          orderCount: 0,
          distancePct,
          side: isShort ? "short_liq" : "long_liq",
          source: "tracked_liquidation",
          confidence: confidenceForTracked(position.notionalUsd),
        });
      }
    }

    if (book) {
      const [bids, asks] = book.levels;
      for (const [side, levels] of [
        ["bid_liquidity", bids] as const,
        ["ask_liquidity", asks] as const,
      ]) {
        for (const level of levels.slice(0, BOOK_BAND_LIMIT_PER_SIDE)) {
          const price = finiteNumber(level.px);
          const size = finiteNumber(level.sz);
          if (price == null || size == null || price <= 0 || size <= 0) continue;
          const rawDistancePct = ((price - currentPrice) / currentPrice) * 100;
          if (!Number.isFinite(rawDistancePct) || Math.abs(rawDistancePct) > MAX_DISTANCE_PCT) continue;
          if (Math.abs(rawDistancePct) < MIN_BOOK_DISTANCE_PCT) continue;
          if (side === "bid_liquidity" && rawDistancePct >= 0) continue;
          if (side === "ask_liquidity" && rawDistancePct <= 0) continue;
          const distancePct = quantizeDistance(rawDistancePct, BOOK_BUCKET_STEP_PCT);
          const prices = buildBandPrices(currentPrice, distancePct, BOOK_BUCKET_STEP_PCT);
          const notionalUsd = price * size;
          addBand(bandsByKey, {
            ...prices,
            notionalUsd,
            walletCount: 0,
            orderCount: Number(level.n) || 1,
            distancePct,
            side,
            source: "visible_orderbook",
            confidence: confidenceForBook(notionalUsd),
          });
        }
      }
    }

    const structureLevels = calculateSupportResistanceLevels(candles, interval as ChartInterval)
      .filter((level) => level.status !== "expired" && level.status !== "broken")
      .filter((level) => Math.abs(level.distancePct ?? 0) <= MAX_DISTANCE_PCT)
      .sort((a, b) => Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity));

    for (const kind of ["support", "resistance"] as const) {
      for (const level of structureLevels.filter((item) => item.kind === kind).slice(0, STRUCTURE_LEVEL_LIMIT_PER_SIDE)) {
        const distancePct = level.distancePct ?? ((level.price - currentPrice) / currentPrice) * 100;
        if (kind === "support" && distancePct >= 0) continue;
        if (kind === "resistance" && distancePct <= 0) continue;
        const zoneLow = level.zoneLow ?? level.price * 0.999;
        const zoneHigh = level.zoneHigh ?? level.price * 1.001;
        const strength = Number(level.strength) || 1;
        const touches = Number(level.touches) || 1;
        addBand(bandsByKey, {
          price: level.price,
          lowPrice: Math.min(zoneLow, zoneHigh),
          highPrice: Math.max(zoneLow, zoneHigh),
          notionalUsd: structureSizing(strength, touches),
          walletCount: 0,
          orderCount: 0,
          distancePct,
          side: kind === "support" ? "structure_support" : "structure_resistance",
          source: "price_structure",
          confidence: level.confidence ?? "low",
          strength,
          touches,
        });
      }
    }

    const bands = Array.from(bandsByKey.values()).sort((a, b) => {
      if (a.source !== b.source) {
        const rank: Record<LiquidityBandSource, number> = {
          tracked_liquidation: 0,
          price_structure: 1,
          visible_orderbook: 2,
        };
        return rank[a.source] - rank[b.source];
      }
      return Math.abs(a.distancePct) - Math.abs(b.distancePct);
    });

    const summary = bands.reduce(
      (acc, band) => {
        if (band.side === "short_liq") acc.shortLiquidationUsd += band.notionalUsd;
        if (band.side === "long_liq") acc.longLiquidationUsd += band.notionalUsd;
        if (band.side === "ask_liquidity") acc.askLiquidityUsd += band.notionalUsd;
        if (band.side === "bid_liquidity") acc.bidLiquidityUsd += band.notionalUsd;
        if (band.source === "tracked_liquidation") acc.trackedBandCount += 1;
        if (band.source === "visible_orderbook") acc.bookBandCount += 1;
        return acc;
      },
      {
        shortLiquidationUsd: 0,
        longLiquidationUsd: 0,
        askLiquidityUsd: 0,
        bidLiquidityUsd: 0,
        trackedBandCount: 0,
        bookBandCount: 0,
      },
    );

    const source = summary.trackedBandCount > 0 ? "tracked-liquidations-plus-book" : "visible-orderbook-only";
    const caveat =
      summary.trackedBandCount > 0
        ? "Tracked liquidation bands come from monitored profitable wallets; visible book bands come from current Hyperliquid L2 depth. This is not a full exchange-wide Coinglass map."
        : "No monitored-wallet liquidation bands are available for this asset right now, so this view shows visible Hyperliquid order-book liquidity only. This is not a liquidation heatmap.";

    return jsonSuccess(
      {
        coin,
        range,
        interval,
        currentPrice,
        generatedAt: endTime,
        candleCount: candles.length,
        candles,
        bands,
        maxDistancePct: MAX_DISTANCE_PCT,
        source,
        caveat,
        summary: {
          ...summary,
          trackedWallets: qualifyingProfiles.length,
          currentPrice,
        },
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/market/liquidity-map", error);
    return jsonError("Unable to build liquidity map right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
