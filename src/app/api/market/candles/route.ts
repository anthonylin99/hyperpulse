import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseInterval,
  parseTimestamp,
  validateMarketCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { resolveSpotCoinForCandles } from "@/lib/spotMarkets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-candles",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const coin = validateMarketCoin(searchParams.get("coin"));
  const marketType = searchParams.get("marketType") || "perp";
  const interval = parseInterval(searchParams.get("interval"), "1h");
  const now = Date.now();
  const startTime = parseTimestamp(searchParams.get("startTime"), {
    min: 1,
    max: now,
  });
  const endTime = parseTimestamp(searchParams.get("endTime"), {
    min: 1,
    max: now,
    fallback: now,
  });

  if (!coin || startTime == null || endTime == null) {
    return jsonError("Valid coin and time range are required.", {
      status: 400,
      cache: "public-market",
    });
  }

  if (
    !enforceTimeRange({
      startTime,
      endTime,
      maxLookbackMs: 120 * 24 * 60 * 60 * 1000,
    })
  ) {
    return jsonError("Requested candle range is not allowed.", {
      status: 400,
      cache: "public-market",
    });
  }

  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
  try {
    const resolvedCoin =
      marketType === "spot" ? await resolveSpotCoinForCandles(info, coin) : coin;

    const data = await info.candleSnapshot({
      coin: resolvedCoin,
      interval,
      startTime,
      endTime,
    });
    return jsonSuccess(data, { cache: "public-market" });
  } catch (err) {
    logServerError("api/market/candles", err);
    return jsonError("Unable to fetch market candles right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
