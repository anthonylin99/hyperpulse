"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Clock3, ExternalLink, Radio, RefreshCw, Send, type LucideIcon } from "lucide-react";
import { cn, formatChartPrice } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { MomentumAlert } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type AlertsResponse = {
  alerts: MomentumAlert[];
  generatedAt: number;
  worker: { updatedAt: number | null; status: string; message: string | null } | null;
  source: string;
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

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setError(null);
        const response = await fetch("/api/alerts/momentum", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load alerts");
        const payload = (await response.json()) as AlertsResponse;
        if (mounted) setData(payload);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load alerts");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const alerts = useMemo(() => data?.alerts ?? [], [data?.alerts]);
  const stats = useMemo(() => {
    const last24h = alerts.filter((alert) => alert.createdAt >= Date.now() - 24 * 60 * 60 * 1000);
    const winners = alerts.filter((alert) => (alert.returnSinceAlertPct ?? 0) > 0).length;
    return {
      last24h: last24h.length,
      stored: alerts.length,
      hitRate: alerts.length > 0 ? (winners / alerts.length) * 100 : null,
    };
  }, [alerts]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-[#10151b]">
        <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.13),transparent_34%),#10151b] px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionEyebrow className="text-teal-300">Alerts</SectionEyebrow>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
                Momentum runners, captured at the moment HyperPulse noticed.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Selective alerts for liquid Hyperliquid perps. Every event stores the alert price and timestamp so we can judge whether the signal worked after the fact.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill icon={Radio} label={data?.worker?.status ?? (loading ? "loading" : "idle")} value={data?.worker?.updatedAt ? formatEasternDateTime(data.worker.updatedAt, true) : "No worker run"} />
              <StatusPill icon={RefreshCw} label="Refresh" value="60s" />
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-zinc-800 md:grid-cols-3">
          <StatCard label="Alerts 24h" value={stats.last24h.toString()} helper="hard capped at 3/day" />
          <StatCard label="Stored alerts" value={stats.stored.toString()} helper="reviewable snapshots" />
          <StatCard label="Hit rate" value={stats.hitRate == null ? "n/a" : `${stats.hitRate.toFixed(0)}%`} helper="positive since alert" />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <section className="rounded-3xl border border-zinc-800 bg-[#0b0f14]">
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
            <div className="mt-2 text-sm text-zinc-500">When the worker spots a selective liquid-perp momentum setup, it will appear here with the exact alert price.</div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>
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

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="bg-[#10151b] px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-zinc-50">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

function AlertCard({ alert }: { alert: MomentumAlert }) {
  const positive = (alert.returnSinceAlertPct ?? 0) >= 0;
  return (
    <article className="grid gap-4 px-4 py-4 transition hover:bg-zinc-950/40 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xl font-semibold text-zinc-50">{alert.asset}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]", severityTone(alert.severity))}>{alert.severity}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <Clock3 className="h-3.5 w-3.5" />
          {formatEasternDateTime(alert.createdAt, true)}
        </div>
        <div className="mt-2 text-[11px] text-zinc-600">{triggerLabel(alert.triggerKind)}</div>
      </div>

      <div className="min-w-0">
        <div className="text-sm leading-6 text-zinc-300">{alert.reason}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Metric label="1h / 4h / 24h" value={`${formatPct(alert.return1hPct)} · ${formatPct(alert.return4hPct)} · ${formatPct(alert.return24hPct)}`} />
          <Metric label="OI / volume" value={`${formatPct(alert.openInterestChangePct)} OI · ${alert.volumeVsBaseline == null ? "n/a" : `${alert.volumeVsBaseline.toFixed(1)}x`} vol`} />
          <Metric label="Funding" value={formatPct(alert.fundingApr)} />
        </div>
      </div>

      <div className="space-y-2 lg:text-right">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <Metric label="Alert price" value={formatChartPrice(alert.alertPrice)} />
          <Metric label="Current" value={alert.currentPrice == null ? "n/a" : formatChartPrice(alert.currentPrice)} tone={positive ? "green" : "red"} helper={formatPct(alert.returnSinceAlertPct)} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-left lg:text-right">
          <Metric label="Invalid" value={alert.invalidationPrice == null ? "n/a" : formatChartPrice(alert.invalidationPrice)} />
          <Metric label="Target" value={alert.targetPrice == null ? "n/a" : formatChartPrice(alert.targetPrice)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
            <Send className="h-3 w-3" /> {deliveryLabel(alert)}
          </span>
          <Link href={alert.routeHref} className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-1 text-[11px] text-teal-200 hover:bg-teal-500/15">
            Open market <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, helper, tone = "neutral" }: { label: string; value: string; helper?: string; tone?: "neutral" | "green" | "red" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-sm text-zinc-100", tone === "green" && "text-emerald-300", tone === "red" && "text-rose-300")}>{value}</div>
      {helper ? <div className={cn("mt-0.5 font-mono text-[11px]", helper.startsWith("+") ? "text-emerald-300" : helper.startsWith("-") ? "text-rose-300" : "text-zinc-500")}>{helper}</div> : null}
    </div>
  );
}
