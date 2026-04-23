import { NextRequest } from "next/server";
import { enforceRateLimit, jsonError, jsonSuccess, validateCoin } from "@/lib/security";
import { isWhalesEnabled } from "@/lib/appConfig";
import {
  getWhaleWorkerStatus,
  isWhaleStoreConfigured,
  listPositioningAlerts,
  listPositioningDigests,
} from "@/lib/whaleStore";
import type { PositioningAlertType, PositioningRegime, WhaleSeverity } from "@/types";

const TIMEFRAME_TO_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isWhalesEnabled()) {
    return jsonError("Not found.", { status: 404 });
  }
  const limited = enforceRateLimit(req, {
    key: "api-whales-feed",
    limit: 45,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const severity = req.nextUrl.searchParams.get("severity");
  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "24h";
  const asset = validateCoin(req.nextUrl.searchParams.get("coin"));
  const alertType = req.nextUrl.searchParams.get("alertType");
  const regime = req.nextUrl.searchParams.get("regime");
  const cursorRaw = req.nextUrl.searchParams.get("cursor");
  const cursor = cursorRaw ? Number(cursorRaw) : null;
  if (cursorRaw && !Number.isFinite(cursor)) {
    return jsonError("Invalid cursor.", { status: 400 });
  }

  const alerts = await listPositioningAlerts({
    severity,
    asset,
    alertType: alertType as PositioningAlertType | "all" | null,
    regime: regime as PositioningRegime | "all" | null,
    timeframeMs: TIMEFRAME_TO_MS[timeframe] ?? TIMEFRAME_TO_MS["24h"],
    cursor,
    limit: 40,
  });
  const digests = await listPositioningDigests(8);
  const workerStatus = await getWhaleWorkerStatus();
  const uniqueAssets = new Set(alerts.map((alert) => alert.asset)).size;
  const topSeverity = alerts.reduce((best, alert) => {
    const rank = { low: 1, medium: 2, high: 3 } satisfies Record<WhaleSeverity, number>;
    return rank[alert.severity] > rank[best] ? alert.severity : best;
  }, "low" as WhaleSeverity);

  return jsonSuccess({
    alerts,
    digests,
    nextCursor: alerts.length > 0 ? alerts[alerts.length - 1].timestamp : null,
    summary: {
      alertCount: alerts.length,
      uniqueAssets,
      crowdingCount: alerts.filter((alert) => alert.alertType === "crowding").length,
      liquidationCount: alerts.filter((alert) => alert.alertType === "liquidation_pressure").length,
      whaleCount: alerts.filter((alert) => alert.alertType === "high_conviction_whale").length,
      highSeverityCount: alerts.filter((alert) => alert.severity === "high").length,
      topSeverity,
    },
    workerConfigured: isWhaleStoreConfigured(),
    workerStatus,
  });
}
