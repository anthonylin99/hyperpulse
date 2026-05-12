import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { listVaultSummaries } from "@/lib/vaults";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-vaults-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const items = await listVaultSummaries(resolveNetworkFromRequest(req.nextUrl));
    return jsonSuccess({ vaults: items }, { cache: "public-market" });
  } catch (err) {
    logServerError("api/vaults", err);
    return jsonError("Unable to fetch vaults right now.", { status: 502 });
  }
}
