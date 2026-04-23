import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, jsonError, validateAddress, validateCoin } from "@/lib/security";
import { isWhalesEnabled } from "@/lib/appConfig";
import {
  getWhaleAlertsForAddress,
  getWhaleEpisodesForAddress,
  listPositioningAlerts,
  listPositioningDigests,
  listPositioningMarketSnapshots,
  listWhaleAlerts,
} from "@/lib/whaleStore";
import type { WhaleAlert } from "@/types";

const TIMEFRAME_TO_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function escapeCsv(value: string | number | null | undefined): string {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function csvResponse(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const body = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}

function applyViewFilter(alerts: WhaleAlert[], viewFilter: string | null) {
  if (viewFilter === "deposit") {
    return alerts.filter((alert) => alert.eventType.startsWith("deposit-led"));
  }
  if (viewFilter === "directional") {
    return alerts.filter(
      (alert) => alert.directionality === "directional_entry" || alert.directionality === "directional_add" || alert.eventType.startsWith("deposit-led"),
    );
  }
  if (viewFilter === "hedges") {
    return alerts.filter((alert) => alert.directionality === "hedge" || alert.directionality === "rotation");
  }
  return alerts;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isWhalesEnabled()) {
    return jsonError("Not found.", { status: 404 });
  }
  const limited = enforceRateLimit(req, {
    key: "api-whales-export",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const dataset = req.nextUrl.searchParams.get("dataset") ?? "alerts";
  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "24h";
  const severity = req.nextUrl.searchParams.get("severity");
  const coin = validateCoin(req.nextUrl.searchParams.get("coin"));
  const riskBucket = req.nextUrl.searchParams.get("riskBucket");
  const viewFilter = req.nextUrl.searchParams.get("viewFilter");

  if ((dataset === "wallet-alerts" || dataset === "wallet-episodes") && !address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }
  if (dataset === "positioning-snapshots" && !coin) {
    return jsonError("A valid asset is required for positioning snapshots.", { status: 400 });
  }

  if (dataset === "wallet-episodes" && address) {
    const episodes = await getWhaleEpisodesForAddress(address, 250);
    return csvResponse(`hyperpulse-whale-episodes-${address}.csv`, [
      ["started_at", "ended_at", "wallet", "coin", "directionality", "market_type", "risk_bucket", "headline", "why_it_matters"],
      ...episodes.map((episode) => [
        new Date(episode.startedAt).toISOString(),
        new Date(episode.endedAt).toISOString(),
        episode.address,
        episode.coin,
        episode.directionality,
        episode.marketType,
        episode.riskBucket,
        episode.alert.headline,
        episode.alert.confidenceLabel,
      ]),
    ]);
  }

  if (dataset === "positioning-snapshots" && coin) {
    const snapshots = await listPositioningMarketSnapshots(coin, 500);
    return csvResponse(`hyperpulse-positioning-snapshots-${coin}.csv`, [
      ["timestamp", "asset", "price", "funding_apr", "open_interest_usd", "oi_change_1h", "oi_change_4h", "basis_bps", "spot_proxy_source", "market_type"],
      ...snapshots.map((snapshot) => [
        new Date(snapshot.timestamp).toISOString(),
        snapshot.asset,
        snapshot.price,
        snapshot.fundingAPR,
        snapshot.openInterestUsd,
        snapshot.oiChange1h,
        snapshot.oiChange4h,
        snapshot.basisBps,
        snapshot.spotProxySource,
        snapshot.marketType,
      ]),
    ]);
  }

  if (dataset === "positioning-digests") {
    const digests = await listPositioningDigests(100);
    return csvResponse(`hyperpulse-positioning-digests-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["created_at", "period_start", "period_end", "headline", "summary"],
      ...digests.map((digest) => [
        new Date(digest.createdAt).toISOString(),
        new Date(digest.periodStart).toISOString(),
        new Date(digest.periodEnd).toISOString(),
        digest.headline,
        digest.summaryLines.join(" | "),
      ]),
    ]);
  }

  if (dataset === "positioning-alerts" || dataset === "alerts") {
    const alerts = await listPositioningAlerts({
      severity,
      asset: coin,
      alertType:
        viewFilter === "crowding"
          ? "crowding"
          : viewFilter === "liquidation"
            ? "liquidation_pressure"
            : viewFilter === "whale"
              ? "high_conviction_whale"
              : "all",
      timeframeMs: TIMEFRAME_TO_MS[timeframe] ?? TIMEFRAME_TO_MS["24h"],
      limit: 500,
    });

    return csvResponse(`hyperpulse-positioning-alerts-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["timestamp", "asset", "alert_type", "regime", "severity", "why_it_matters", "wallet", "funding_apr", "oi_change_1h", "oi_change_4h", "basis_bps", "tracked_liquidation_cluster_usd", "cluster_price", "cluster_distance_pct"],
      ...alerts.map((alert) => [
        new Date(alert.timestamp).toISOString(),
        alert.asset,
        alert.alertType,
        alert.regime,
        alert.severity,
        alert.whyItMatters,
        alert.walletAddress,
        alert.fundingApr,
        alert.oiChange1h,
        alert.oiChange4h,
        alert.basisBps,
        alert.trackedLiquidationClusterUsd,
        alert.clusterPrice,
        alert.clusterDistancePct,
      ]),
    ]);
  }

  if (dataset === "wallet-alerts" && address) {
    const alerts = await getWhaleAlertsForAddress(address, 250);
    return csvResponse(`hyperpulse-whale-alerts-${address}.csv`, [
      ["timestamp", "wallet", "coin", "alert_type", "side", "notional_usd", "confidence", "why_it_matters", "realized_pnl_30d", "win_rate_30d", "market_type", "risk_bucket", "headline"],
      ...alerts.map((alert) => [
        new Date(alert.timestamp).toISOString(),
        alert.address,
        alert.coin,
        alert.eventType,
        alert.side,
        alert.notionalUsd,
        alert.conviction,
        alert.confidenceLabel,
        alert.walletRealizedPnl30d,
        alert.walletDirectionalHitRate30d,
        alert.marketType,
        alert.riskBucket,
        alert.headline,
      ]),
    ]);
  }

  let alerts = await listWhaleAlerts({
    severity,
    coin,
    riskBucket,
    hip3Only: viewFilter === "hip3",
    directionality: viewFilter === "stress" ? "stress" : "all",
    timeframeMs: TIMEFRAME_TO_MS[timeframe] ?? TIMEFRAME_TO_MS["24h"],
    limit: 500,
  });
  alerts = applyViewFilter(alerts, viewFilter);

  return csvResponse(`hyperpulse-whale-feed-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["timestamp", "wallet", "coin", "alert_type", "side", "notional_usd", "confidence", "why_it_matters", "realized_pnl_30d", "win_rate_30d", "market_type", "risk_bucket", "headline"],
    ...alerts.map((alert) => [
      new Date(alert.timestamp).toISOString(),
      alert.address,
      alert.coin,
      alert.eventType,
      alert.side,
      alert.notionalUsd,
      alert.conviction,
      alert.confidenceLabel,
      alert.walletRealizedPnl30d,
      alert.walletDirectionalHitRate30d,
      alert.marketType,
      alert.riskBucket,
      alert.headline,
    ]),
  ]);
}
