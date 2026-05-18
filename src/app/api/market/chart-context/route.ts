import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  parseInterval,
  validateMarketCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { calculatePivotLiquidityLevels } from "@/lib/pivotLiquidityLevels";
import { resolveSpotCoinForCandles } from "@/lib/spotMarkets";
import type { ChartInterval, LevelCandle } from "@/lib/supportResistance";

export const dynamic = "force-dynamic";

const LOOKBACK_MS: Record<ChartInterval, number> = {
  "5m": 2 * 24 * 60 * 60 * 1000,
  "15m": 5 * 24 * 60 * 60 * 1000,
  "1h": 30 * 24 * 60 * 60 * 1000,
  "4h": 90 * 24 * 60 * 60 * 1000,
  "1d": 119 * 24 * 60 * 60 * 1000,
};

function normalizeCandleSnapshot(data: unknown): unknown {
  if (typeof data !== "string") return data;

  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : data;
  } catch {
    return data;
  }
}

function parseMarketType(value: string | null): "perp" | "spot" {
  return value === "spot" ? "spot" : "perp";
}

function parseChartInterval(value: string | null): ChartInterval {
  const interval = parseInterval(value, "4h");
  return interval in LOOKBACK_MS ? (interval as ChartInterval) : "4h";
}

function toCandleRows(data: unknown): LevelCandle[] {
  if (!Array.isArray(data)) return [];

  return data
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
    .sort((a, b) => {
      const aTime = a.time > 10_000_000_000 ? a.time : a.time * 1000;
      const bTime = b.time > 10_000_000_000 ? b.time : b.time * 1000;
      return aTime - bTime;
    });
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-chart-context",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const coin = validateMarketCoin(url.searchParams.get("coin"));
  const marketType = parseMarketType(url.searchParams.get("marketType"));
  const interval = parseChartInterval(url.searchParams.get("interval"));

  if (!coin) {
    return jsonError("A valid coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  const endTime = Date.now();
  const startTime = endTime - LOOKBACK_MS[interval];

  try {
    const info = getInfoClient(resolveNetworkFromRequest(url));
    const resolvedCoin =
      marketType === "spot" ? await resolveSpotCoinForCandles(info, coin) : coin;
    const rawCandles = await info.candleSnapshot({
      coin: resolvedCoin,
      interval,
      startTime,
      endTime,
    });
    const candles = toCandleRows(normalizeCandleSnapshot(rawCandles));

    if (candles.length === 0) {
      return jsonError("No price candles are available for this market right now.", {
        status: 404,
        cache: "public-market",
      });
    }

    const currentPrice = candles[candles.length - 1].close;
    const pivotLevels =
      marketType === "perp" ? calculatePivotLiquidityLevels(candles, interval) : [];

    return jsonSuccess(
      {
        coin,
        marketType,
        interval,
        startTime,
        endTime,
        currentPrice,
        candles,
        pivotLevels,
        generatedAt: endTime,
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/market/chart-context", error);
    return jsonError("Unable to build chart context right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
