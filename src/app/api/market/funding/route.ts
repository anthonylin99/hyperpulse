import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseTimestamp,
  validateCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-funding",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const coin = validateCoin(searchParams.get("coin"));
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
    return jsonError("Valid coin, startTime, and endTime are required.", {
      status: 400,
      cache: "public-market",
    });
  }

  if (
    !enforceTimeRange({
      startTime,
      endTime,
      maxLookbackMs: 90 * 24 * 60 * 60 * 1000,
    })
  ) {
    return jsonError("Requested funding range is not allowed.", {
      status: 400,
      cache: "public-market",
    });
  }

  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
  try {
    const data = await info.fundingHistory({
      coin,
      startTime,
      endTime,
    });
    return jsonSuccess(data, { cache: "public-market" });
  } catch (err) {
    logServerError("api/market/funding", err);
    return jsonError("Unable to fetch funding history right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
