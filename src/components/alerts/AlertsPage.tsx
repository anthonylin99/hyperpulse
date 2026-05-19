"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, BookOpenCheck, ExternalLink, Info, Radio, RefreshCw, Send, type LucideIcon } from "lucide-react";
import { cn, formatChartPrice } from "@/lib/format";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import { formatEasternDateTime } from "@/lib/time";
import { useShadowBook } from "@/context/ShadowBookContext";
import type { MomentumAlert, MomentumAlertOutcome, MomentumAlertOutcomeSummary } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type AlertsResponse = {
  alerts: MomentumAlert[];
  generatedAt: number;
  worker: MomentumDiagnostics["worker"];
  diagnostics: MomentumDiagnostics;
  source: string;
};

type OutcomesResponse = {
  outcomes: MomentumAlertOutcome[];
  summary: MomentumAlertOutcomeSummary;
  generatedAt: number;
  source: string;
};

type MomentumDiagnostics = {
  configured: boolean;
  worker: {
    updatedAt: number | null;
    status: string;
    message: string | null;
    ageMs: number | null;
    stale: boolean;
    dryRun: boolean | null;
    scanned: number | null;
    candidates: number | null;
    inserted: number | null;
    queued: number | null;
    sent: number | null;
    selected: string[];
    telegramCap: number | null;
    storeCap: number | null;
  } | null;
  delivery: {
    queued: number;
    sent: number;
    failed: number;
    disabled: number;
    recentError: string | null;
  };
  status:
    | "live"
    | "store_unconfigured"
    | "no_worker_run"
    | "worker_stale"
    | "dry_run_only"
    | "telegram_missing_or_disabled"
    | "telegram_failing"
    | "no_qualified_alerts";
  message: string;
};

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function severityTone(severity: MomentumAlert["severity"]) {
  if (severity === "high") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (severity === "medium") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-zinc-800 bg-zinc-950/70 text-zinc-400";
}

function triggerLabel(kind: MomentumAlert["triggerKind"]) {
  return kind === "momentum_ignition" ? "Momentum ignition" : "Momentum continuation";
}

function deliveryLabel(alert: MomentumAlert) {
  const status = alert.deliveryStatus?.status;
  if (status === "sent") return "Telegram sent";
  if (status === "queued") return "Telegram queued";
  if (status === "disabled") return "Telegram disabled";
  if (status === "failed") return "Telegram failed";
  return "Stored";
}

function outcomeLabel(outcome: MomentumAlertOutcome | null | undefined) {
  if (!outcome) return "pending";
  if (outcome.outcome === "tp_first") return "TP first";
  if (outcome.outcome === "sl_first") return "SL first";
  if (outcome.outcome === "ambiguous") return "ambiguous";
  if (outcome.outcome === "invalid_levels") return "invalid";
  if (outcome.outcome === "no_candles") return "no candles";
  return outcome.horizonComplete ? "unresolved" : "open";
}

function outcomeTone(outcome: MomentumAlertOutcome | null | undefined) {
  if (!outcome) return "border-zinc-800 bg-zinc-950/70 text-zinc-500";
  if (outcome.outcome === "tp_first") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (outcome.outcome === "sl_first") return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  if (outcome.outcome === "ambiguous") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-zinc-800 bg-zinc-950/70 text-zinc-400";
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setError(null);
        const [alertsResponse, outcomesResponse] = await Promise.all([
          fetch("/api/alerts/momentum"),
          fetch("/api/alerts/outcomes?limit=50"),
        ]);
        if (!alertsResponse.ok) throw new Error("Unable to load alerts");
        const payload = (await alertsResponse.json()) as AlertsResponse;
        const outcomePayload = outcomesResponse.ok ? ((await outcomesResponse.json()) as OutcomesResponse) : null;
        if (mounted) {
          setData(payload);
          if (outcomePayload) setOutcomes(outcomePayload);
        }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load alerts");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MARKET);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const outcomeById = useMemo(() => new Map((outcomes?.outcomes ?? []).map((outcome) => [outcome.alertId, outcome])), [outcomes]);
  const alerts = useMemo(
    () => (data?.alerts ?? []).map((alert) => ({ ...alert, outcome: outcomeById.get(alert.id) ?? null })),
    [data?.alerts, outcomeById],
  );
  const diagnostics = data?.diagnostics ?? null;
  const stats = useMemo(() => {
    const last24h = alerts.filter((alert) => alert.createdAt >= Date.now() - 24 * 60 * 60 * 1000);
    return {
      last24h: last24h.length,
      stored: alerts.length,
      hitRate: outcomes?.summary.winRatePct ?? null,
    };
  }, [alerts, outcomes?.summary.winRatePct]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#10151b]">
        <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.11),transparent_32%),#10151b] px-4 py-4 md:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionEyebrow className="text-teal-300">Alerts</SectionEyebrow>
              <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
                Momentum alert blotter.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Dense event log for liquid perp momentum. Strict breakout alert rules mean not every top mover qualifies; each row stores the exact alert price and timestamp.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill icon={Radio} label={data?.worker?.status ?? (loading ? "loading" : "idle")} value={data?.worker?.updatedAt ? formatEasternDateTime(data.worker.updatedAt, true) : "No worker run"} />
              <StatusPill icon={RefreshCw} label="Refresh" value="60s" />
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-zinc-800 md:grid-cols-3">
          <StatCard label="Alerts 24h" value={stats.last24h.toString()} helper={`Telegram cap ${diagnostics?.worker?.telegramCap ?? 8}/day`} />
          <StatCard label="Stored alerts" value={stats.stored.toString()} helper="reviewable snapshots" />
          <StatCard
            label="TP/SL hit rate"
            value={stats.hitRate == null ? "n/a" : `${stats.hitRate.toFixed(0)}%`}
            helper="TP reached before invalidation"
            tooltip={outcomes?.summary ? <HitRateTooltip summary={outcomes.summary} /> : null}
          />
        </div>
      </section>

      {diagnostics ? <DiagnosticBanner diagnostics={diagnostics} /> : null}
      {outcomes?.summary ? <ZoneQualityPanel summary={outcomes.summary} /> : null}

      {error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0f14]">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-300" />
            <SectionEyebrow>Momentum timeline</SectionEyebrow>
          </div>
          <div className="text-[11px] text-zinc-500">Generated {data?.generatedAt ? formatEasternDateTime(data.generatedAt, true) : "--"}</div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            <div className="h-28 rounded-2xl skeleton" />
            <div className="h-28 rounded-2xl skeleton" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-500">
              <Bell className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm font-medium text-zinc-200">No momentum alerts yet.</div>
            <div className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">{diagnostics?.message ?? "When the worker spots a selective liquid-perp momentum setup, it will appear here with the exact alert price."}</div>
          </div>
        ) : (
          <>
            <div className="divide-y divide-zinc-900 md:hidden">
              {alerts.map((alert) => (
                <MobileAlertCard key={alert.id} alert={alert} />
              ))}
            </div>
            <div className="hidden min-w-full overflow-x-auto md:block">
              <div className="grid min-w-[1280px] grid-cols-[92px_150px_120px_170px_170px_128px_128px_120px_minmax(220px,1fr)_190px] border-b border-zinc-800 bg-zinc-950/60 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                <div>Time</div>
                <div>Asset</div>
                <div>Signal</div>
                <div>Momentum</div>
                <div>Participation</div>
                <div>Alert</div>
                <div>Now</div>
                <div>Outcome</div>
                <div>Reason</div>
                <div className="text-right">Actions</div>
              </div>
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DiagnosticBanner({ diagnostics }: { diagnostics: MomentumDiagnostics }) {
  const isHealthy = diagnostics.status === "live" || diagnostics.status === "no_qualified_alerts";
  const tone = isHealthy
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
    : diagnostics.status === "dry_run_only" || diagnostics.status === "worker_stale" || diagnostics.status === "no_worker_run"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
      : "border-rose-500/25 bg-rose-500/10 text-rose-100";
  const worker = diagnostics.worker;
  return (
    <details open={!isHealthy} className={cn("group rounded-2xl border", tone)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-sm font-medium">Alert system status</div>
          <div className="mt-1 text-xs opacity-75">
            {diagnostics.message}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-current/20 px-2 py-1 font-mono uppercase">{diagnostics.status.replaceAll("_", " ")}</span>
          <span className="hidden rounded-full border border-current/20 px-2 py-1 font-mono sm:inline-flex">sent {diagnostics.delivery.sent}</span>
          <span className="text-xs transition-transform group-open:rotate-180">⌃</span>
        </div>
      </summary>
      <div className="border-t border-current/10 px-4 py-3">
        <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
          <span className="rounded-lg border border-current/15 px-3 py-2 font-mono">scanned {worker?.scanned ?? "n/a"}</span>
          <span className="rounded-lg border border-current/15 px-3 py-2 font-mono">candidates {worker?.candidates ?? "n/a"}</span>
          <span className="rounded-lg border border-current/15 px-3 py-2 font-mono">inserted {worker?.inserted ?? "n/a"}</span>
          <span className="rounded-lg border border-current/15 px-3 py-2 font-mono">queued {diagnostics.delivery.queued}</span>
          <span className="rounded-lg border border-current/15 px-3 py-2 font-mono">sent {diagnostics.delivery.sent}</span>
        </div>
        {diagnostics.delivery.failed || diagnostics.delivery.recentError ? (
          <div className="mt-2 rounded-lg border border-current/15 px-3 py-2 text-xs">
            Failed {diagnostics.delivery.failed}. {diagnostics.delivery.recentError ?? "No recent error message."}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ZoneQualityPanel({ summary }: { summary: MomentumAlertOutcomeSummary }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#10151b] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionEyebrow className="text-teal-300">Zone quality</SectionEyebrow>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{summary.zoneQuality}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Outcome rule: first TP or invalidation touch within 72h. Same-candle TP/SL collisions are ambiguous and excluded from win rate.
          </p>
        </div>
        <div className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
          <MiniStat label="Wins" value={summary.wins.toString()} toneClass="text-emerald-300" />
          <MiniStat label="Losses" value={summary.losses.toString()} toneClass="text-rose-300" />
          <MiniStat label="Ambiguous" value={summary.ambiguous.toString()} toneClass="text-amber-300" />
          <MiniStat label="Open" value={summary.open.toString()} toneClass="text-zinc-300" />
          <MiniStat label="Median hit" value={formatDuration(summary.medianTimeToHitMs)} toneClass="text-zinc-100" />
          <MiniStat label="Avg MFE" value={formatPct(summary.averageMaxFavorablePct)} toneClass="text-emerald-300" />
          <MiniStat label="Avg MAE" value={formatPct(summary.averageMaxAdversePct)} toneClass="text-rose-300" />
          <MiniStat label="Evaluated" value={summary.evaluated.toString()} toneClass="text-zinc-100" />
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value, toneClass }: { label: string; value: string; toneClass: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-sm font-semibold", toneClass)}>{value}</div>
    </div>
  );
}

function StatusPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-teal-300" />
      <span className="uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <span className="font-mono text-zinc-300">{value}</span>
    </div>
  );
}

function StatCard({ label, value, helper, tooltip }: { label: string; value: string; helper: string; tooltip?: ReactNode }) {
  return (
    <div className="group relative bg-[#10151b] px-5 py-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        <span>{label}</span>
        {tooltip ? (
          <span
            tabIndex={0}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-zinc-500 outline-none transition hover:border-teal-500/40 hover:text-teal-300 focus:border-teal-500/50 focus:text-teal-300"
            aria-label={`${label} methodology`}
          >
            <Info className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-zinc-50">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
      {tooltip ? (
        <div className="pointer-events-none absolute right-4 top-full z-40 mt-2 hidden w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-xs text-zinc-300 shadow-2xl shadow-black/40 backdrop-blur group-hover:block group-focus-within:block">
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}

function HitRateTooltip({ summary }: { summary: MomentumAlertOutcomeSummary }) {
  const resolved = summary.wins + summary.losses;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-teal-300">Hit-rate methodology</div>
        <div className="mt-1 font-mono text-sm text-zinc-100">
          TP first / (TP first + SL first)
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniMethodStat label="Wins" value={summary.wins.toString()} tone="text-emerald-300" />
        <MiniMethodStat label="Losses" value={summary.losses.toString()} tone="text-rose-300" />
        <MiniMethodStat label="Sample" value={resolved.toString()} tone="text-zinc-100" />
      </div>
      <div className="space-y-2 leading-5 text-zinc-400">
        <div><span className="text-zinc-200">Window:</span> first TP or SL touch within 72h of the stored alert timestamp.</div>
        <div><span className="text-zinc-200">Data:</span> 1m Hyperliquid candles, exact alert price, exact alert time.</div>
        <div><span className="text-zinc-200">Excluded:</span> open alerts, invalid levels, no-candle rows, and same-candle TP/SL collisions.</div>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-[11px] text-zinc-400">
        Ambiguous: {summary.ambiguous} · Open: {summary.open} · Median hit: {formatDuration(summary.medianTimeToHitMs)}
      </div>
    </div>
  );
}

function MiniMethodStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-sm font-semibold", tone)}>{value}</div>
    </div>
  );
}

function MobileAlertCard({ alert }: { alert: MomentumAlert }) {
  const { openTicket } = useShadowBook();
  const direction = alert.payload?.direction === "short" ? "short" : "long";
  const positive = (alert.returnSinceAlertPct ?? 0) >= 0;
  const delivery = deliveryLabel(alert);
  return (
    <article className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-zinc-50">{alert.asset}</span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]",
                severityTone(alert.severity),
              )}
            >
              {alert.severity}
            </span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]",
                direction === "short"
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {direction}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {triggerLabel(alert.triggerKind)} · {formatEasternDateTime(alert.createdAt, true)}
          </div>
        </div>
        <div className={cn("font-mono text-sm font-semibold", positive ? "text-emerald-300" : "text-rose-300")}>
          {formatPct(alert.returnSinceAlertPct)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="label">Alert price</div>
          <div className="mt-1 font-mono text-sm text-zinc-100">{formatChartPrice(alert.alertPrice)}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="label">Current</div>
          <div className="mt-1 font-mono text-sm text-zinc-100">
            {alert.currentPrice == null ? "n/a" : formatChartPrice(alert.currentPrice)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="label">Momentum</div>
          <div className="mt-1 font-mono text-xs text-zinc-300">
            {formatPct(alert.return1hPct)} · {formatPct(alert.return4hPct)} · {formatPct(alert.return24hPct)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="label">Risk</div>
          <div className="mt-1 font-mono text-xs text-zinc-300">
            Inv {alert.invalidationPrice == null ? "n/a" : formatChartPrice(alert.invalidationPrice)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="label">Outcome</div>
          <div className={cn("mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]", outcomeTone(alert.outcome))}>
            {outcomeLabel(alert.outcome)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs leading-5 text-zinc-400">
        {alert.reason}
        <div className="mt-1 font-mono text-[11px] text-zinc-600">
          target {alert.targetPrice == null ? "n/a" : formatChartPrice(alert.targetPrice)}
          <span className="mx-1 text-zinc-800">·</span>
          {delivery}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            openTicket({
              asset: alert.asset,
              side: direction,
              entryPrice: alert.currentPrice ?? alert.alertPrice,
              stopPrice: alert.invalidationPrice,
              targetPrice: alert.targetPrice,
              source: "momentum_alert",
              sourceId: alert.id,
            })
          }
          className="inline-flex h-8 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs text-emerald-200"
        >
          <BookOpenCheck className="h-3.5 w-3.5" />
          Track paper
        </button>
        <Link href={alert.routeHref} className="inline-flex h-8 items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/10 px-3 text-xs text-teal-200">
          Open market <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function AlertCard({ alert }: { alert: MomentumAlert }) {
  const { openTicket } = useShadowBook();
  const positive = (alert.returnSinceAlertPct ?? 0) >= 0;
  const direction = alert.payload?.direction === "short" ? "short" : "long";
  const delivery = deliveryLabel(alert);
  return (
    <article className="grid min-w-[1280px] grid-cols-[92px_150px_120px_170px_170px_128px_128px_120px_minmax(220px,1fr)_190px] items-center border-b border-zinc-900 px-4 py-2.5 text-sm transition last:border-b-0 hover:bg-zinc-950/60">
      <div className="font-mono text-xs text-zinc-500">
        {new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(alert.createdAt))}
        <div className="mt-0.5 text-[10px] text-zinc-700">
          {new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            month: "short",
            day: "numeric",
          }).format(new Date(alert.createdAt))}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold text-zinc-50">{alert.asset}</span>
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]", severityTone(alert.severity))}>
            {alert.severity}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-zinc-600">{triggerLabel(alert.triggerKind)}</div>
      </div>

      <div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]",
            direction === "short"
              ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
          )}
        >
          {direction}
        </span>
      </div>

      <div className="font-mono text-xs text-zinc-300">
        <span className={cn((alert.return1hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(alert.return1hPct)}</span>
        <span className="text-zinc-700"> / </span>
        <span className={cn((alert.return4hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(alert.return4hPct)}</span>
        <span className="text-zinc-700"> / </span>
        <span className={cn((alert.return24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(alert.return24hPct)}</span>
        <div className="mt-0.5 text-[10px] text-zinc-600">1h / 4h / 24h</div>
      </div>

      <div className="font-mono text-xs text-zinc-300">
        <span>{formatPct(alert.openInterestChangePct)} OI</span>
        <span className="text-zinc-700"> · </span>
        <span>{alert.volumeVsBaseline == null ? "n/a" : `${alert.volumeVsBaseline.toFixed(1)}x`} vol</span>
        <div className="mt-0.5 text-[10px] text-zinc-600">funding {formatPct(alert.fundingApr)}</div>
      </div>

      <div className="font-mono text-xs text-zinc-200">
        {formatChartPrice(alert.alertPrice)}
        <div className="mt-0.5 text-[10px] text-zinc-600">inv {alert.invalidationPrice == null ? "n/a" : formatChartPrice(alert.invalidationPrice)}</div>
      </div>

      <div className="font-mono text-xs">
        <span className="text-zinc-200">{alert.currentPrice == null ? "n/a" : formatChartPrice(alert.currentPrice)}</span>
        <div className={cn("mt-0.5 text-[10px]", positive ? "text-emerald-300" : "text-rose-300")}>
          {formatPct(alert.returnSinceAlertPct)}
        </div>
      </div>

      <div>
        <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]", outcomeTone(alert.outcome))}>
          {outcomeLabel(alert.outcome)}
        </span>
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{formatDuration(alert.outcome?.timeToHitMs)}</div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-xs text-zinc-300" title={alert.reason}>{alert.reason}</div>
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
          target {alert.targetPrice == null ? "n/a" : formatChartPrice(alert.targetPrice)}
          <span className="mx-1 text-zinc-800">·</span>
          {delivery}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/70 text-zinc-500" title={delivery}>
          <Send className="h-3.5 w-3.5" />
        </span>
        <button
          onClick={() =>
            openTicket({
              asset: alert.asset,
              side: direction,
              entryPrice: alert.currentPrice ?? alert.alertPrice,
              stopPrice: alert.invalidationPrice,
              targetPrice: alert.targetPrice,
              source: "momentum_alert",
              sourceId: alert.id,
            })
          }
          className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-200 hover:bg-emerald-500/15"
        >
          <BookOpenCheck className="h-3 w-3" />
          Paper
        </button>
        <Link href={alert.routeHref} className="inline-flex h-7 items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 text-[11px] text-teal-200 hover:bg-teal-500/15">
          Market <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
