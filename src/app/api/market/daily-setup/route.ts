import { buildDailySetupSnapshot } from "@/lib/dailySetup";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-daily-setup",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
    const snapshot = await buildDailySetupSnapshot(info);
    return jsonSuccess(snapshot, { cache: "public-market" });
  } catch (error) {
    logServerError("api/market/daily-setup", error);
    return jsonError("Unable to build daily setup right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
