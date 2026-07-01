import { NextRequest } from "next/server";
import { buildWhaleLeaderboard, parseWhaleAddressList } from "@/lib/whaleAnalytics";
import { resolveNetworkFromRequest } from "@/lib/hyperliquid";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-whales-leaderboard",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const queryAddresses = parseWhaleAddressList(req.nextUrl.searchParams.get("addresses"));
  const rawAddresses = req.nextUrl.searchParams.get("addresses");
  if (rawAddresses && queryAddresses.length === 0) {
    return jsonError("Pass one or more valid wallet addresses.", { status: 400 });
  }

  try {
    const result = await buildWhaleLeaderboard({
      network: resolveNetworkFromRequest(req.nextUrl),
      queryAddresses,
    });
    return jsonSuccess(result, { cache: result.partial ? "private-no-store" : "public-market" });
  } catch (error) {
    logServerError("api/whales/leaderboard", error);
    return jsonError("Unable to fetch whale leaderboard right now.", { status: 502 });
  }
}
