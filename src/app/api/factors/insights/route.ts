import { createHash } from "node:crypto";
import { isFactorsEnabled } from "@/lib/appConfig";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
} from "@/lib/security";
import type { FactorAiBrief, FactorAiInsight } from "@/types";

export const dynamic = "force-dynamic";

type InsightCandidate = {
  symbol: string;
  role: "long" | "short";
  liveChange24h: number | null;
  fundingAPR: number | null;
  signalLabel: string | null;
  trendStatus: "trend-confirmed" | "watchlist-only";
};

type FactorInsightInput = {
  name: string;
  shortLabel: string;
  reportDate: string;
  confidence: "high" | "medium" | "low";
  stalenessDays: number;
  basketCoverage: number;
  hyperliquidCoverage: number;
  spread7d: number | null;
  spread30d: number | null;
  narrativeTags: string[];
  tradeCandidates: InsightCandidate[];
};

type RequestPayload = {
  factors: FactorInsightInput[];
  sourceMode?: "live" | "snapshot";
};

const BRIEF_CACHE_TTL_MS = 30 * 60 * 1000;
const briefCache = new Map<string, { cachedAt: number; brief: FactorAiBrief }>();

function payloadCacheKey(payload: RequestPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getCachedBrief(key: string): FactorAiBrief | null {
  const cached = briefCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > BRIEF_CACHE_TTL_MS) {
    briefCache.delete(key);
    return null;
  }
  return cached.brief;
}

function setCachedBrief(key: string, brief: FactorAiBrief) {
  briefCache.set(key, { cachedAt: Date.now(), brief });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePayload(body: unknown): RequestPayload | null {
  if (!body || typeof body !== "object") return null;

  const maybeFactors = (body as { factors?: unknown }).factors;
  const sourceMode = (body as { sourceMode?: unknown }).sourceMode;
  if (!Array.isArray(maybeFactors) || maybeFactors.length === 0 || maybeFactors.length > 8) {
    return null;
  }

  const factors: FactorInsightInput[] = [];

  for (const raw of maybeFactors) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;

    if (
      typeof item.name !== "string" ||
      typeof item.shortLabel !== "string" ||
      typeof item.reportDate !== "string" ||
      !["high", "medium", "low"].includes(String(item.confidence)) ||
      !isFiniteNumber(item.stalenessDays) ||
      !isFiniteNumber(item.basketCoverage) ||
      !isFiniteNumber(item.hyperliquidCoverage) ||
      !Array.isArray(item.narrativeTags) ||
      !Array.isArray(item.tradeCandidates)
    ) {
      return null;
    }

    const tradeCandidates: InsightCandidate[] = item.tradeCandidates
      .slice(0, 4)
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          throw new Error("Invalid trade candidate payload");
        }

        const row = candidate as Record<string, unknown>;
        if (
          typeof row.symbol !== "string" ||
          !["long", "short"].includes(String(row.role)) ||
          !["trend-confirmed", "watchlist-only"].includes(String(row.trendStatus))
        ) {
          throw new Error("Invalid trade candidate payload");
        }

        return {
          symbol: row.symbol,
          role: row.role as "long" | "short",
          liveChange24h: isFiniteNumber(row.liveChange24h) ? row.liveChange24h : null,
          fundingAPR: isFiniteNumber(row.fundingAPR) ? row.fundingAPR : null,
          signalLabel: typeof row.signalLabel === "string" ? row.signalLabel : null,
          trendStatus: row.trendStatus as "trend-confirmed" | "watchlist-only",
        };
      });

    factors.push({
      name: item.name,
      shortLabel: item.shortLabel,
      reportDate: item.reportDate,
      confidence: item.confidence as "high" | "medium" | "low",
      stalenessDays: item.stalenessDays,
      basketCoverage: item.basketCoverage,
      hyperliquidCoverage: item.hyperliquidCoverage,
      spread7d: isFiniteNumber(item.spread7d) ? item.spread7d : null,
      spread30d: isFiniteNumber(item.spread30d) ? item.spread30d : null,
      narrativeTags: item.narrativeTags
        .filter((tag): tag is string => typeof tag === "string")
        .slice(0, 6),
      tradeCandidates,
    });
  }

  return {
    factors,
    sourceMode: sourceMode === "snapshot" ? "snapshot" : "live",
  };
}

function formatPercent(value: number | null): string {
  if (!isFiniteNumber(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function buildDeterministicBrief(payload: RequestPayload): FactorAiBrief {
  const ranked = [...payload.factors].sort((a, b) => {
    const aScore = a.spread7d ?? a.spread30d ?? Number.NEGATIVE_INFINITY;
    const bScore = b.spread7d ?? b.spread30d ?? Number.NEGATIVE_INFINITY;
    return bScore - aScore;
  });

  const leader = ranked[0];
  const laggard = [...payload.factors].sort((a, b) => {
    const aScore = a.spread7d ?? a.spread30d ?? Number.POSITIVE_INFINITY;
    const bScore = b.spread7d ?? b.spread30d ?? Number.POSITIVE_INFINITY;
    return aScore - bScore;
  })[0];

  const leaderTickers =
    leader?.tradeCandidates
      .filter((candidate) => candidate.role === "long")
      .map((candidate) => candidate.symbol)
      .slice(0, 4) ?? [];
  const laggardTickers =
    laggard?.tradeCandidates
      .filter((candidate) => candidate.role === "short")
      .map((candidate) => candidate.symbol)
      .slice(0, 4) ?? [];

  const insights: FactorAiInsight[] = [];
  if (leader) {
    insights.push({
      title: `${leader.name} is leading`,
      body: `${leader.shortLabel} shows ${formatPercent(leader.spread7d)} over 7d and ${formatPercent(
        leader.spread30d,
      )} over 30d with ${Math.round(leader.hyperliquidCoverage)}% Hyperliquid coverage.`,
      tone: (leader.spread7d ?? 0) > 0 ? "bullish" : "neutral",
      tickers: leaderTickers,
    });
  }
  if (laggard && laggard.name !== leader?.name) {
    insights.push({
      title: `${laggard.name} is lagging`,
      body: `${laggard.shortLabel} is the weakest tracked factor at ${formatPercent(
        laggard.spread7d,
      )} over 7d; treat constituent shorts as context, not a standalone signal.`,
      tone: (laggard.spread7d ?? 0) < 0 ? "cautious" : "neutral",
      tickers: laggardTickers,
    });
  }

  return {
    headline: leader ? `${leader.name} leads the current factor tape` : "Factor tape unavailable",
    summary: leader
      ? `HyperPulse is using deterministic factor math only: ${leader.name} leads, ${
          laggard && laggard.name !== leader.name ? `${laggard.name} lags` : "with no clear laggard"
        }.`
      : "No valid factor payload was available.",
    insights,
    disclaimer:
      "Generated from supplied factor data only. OpenAI insights are disabled in this build.",
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  if (!isFactorsEnabled()) {
    return jsonError("Not found.", {
      status: 404,
    });
  }

  const limited = enforceRateLimit(request, {
    key: "api-factors-insights",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let payload: RequestPayload | null = null;
  try {
    const body = await request.json();
    payload = normalizePayload(body);
  } catch {
    payload = null;
  }

  if (!payload) {
    return jsonError("Invalid factor insight payload.", {
      status: 400,
      cache: "private-no-store",
    });
  }

  const cacheKey = payloadCacheKey(payload);
  const cached = getCachedBrief(cacheKey);
  if (cached) {
    return jsonSuccess(cached, { cache: "private-no-store" });
  }

  const brief = buildDeterministicBrief(payload);
  setCachedBrief(cacheKey, brief);
  return jsonSuccess(brief, { cache: "private-no-store" });
}
