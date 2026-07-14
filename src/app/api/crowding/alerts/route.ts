import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { buildCrowdingDeskPayload } from "@/lib/crowdingDesk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-crowding-alerts",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const network = resolveNetworkFromRequest(new URL(request.url));
    const payload = await buildCrowdingDeskPayload(network);
    return jsonSuccess(payload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/crowding/alerts", error);
    return jsonError("Unable to build positioning stress alerts right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
