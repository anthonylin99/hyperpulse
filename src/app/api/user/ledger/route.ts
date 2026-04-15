import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  enforceTimeRange,
  jsonError,
  jsonSuccess,
  logServerError,
  parseTimestamp,
  validateAddress,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-user-ledger",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const now = Date.now();
  const defaultStart = now - 90 * 24 * 60 * 60 * 1000;
  const startTime = parseTimestamp(req.nextUrl.searchParams.get("startTime"), {
    fallback: defaultStart,
    min: 1,
    max: now,
  });
  const endTime = parseTimestamp(req.nextUrl.searchParams.get("endTime"), {
    min: 1,
    max: now,
    fallback: now,
  });

  if (startTime == null || endTime == null) {
    return jsonError("A valid time range is required.", { status: 400 });
  }

  const valid = enforceTimeRange({
    startTime,
    endTime,
    maxLookbackMs: 90 * 24 * 60 * 60 * 1000,
  });
  if (!valid) {
    return jsonError("Requested history window is not allowed.", { status: 400 });
  }

  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  try {
    const params: Record<string, unknown> = {
      user: address as `0x${string}`,
      startTime,
    };
    params.endTime = endTime;

    const ledger = await info.userNonFundingLedgerUpdates(
      params as Parameters<typeof info.userNonFundingLedgerUpdates>[0],
    );
    return jsonSuccess(ledger);
  } catch (err) {
    logServerError("api/user/ledger", err);
    return jsonError("Unable to fetch wallet ledger right now.", { status: 502 });
  }
}
