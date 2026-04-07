import { NextRequest } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseTimestamp,
  validateAddress,
} from "@/lib/security";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-user-funding",
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
  const endTime = parseTimestamp(req.nextUrl.searchParams.get("endTime"), {
    min: 1,
    max: now,
    fallback: now,
  });

  if (startTime != null && endTime != null) {
    const valid = enforceTimeRange({
      startTime,
      endTime,
      maxLookbackMs: 90 * 24 * 60 * 60 * 1000,
    });
    if (!valid) {
      return jsonError("Requested history window is not allowed.", { status: 400 });
    }
  }

  try {
    const funding = await info.userFunding({
      user: address as `0x${string}`,
      startTime: startTime ?? undefined,
      endTime: endTime ?? undefined,
    });
    return jsonSuccess(funding);
  } catch (err) {
    logServerError("api/user/funding", err);
    return jsonError("Unable to fetch wallet funding right now.", { status: 502 });
  }
}
