import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseBoolean,
  parseTimestamp,
  validateAddress,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-user-fills",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const now = Date.now();
  const startTime = parseTimestamp(req.nextUrl.searchParams.get("startTime"), {
    min: 1,
    max: now,
  });
  const aggregateByTime = parseBoolean(
    req.nextUrl.searchParams.get("aggregateByTime"),
  );

  if (
    startTime != null &&
    !enforceTimeRange({
      startTime,
      endTime: now,
      maxLookbackMs: 90 * 24 * 60 * 60 * 1000,
    })
  ) {
    return jsonError("Requested history window is not allowed.", { status: 400 });
  }

  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  try {
    let fills;
    if (startTime) {
      fills = await info.userFillsByTime({
        user: address as `0x${string}`,
        startTime: Number(startTime),
        aggregateByTime,
      });

      // Fallback: if historical query returns empty, try recent fills.
      if (Array.isArray(fills) && fills.length === 0) {
        const recent = await info.userFills({
          user: address as `0x${string}`,
          aggregateByTime,
        });
        if (Array.isArray(recent) && recent.length > 0) {
          fills = recent;
        } else if (aggregateByTime) {
          // Last fallback: disable aggregation in case of API mismatch.
          const raw = await info.userFills({
            user: address as `0x${string}`,
            aggregateByTime: false,
          });
          fills = raw;
        }
      }
    } else {
      fills = await info.userFills({
        user: address as `0x${string}`,
        aggregateByTime,
      });
    }
    return jsonSuccess(fills);
  } catch (err) {
    logServerError("api/user/fills", err);
    return jsonError("Unable to fetch wallet fills right now.", { status: 502 });
  }
}
