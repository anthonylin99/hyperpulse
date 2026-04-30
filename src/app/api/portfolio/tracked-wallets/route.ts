import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";
import { isResearchStoreConfigured, upsertTrackedWallet } from "@/lib/researchStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-portfolio-tracked-wallets",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = validateAddress(body?.address ?? null);
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  if (!isResearchStoreConfigured()) {
    return jsonSuccess({
      configured: false,
      tracked: false,
      updatedAt: Date.now(),
    });
  }

  try {
    const tracked = await upsertTrackedWallet({
      walletAddress: address,
      source: "portfolio",
      status: "active",
    });

    return jsonSuccess({
      configured: true,
      tracked,
      updatedAt: Date.now(),
    });
  } catch (error) {
    logServerError("api/portfolio/tracked-wallets", error);
    return jsonSuccess({
      configured: true,
      tracked: false,
      unavailable: true,
      updatedAt: Date.now(),
    });
  }
}
