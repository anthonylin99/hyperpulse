import { NextRequest } from "next/server";
import { isVaultsEnabled } from "@/lib/appConfig";
import type { DailySetupSnapshot } from "@/lib/dailySetup";
import { enforceRateLimit, jsonSuccess, validateCoin } from "@/lib/security";
import type { ReactionLevelsPayload } from "@/lib/reactionLevels";
import type {
  MarketRadarSignal,
  MomentumAlert,
  MomentumAlertOutcome,
  MomentumAlertOutcomeSummary,
  TerminalSignal,
  TerminalSignalMetric,
  TerminalSignalSeverity,
  TerminalSignalSide,
} from "@/types";
import type { VaultListResult } from "@/types/vaults";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_REACTION_ASSETS = ["BTC", "ETH", "SOL", "HYPE"];
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const SOURCE_CACHE_TTL_MS = 15_000;
const SOURCE_TIMEOUT_MS = 12_000;

const sourceCache = new Map<string, { expiresAt: number; value: SourceFetch<unknown> }>();

type RadarResponse = {
  signals?: MarketRadarSignal[];
  generatedAt?: number;
  source?: string;
};

type AlertsResponse = {
  alerts?: MomentumAlert[];
  generatedAt?: number;
};

type OutcomesResponse = {
  outcomes?: MomentumAlertOutcome[];
  summary?: MomentumAlertOutcomeSummary;
};

type ReactionBatchResponse = {
  assets?: Record<string, ReactionLevelsPayload>;
  generatedAt?: number;
};

type TopMover = {
  coin: string;
  pctChange: number;
  markPx: number;
  prevPx: number;
};

type TopMoversResponse = {
  gainers?: TopMover[];
  losers?: TopMover[];
  range?: string;
  asOf?: number;
};

type DailySetupResponse = DailySetupSnapshot;

type SourceFetch<T> = {
  ok: boolean;
  label: string;
  data: T | null;
};

function parseLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.round(parsed), 1), MAX_LIMIT);
}

function parseAssets(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((asset) => validateCoin(asset))
        .filter((asset): asset is string => asset != null),
    ),
  ).slice(0, 12);
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

function severityRank(severity: TerminalSignalSeverity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function paperTradeHref(asset: string | null, side: TerminalSignalSide) {
  if (!asset || (side !== "long" && side !== "short")) return null;
  return `/portfolio?section=shadow&paper=${encodeURIComponent(`${asset}-${side.toUpperCase()}`)}`;
}

function sideFromRadar(signal: MarketRadarSignal): TerminalSignalSide {
  if (signal.kind === "strongest_asset" || signal.kind === "holding_up" || signal.kind === "crowded_short") return "long";
  if (signal.kind === "weakest_asset" || signal.kind === "crowded_long") return "short";
  return "watch";
}

function titleFromRadar(signal: MarketRadarSignal) {
  if (signal.kind === "strongest_asset") return `${signal.asset} relative-strength setup`;
  if (signal.kind === "holding_up") return `${signal.asset} holding up vs beta`;
  if (signal.kind === "weakest_asset") return `${signal.asset} downside flow anomaly`;
  if (signal.kind === "crowded_long") return `${signal.asset} crowded long warning`;
  if (signal.kind === "crowded_short") return `${signal.asset} crowded short squeeze watch`;
  return `${signal.asset} market radar flag`;
}

function alertDirection(alert: MomentumAlert): TerminalSignalSide {
  return alert.payload?.direction === "short" ? "short" : "long";
}

function reactionSide(direction: string | null | undefined): TerminalSignalSide {
  if (direction === "up") return "long";
  if (direction === "down") return "short";
  return "watch";
}

async function fetchJson<T>(
  request: NextRequest,
  path: string,
  label: string,
  warnings: string[],
): Promise<SourceFetch<T>> {
  try {
    const url = new URL(path, request.url);
    const network = request.nextUrl.searchParams.get("network");
    if (network && !url.searchParams.has("network")) {
      url.searchParams.set("network", network);
    }

    const cacheKey = url.toString();
    const cached = sourceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as SourceFetch<T>;
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) {
      warnings.push(`${label} returned HTTP ${response.status}`);
      return { ok: false, label, data: null };
    }
    const result = { ok: true, label, data: (await response.json()) as T };
    sourceCache.set(cacheKey, { expiresAt: Date.now() + SOURCE_CACHE_TTL_MS, value: result });
    return result;
  } catch (error) {
    warnings.push(`${label} unavailable`);
    console.warn("[signals] source unavailable", label, error);
    return { ok: false, label, data: null };
  }
}

function fromRadar(payload: RadarResponse | null): TerminalSignal[] {
  return (payload?.signals ?? []).map((signal) => {
    const side = sideFromRadar(signal);
    const details = signal.scoreDetails;
    const metrics: TerminalSignalMetric[] = [
      { label: "Radar", value: signal.value, tone: signal.severity === "high" ? "warning" : "info" },
    ];
    if (details?.volumeVsAvg != null) metrics.push({ label: "Vol vs avg", value: `${details.volumeVsAvg.toFixed(1)}x`, tone: details.volumeVsAvg >= 2 ? "warning" : "neutral" });
    if (details?.btcResidualPct != null) metrics.push({ label: "BTC residual", value: formatPct(details.btcResidualPct), tone: details.btcResidualPct >= 0 ? "positive" : "negative" });
    if (details?.return4hPct != null) metrics.push({ label: "4h", value: formatPct(details.return4hPct), tone: details.return4hPct >= 0 ? "positive" : "negative" });

    return {
      id: `radar-${signal.id}`,
      family: "market_radar",
      subjectType: "asset",
      asset: signal.asset,
      title: titleFromRadar(signal),
      summary: signal.evidence[0] ?? signal.label,
      side,
      severity: signal.severity,
      score: details?.score ?? null,
      confidence: signal.severity,
      freshnessMs: Number.isFinite(signal.timestamp) ? Math.max(0, Date.now() - signal.timestamp) : null,
      evidence: signal.evidence,
      metrics,
      source: payload?.source ?? "market-radar",
      sourceCaveat: "Relative-strength and participation scan. Treat as a setup flag, not a trade instruction.",
      routeHref: signal.routeHref || `/markets?asset=${encodeURIComponent(signal.asset)}`,
      paperTradeHref: paperTradeHref(signal.asset, side),
    };
  });
}

function fromAlerts(alertsPayload: AlertsResponse | null, outcomesPayload: OutcomesResponse | null): TerminalSignal[] {
  const outcomeById = new Map((outcomesPayload?.outcomes ?? []).map((outcome) => [outcome.alertId, outcome]));
  return (alertsPayload?.alerts ?? []).map((alert) => {
    const side = alertDirection(alert);
    const outcome = outcomeById.get(alert.id);
    const metrics: TerminalSignalMetric[] = [
      { label: "Score", value: `${Math.round(alert.score)}`, tone: alert.score >= 90 ? "warning" : "info" },
      { label: "Alert", value: formatPrice(alert.alertPrice), tone: "neutral" },
    ];
    if (alert.returnSinceAlertPct != null) metrics.push({ label: "Since alert", value: formatPct(alert.returnSinceAlertPct), tone: alert.returnSinceAlertPct >= 0 ? "positive" : "negative" });
    if (alert.volumeVsBaseline != null) metrics.push({ label: "Vol baseline", value: `${alert.volumeVsBaseline.toFixed(1)}x`, tone: alert.volumeVsBaseline >= 2 ? "warning" : "neutral" });
    if (outcome?.outcome) metrics.push({ label: "Outcome", value: outcome.outcome.replace("_", " "), tone: outcome.outcome === "tp_first" ? "positive" : outcome.outcome === "sl_first" ? "negative" : "neutral" });

    const evidence = [alert.reason];
    if (alert.invalidationPrice) evidence.push(`Invalidation ${side === "short" ? "above" : "below"} ${formatPrice(alert.invalidationPrice)}.`);
    if (alert.targetPrice) evidence.push(`First target near ${formatPrice(alert.targetPrice)}.`);

    return {
      id: `alert-${alert.id}`,
      family: "momentum_alert",
      subjectType: "asset",
      asset: alert.asset,
      title: `${alert.asset} ${side} momentum alert`,
      summary: alert.reason,
      side,
      severity: alert.severity,
      score: alert.score,
      confidence: alert.severity,
      freshnessMs: Number.isFinite(alert.createdAt) ? Math.max(0, Date.now() - alert.createdAt) : null,
      evidence,
      metrics,
      source: "momentum-alerts",
      sourceCaveat: "Persisted alert with fixed alert price and invalidation. Outcome scoring is TP/SL order, not a live-fill PnL record.",
      routeHref: alert.routeHref || `/markets?asset=${encodeURIComponent(alert.asset)}`,
      paperTradeHref: paperTradeHref(alert.asset, side),
    };
  });
}

function fromReactions(payload: ReactionBatchResponse | null): TerminalSignal[] {
  return Object.entries(payload?.assets ?? {}).flatMap(([asset, reaction]) => {
    const primaryZone = reaction.reactionZones?.[0];
    const primaryPositioning =
      reaction.positioning?.buyerInitiatedBuilds?.[0] ??
      reaction.positioning?.sellerInitiatedBuilds?.[0] ??
      null;

    if (primaryZone) {
      const side = reactionSide(primaryZone.directionBias);
      return [{
        id: `reaction-${asset}-${primaryZone.id}`,
        family: "reaction_zone",
        subjectType: "asset",
        asset,
        title: `${asset} reaction zone`,
        summary: primaryZone.confidenceReason || primaryZone.evidence[0] || "Inferred reaction zone from public market streams.",
        side,
        severity: primaryZone.confidence === "high" ? "high" : primaryZone.confidence === "medium" ? "medium" : "low",
        score: primaryZone.score,
        confidence: primaryZone.confidence,
        freshnessMs: primaryZone.ageMs,
        evidence: primaryZone.evidence.length > 0 ? primaryZone.evidence : [reaction.coverage.note],
        metrics: [
          { label: "Zone", value: `${formatPrice(primaryZone.zoneLow)}-${formatPrice(primaryZone.zoneHigh)}` },
          { label: "Distance", value: formatPct(primaryZone.distancePct), tone: Math.abs(primaryZone.distancePct) <= 1 ? "warning" : "neutral" },
          { label: "Score", value: `${Math.round(primaryZone.score)}`, tone: "info" },
        ],
        source: "reaction-map",
        sourceCaveat: primaryZone.sourceCaveat?.text ?? reaction.coverage.note,
        routeHref: `/markets?asset=${encodeURIComponent(asset)}`,
        paperTradeHref: paperTradeHref(asset, side),
      }];
    }

    if (!primaryPositioning) return [];
    const side = primaryPositioning.side === "bull" ? "long" : "short";
    return [{
      id: `reaction-positioning-${asset}-${primaryPositioning.id}`,
      family: "reaction_zone",
      subjectType: "asset",
      asset,
      title: `${asset} inferred positioning`,
      summary: primaryPositioning.confidenceReason || primaryPositioning.roleLabel,
      side,
      severity: primaryPositioning.confidence === "high" ? "high" : primaryPositioning.confidence === "medium" ? "medium" : "low",
      score: primaryPositioning.inferredOiUsd,
      confidence: primaryPositioning.confidence,
      freshnessMs: primaryPositioning.ageMs,
      evidence: [primaryPositioning.roleLabel, primaryPositioning.confidenceReason],
      metrics: [
        { label: "Inferred OI", value: formatUsd(primaryPositioning.inferredOiUsd), tone: "info" },
        { label: "Zone", value: `${formatPrice(primaryPositioning.zoneLow)}-${formatPrice(primaryPositioning.zoneHigh)}` },
        { label: "Distance", value: formatPct(primaryPositioning.distancePct), tone: Math.abs(primaryPositioning.distancePct) <= 1 ? "warning" : "neutral" },
      ],
      source: "reaction-map",
      sourceCaveat: primaryPositioning.sourceCaveat?.text ?? reaction.coverage.note,
      routeHref: `/markets?asset=${encodeURIComponent(asset)}`,
      paperTradeHref: paperTradeHref(asset, side),
    }];
  });
}

function fromTopMovers(payload: TopMoversResponse | null): TerminalSignal[] {
  const rows = [
    ...(payload?.gainers ?? []).slice(0, 3).map((mover) => ({ ...mover, direction: "long" as const })),
    ...(payload?.losers ?? []).slice(0, 3).map((mover) => ({ ...mover, direction: "short" as const })),
  ];
  return rows.map((mover) => {
    const absMove = Math.abs(mover.pctChange);
    const severity: TerminalSignalSeverity = absMove >= 8 ? "high" : absMove >= 4 ? "medium" : "low";
    return {
      id: `top-mover-${payload?.range ?? "1d"}-${mover.coin}-${mover.direction}`,
      family: "top_mover",
      subjectType: "asset",
      asset: mover.coin,
      title: `${mover.coin} ${mover.direction === "long" ? "upside" : "downside"} mover`,
      summary: `${mover.coin} is one of the strongest ${payload?.range?.toUpperCase() ?? "1D"} ${mover.direction === "long" ? "gainers" : "losers"}.`,
      side: mover.direction,
      severity,
      score: absMove,
      confidence: severity,
      freshnessMs: payload?.asOf ? Math.max(0, Date.now() - payload.asOf) : null,
      evidence: [`Move from ${formatPrice(mover.prevPx)} to ${formatPrice(mover.markPx)}.`, "Use market structure, funding, and Reaction Map before acting."],
      metrics: [
        { label: "Move", value: formatPct(mover.pctChange), tone: mover.pctChange >= 0 ? "positive" : "negative" },
        { label: "Mark", value: formatPrice(mover.markPx) },
      ],
      source: "top-movers",
      sourceCaveat: "Top mover scan is descriptive market context. It is not an execution signal by itself.",
      routeHref: `/markets?asset=${encodeURIComponent(mover.coin)}`,
      paperTradeHref: paperTradeHref(mover.coin, mover.direction),
    };
  });
}

function fromVaults(payload: VaultListResult | null): TerminalSignal[] {
  return (payload?.vaults ?? []).slice(0, 5).map((vault) => {
    const score = vault.metrics.score;
    const severity: TerminalSignalSeverity = score.decision === "watch" ? "high" : score.decision === "review" ? "medium" : "low";
    const metrics: TerminalSignalMetric[] = [
      { label: "TVL", value: formatUsd(vault.metrics.tvl), tone: "info" },
      { label: "30d", value: formatPct(vault.metrics.return30dPct), tone: (vault.metrics.return30dPct ?? 0) >= 0 ? "positive" : "negative" },
      { label: "Sharpe", value: vault.metrics.sharpe90d == null ? "n/a" : vault.metrics.sharpe90d.toFixed(2), tone: "neutral" },
    ];

    return {
      id: `vault-${vault.vaultAddress}`,
      family: "vault_operator",
      subjectType: "vault",
      asset: null,
      title: `${vault.name || "Unnamed vault"} operator watch`,
      summary: score.reason,
      side: "watch",
      severity,
      score: score.score,
      confidence: score.confidence,
      freshnessMs: null,
      evidence: score.flags.length > 0 ? score.flags : ["Shortlist candidate. Inspect drawdown, lockups, and operator history before depositing."],
      metrics,
      source: "vaults",
      sourceCaveat: "Vault rankings are descriptive and can suffer from survivorship bias. This is not a copy-trade instruction.",
      routeHref: `/vaults/${encodeURIComponent(vault.vaultAddress)}`,
      paperTradeHref: null,
    };
  });
}

function fromDailySetup(payload: DailySetupResponse | null): TerminalSignal[] {
  const setup = payload?.setup;
  if (!setup || setup.status === "no-trade" || setup.coin === "MARKET") return [];
  const metrics: TerminalSignalMetric[] = [
    { label: "Funding", value: formatPct(setup.fundingApr), tone: Math.abs(setup.fundingApr) >= 20 ? "warning" : "neutral" },
    { label: "24h", value: formatPct(setup.priceChange24h), tone: setup.priceChange24h >= 0 ? "positive" : "negative" },
    { label: "Trigger", value: formatPrice(setup.trigger), tone: "info" },
    { label: "Invalid", value: formatPrice(setup.invalidation), tone: "negative" },
    { label: "Target", value: formatPrice(setup.target), tone: "positive" },
  ];
  const socialEvidence =
    setup.topTakes.length > 0
      ? setup.topTakes.slice(0, 3).map((take) => `${take.analystHandle}: ${take.title} (${take.stance}).`)
      : ["No curated social takes are loaded for this asset yet."];

  return [{
    id: `daily-setup-${payload.id}`,
    family: "daily_setup",
    subjectType: "asset",
    asset: setup.coin,
    title: setup.title,
    summary: setup.decisionLabel,
    side: setup.side,
    severity: setup.sentimentAlignment === "confirms" ? "high" : setup.sentimentAlignment === "none" ? "low" : "medium",
    score: setup.score,
    confidence: setup.sentimentAlignment === "confirms" ? "high" : "medium",
    freshnessMs: Number.isFinite(payload.generatedAt) ? Math.max(0, Date.now() - payload.generatedAt) : null,
    evidence: [
      ...setup.rationale.slice(0, 2),
      setup.socialContext.note,
      ...socialEvidence,
    ],
    metrics,
    source: "daily-setup-signal-lab",
    sourceCaveat: `${setup.socialContext.caveat} Funding/price trigger remains the authority.`,
    routeHref: `/markets?asset=${encodeURIComponent(setup.coin)}`,
    paperTradeHref: paperTradeHref(setup.coin, setup.side),
  }];
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    key: "api-signals",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const requestedAssets = parseAssets(request.nextUrl.searchParams.get("assets"));
  const restrictToAssets = request.nextUrl.searchParams.has("assets") && requestedAssets.length > 0;
  const assetSet = new Set(requestedAssets);
  const reactionAssets = requestedAssets.length > 0 ? requestedAssets : DEFAULT_REACTION_ASSETS;
  const alertLimit = Math.min(limit <= 10 ? 24 : 40, 60);
  const outcomeLimit = Math.min(limit <= 10 ? 6 : 12, 20);
  const warnings: string[] = [];

  const [dailySetup, radar, alerts, reactions, topMovers] = await Promise.all([
    fetchJson<DailySetupResponse>(request, "/api/market/daily-setup", "daily setup", warnings),
    fetchJson<RadarResponse>(request, "/api/market/radar", "market radar", warnings),
    fetchJson<AlertsResponse>(request, `/api/alerts/momentum?limit=${alertLimit}`, "momentum alerts", warnings),
    fetchJson<ReactionBatchResponse>(
      request,
      `/api/market/reaction-levels?coins=${encodeURIComponent(reactionAssets.join(","))}`,
      "reaction levels",
      warnings,
    ),
    fetchJson<TopMoversResponse>(request, "/api/market/top-movers?range=1d", "top movers", warnings),
  ]);

  const [outcomes, vaults] = await Promise.all([
    fetchJson<OutcomesResponse>(request, `/api/alerts/outcomes?limit=${outcomeLimit}`, "alert outcomes", warnings),
    isVaultsEnabled()
      ? fetchJson<VaultListResult>(request, "/api/vaults", "vaults", warnings)
      : Promise.resolve({ ok: false, label: "vaults", data: null } satisfies SourceFetch<VaultListResult>),
  ]);

  const outcomeSummary = outcomes.data?.summary ?? null;
  const allSignals = [
    ...fromDailySetup(dailySetup.data),
    ...fromAlerts(alerts.data, outcomes.data),
    ...fromRadar(radar.data),
    ...fromReactions(reactions.data),
    ...fromTopMovers(topMovers.data),
    ...fromVaults(vaults.data),
  ].filter((signal) => {
    if (!restrictToAssets || !signal.asset) return true;
    return assetSet.has(signal.asset.toUpperCase());
  });

  const sortedSignals = allSignals.sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    const freshnessA = a.freshnessMs ?? Number.MAX_SAFE_INTEGER;
    const freshnessB = b.freshnessMs ?? Number.MAX_SAFE_INTEGER;
    if (freshnessA !== freshnessB) return freshnessA - freshnessB;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  const signals = sortedSignals.slice(0, limit);
  const sources = [dailySetup, radar, alerts, outcomes, reactions, topMovers, vaults]
    .filter((source) => source.ok)
    .map((source) => source.label);

  return jsonSuccess(
    {
      signals,
      summary: {
        total: allSignals.length,
        highSeverity: allSignals.filter((signal) => signal.severity === "high").length,
        alertWinRatePct: outcomeSummary?.winRatePct ?? null,
        vaultCount: vaults.data?.vaults?.length ?? 0,
        generatedAt: Date.now(),
      },
      warnings,
      sources,
      generatedAt: Date.now(),
    },
    { cache: "public-market" },
  );
}
