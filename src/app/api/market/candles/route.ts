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

const CANDLE_UPSTREAM_RETRIES = 2;
const CANDLE_UPSTREAM_RETRY_DELAY_MS = 250;

function normalizeCandleSnapshot(data: unknown): unknown {
  if (typeof data !== "string") return data;

  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : data;
  } catch {
    return data;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

    let data: unknown = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= CANDLE_UPSTREAM_RETRIES; attempt += 1) {
      try {
        data = await info.candleSnapshot({
          coin: resolvedCoin,
          interval,
          startTime,
          endTime,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === CANDLE_UPSTREAM_RETRIES) break;
        await wait(CANDLE_UPSTREAM_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    if (lastError) throw lastError;
    return jsonSuccess(normalizeCandleSnapshot(data), { cache: "public-market" });
  } catch (err) {
    logServerError("api/market/candles", err);
    return jsonError("Unable to fetch market candles right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
