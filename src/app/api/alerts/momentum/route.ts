import { NextRequest } from "next/server";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { listMomentumAlerts, getMomentumWorkerStatus } from "@/lib/momentumAlerts";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";

function parseCurrentPrices(data: unknown): Map<string, number> {
  const [meta, assetCtxs] = data as [
    { universe?: Array<{ name: string; isDelisted?: boolean }> },
    Array<Record<string, string | number | undefined>>,
  ];
  const prices = new Map<string, number>();
  if (!Array.isArray(meta?.universe) || !Array.isArray(assetCtxs)) return prices;

  meta.universe.forEach((asset, index) => {
    if (!asset?.name || asset.isDelisted) return;
    const mark = Number(assetCtxs[index]?.markPx);
    if (Number.isFinite(mark) && mark > 0) prices.set(asset.name.toUpperCase(), mark);
  });
  return prices;
}

function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-alerts-momentum",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 100);
    const alerts = await listMomentumAlerts(limit);
    if (alerts.length === 0) {
      return jsonSuccess({
        alerts: [],
        generatedAt: Date.now(),
        worker: await getMomentumWorkerStatus(),
        source: "momentum-alert-events",
      });
    }
    const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
    const currentPrices = parseCurrentPrices(await info.metaAndAssetCtxs());
    const enriched = alerts.map((alert) => {
      const currentPrice = currentPrices.get(alert.asset.toUpperCase()) ?? null;
      return {
        ...alert,
        currentPrice,
        returnSinceAlertPct: pctChange(currentPrice, alert.alertPrice),
      };
    });

    return jsonSuccess({
      alerts: enriched,
      generatedAt: Date.now(),
      worker: await getMomentumWorkerStatus(),
      source: "momentum-alert-events",
    });
  } catch (error) {
    logServerError("api/alerts/momentum", error);
    return jsonError("Unable to load momentum alerts right now.", { status: 502 });
  }
}
