import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";
import { isResearchStoreConfigured, listSizingSnapshots } from "@/lib/researchStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDays(value: string | null): number {
  const parsed = Number(value ?? 365);
  if (!Number.isFinite(parsed)) return 365;
  return Math.min(Math.max(Math.round(parsed), 1), 730);
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-portfolio-sizing",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const days = parseDays(req.nextUrl.searchParams.get("days"));

  if (!isResearchStoreConfigured()) {
    return jsonSuccess({
      configured: false,
      snapshots: [],
      days,
      updatedAt: Date.now(),
    });
  }

  try {
    const snapshots = await listSizingSnapshots({ walletAddress: address, days });
    return jsonSuccess({
      configured: isResearchStoreConfigured(),
      snapshots,
      days,
      updatedAt: Date.now(),
    });
  } catch (error) {
    logServerError("api/portfolio/sizing", error);
    return jsonSuccess({
      configured: true,
      snapshots: [],
      days,
      unavailable: true,
      updatedAt: Date.now(),
    });
  }
}
