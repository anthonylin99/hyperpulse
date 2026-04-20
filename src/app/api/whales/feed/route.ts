import { NextRequest } from "next/server";
import { enforceRateLimit, jsonError, jsonSuccess, validateCoin } from "@/lib/security";
import { getWhaleWorkerStatus, isWhaleStoreConfigured, listWhaleAlerts } from "@/lib/whaleStore";
import type { WhaleDirectionality } from "@/types";
import { severityRank } from "@/lib/whales";

const TIMEFRAME_TO_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-whales-feed",
    limit: 45,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const severity = req.nextUrl.searchParams.get("severity");
  const eventType = req.nextUrl.searchParams.get("eventType");
  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "24h";
  const coin = validateCoin(req.nextUrl.searchParams.get("coin"));
  const directionality = req.nextUrl.searchParams.get("directionality");
  const marketType = req.nextUrl.searchParams.get("marketType");
  const riskBucket = req.nextUrl.searchParams.get("riskBucket");
  const hip3Only = req.nextUrl.searchParams.get("hip3Only") === "true";
  const cursorRaw = req.nextUrl.searchParams.get("cursor");
  const cursor = cursorRaw ? Number(cursorRaw) : null;
  if (cursorRaw && !Number.isFinite(cursor)) {
    return jsonError("Invalid cursor.", { status: 400 });
  }

  const alerts = await listWhaleAlerts({
    severity,
    coin,
    eventType,
    directionality: directionality as WhaleDirectionality | "all" | null,
    marketType,
    riskBucket,
    hip3Only,
    timeframeMs: TIMEFRAME_TO_MS[timeframe] ?? TIMEFRAME_TO_MS["24h"],
    cursor,
    limit: 40,
  });

  const workerStatus = await getWhaleWorkerStatus();
  const uniqueWallets = new Set(alerts.map((alert) => alert.address.toLowerCase())).size;
  const topSeverity = alerts.reduce((best, alert) => {
    return severityRank(alert.severity) > severityRank(best) ? alert.severity : best;
  }, "low" as "high" | "medium" | "low");

  return jsonSuccess({
    alerts,
    nextCursor: alerts.length > 0 ? alerts[alerts.length - 1].timestamp : null,
    summary: {
      alertCount: alerts.length,
      uniqueWallets,
      depositLedCount: alerts.filter((alert) => alert.eventType.startsWith("deposit-led")).length,
      highSeverityCount: alerts.filter((alert) => alert.severity === "high").length,
      directionalCount: alerts.filter((alert) => alert.directionality === "directional_entry" || alert.directionality === "directional_add").length,
      hedgeCount: alerts.filter((alert) => alert.directionality === "hedge" || alert.directionality === "rotation").length,
      hip3Count: alerts.filter((alert) => alert.marketType === "hip3_spot").length,
      topSeverity,
    },
    workerConfigured: isWhaleStoreConfigured(),
    workerStatus,
  });
}
