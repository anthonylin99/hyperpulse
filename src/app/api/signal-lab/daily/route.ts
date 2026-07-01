import { buildDailySetupSnapshot, buildSignalLabSnapshot } from "@/lib/dailySetup";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-signal-lab-daily",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
    const snapshot = await buildDailySetupSnapshot(info);
    return jsonSuccess(
      {
        generatedAt: Date.now(),
        lab: buildSignalLabSnapshot(snapshot),
        note: "Browser freezes the first setup it sees each day.",
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/signal-lab/daily", error);
    return jsonError("Unable to build Signal Lab snapshot right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
