import { NextResponse } from "next/server";
import {
  PUBLIC_DEPLOYMENT_MODE,
  isTradingEnabled,
} from "@/lib/appConfig";
import { getInfoClient } from "@/lib/hyperliquid";
import { getMomentumAlertDiagnostics } from "@/lib/momentumAlerts";

export const dynamic = "force-dynamic";

async function checkMarketData() {
  const startedAt = Date.now();
  try {
    const payload = await Promise.race([
      getInfoClient().metaAndAssetCtxs(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("market data timeout")), 3500),
      ),
    ]);
    const parts = Array.isArray(payload) ? payload : [];
    const ctxs = Array.isArray(parts[1]) ? parts[1] : [];
    return {
      status: ctxs.length > 0 ? "ok" : "degraded",
      latencyMs: Date.now() - startedAt,
      assetCount: ctxs.length,
      message: ctxs.length > 0 ? "Hyperliquid market data reachable." : "Hyperliquid returned no market contexts.",
    };
  } catch (error) {
    return {
      status: "degraded",
      latencyMs: Date.now() - startedAt,
      assetCount: 0,
      message: error instanceof Error ? error.message : "Market data check failed.",
    };
  }
}

export async function GET() {
  const [diagnostics, marketDataStatus] = await Promise.all([
    getMomentumAlertDiagnostics(0),
    checkMarketData(),
  ]);

  const workerStatus = diagnostics.worker?.stale
    ? "stale"
    : diagnostics.worker
      ? "fresh"
      : "missing";
  const operationalStatus =
    marketDataStatus.status === "ok" &&
    diagnostics.status !== "store_unconfigured" &&
    diagnostics.status !== "worker_stale" &&
    diagnostics.status !== "dry_run_only"
      ? "ok"
      : "degraded";

  const payload = {
    ok: true,
    status: "ok",
    operationalStatus,
    deploymentMode: PUBLIC_DEPLOYMENT_MODE,
    vercelEnv:
      process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local",
    buildId:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      null,
    featureFlags: {
      tradingEnabled: isTradingEnabled(),
      momentumAlertsEnabled: true,
    },
    databaseStatus: {
      status: diagnostics.configured ? "configured" : "unconfigured",
      momentumAlertStoreConfigured: diagnostics.configured,
    },
    marketDataStatus,
    workerFreshness: {
      status: workerStatus,
      updatedAt: diagnostics.worker?.updatedAt ?? null,
      ageMs: diagnostics.worker?.ageMs ?? null,
      stale: diagnostics.worker?.stale ?? true,
      dryRun: diagnostics.worker?.dryRun ?? null,
      scanned: diagnostics.worker?.scanned ?? null,
      candidates: diagnostics.worker?.candidates ?? null,
      inserted: diagnostics.worker?.inserted ?? null,
      sent: diagnostics.worker?.sent ?? null,
    },
    telegramStatus: {
      status: diagnostics.status,
      message: diagnostics.message,
      delivery: diagnostics.delivery,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
