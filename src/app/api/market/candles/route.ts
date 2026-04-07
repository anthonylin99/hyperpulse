import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseInterval,
  parseTimestamp,
  validateCoin,
} from "@/lib/security";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-candles",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const coin = validateCoin(searchParams.get("coin"));
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
      maxLookbackMs: 30 * 24 * 60 * 60 * 1000,
    })
  ) {
    return jsonError("Requested candle range is not allowed.", {
      status: 400,
      cache: "public-market",
    });
  }

  try {
    const data = await info.candleSnapshot({
      coin,
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
