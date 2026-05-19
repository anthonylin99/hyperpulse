import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { isAgentDevEnabled } from "@/lib/appConfig";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { listMomentumAlerts } from "@/lib/momentumAlerts";
import {
  DEFAULT_DEV_AGENT_EQUITY_USD,
  DEFAULT_DEV_AGENT_RISK_POLICY,
  buildDevAgentRecommendation,
  signalFromMomentumAlert,
} from "@/lib/agent/risk";
import {
  isAgentIntentStoreConfigured,
  listAgentExecutionIntents,
  upsertPaperIntentsFromRecommendations,
} from "@/lib/agent/intents";
import type { AgentIntentResponse } from "@/types/agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function parseEquity(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DEV_AGENT_EQUITY_USD;
  return Math.min(Math.max(parsed, 100), 1_000_000);
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

function buildPolicyForRequest(assets: string[], allowAllAssets: boolean) {
  if (!allowAllAssets) return DEFAULT_DEV_AGENT_RISK_POLICY;
  return {
    ...DEFAULT_DEV_AGENT_RISK_POLICY,
    allowedAssets: Array.from(
      new Set([
        ...DEFAULT_DEV_AGENT_RISK_POLICY.allowedAssets,
        ...assets.map((asset) => asset.toUpperCase()),
      ]),
    ).sort(),
  };
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-agent-intents",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!isAgentDevEnabled()) {
    return jsonError("Agent dev mode is disabled.", { status: 404 });
  }

  try {
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const equityUsd = parseEquity(req.nextUrl.searchParams.get("equityUsd"));
    const allowAllAssets = req.nextUrl.searchParams.get("allowAllAssets") === "true";
    const generatedAt = Date.now();
    const alerts = await listMomentumAlerts(limit);
    const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
    const currentPrices = parseCurrentPrices(await info.metaAndAssetCtxs());
    const policy = buildPolicyForRequest(
      alerts.map((alert) => alert.asset),
      allowAllAssets,
    );

    const recommendations = alerts.flatMap((alert) => {
      const signal = signalFromMomentumAlert(
        alert,
        currentPrices.get(alert.asset.toUpperCase()) ?? null,
      );
      if (!signal) return [];
      return [
        buildDevAgentRecommendation({
          signal,
          equityUsd,
          policy,
          generatedAt,
        }),
      ];
    });

    const storage = await upsertPaperIntentsFromRecommendations(recommendations);
    const intents = storage.configured ? await listAgentExecutionIntents(limit) : [];
    const response: AgentIntentResponse = {
      enabled: true,
      mode: "paper",
      generatedAt,
      equityUsd,
      policy,
      storageConfigured: storage.configured && isAgentIntentStoreConfigured(),
      intents,
      source: "momentum-alert-events",
      message: storage.configured
        ? `Synced ${storage.upserted} paper intents.`
        : "Agent intent database is not configured, so paper execution logging is unavailable.",
    };

    return jsonSuccess(response);
  } catch (error) {
    logServerError("api/agent/intents", error);
    return jsonError("Unable to build agent execution intents right now.", {
      status: 502,
    });
  }
}
