import { NextRequest } from "next/server";
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
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-user-candles",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const coin = validateCoin(req.nextUrl.searchParams.get("coin"));
  if (!coin) {
    return jsonError("A valid coin is required.", { status: 400 });
  }

  const now = Date.now();
  const interval = parseInterval(req.nextUrl.searchParams.get("interval"), "1h");
  const startTime = parseTimestamp(req.nextUrl.searchParams.get("startTime"), {
    fallback: now - 7 * 24 * 60 * 60 * 1000,
    min: 1,
    max: now,
  });
  const endTime = parseTimestamp(req.nextUrl.searchParams.get("endTime"), {
    fallback: now,
    min: 1,
    max: now,
  });

  if (startTime == null || endTime == null) {
    return jsonError("A valid time range is required.", { status: 400 });
  }

  if (
    !enforceTimeRange({
      startTime,
      endTime,
      maxLookbackMs: 90 * 24 * 60 * 60 * 1000,
    })
  ) {
    return jsonError("Requested candle range is not allowed.", { status: 400 });
  }

  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  try {
    const candles = await info.candleSnapshot({
      coin,
      interval,
      startTime,
      endTime,
    });
    return jsonSuccess(candles);
  } catch (err) {
    logServerError("api/user/candles", err);
    return jsonError("Unable to fetch historical candles right now.", { status: 502 });
  }
}
