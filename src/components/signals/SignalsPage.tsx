"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CircleDot,
  Crosshair,
  Filter,
  FlaskConical,
  Gauge,
  Layers3,
  LineChart,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import SignalLabPanel from "@/components/signals/SignalLabPanel";
import { SectionEyebrow } from "@/components/trading-ui";
import { cn } from "@/lib/format";
import type {
  TerminalSignal,
  TerminalSignalFamily,
  TerminalSignalsResponse,
  TerminalSignalSeverity,
  TerminalSignalSide,
} from "@/types";

type FamilyFilter = TerminalSignalFamily | "all";
type SideFilter = TerminalSignalSide | "all";
type SeverityFilter = TerminalSignalSeverity | "all";

const FAMILY_OPTIONS: Array<{ key: FamilyFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "daily_setup", label: "Lab" },
  { key: "momentum_alert", label: "Momentum" },
  { key: "market_radar", label: "Radar" },
  { key: "reaction_zone", label: "Reaction" },
  { key: "top_mover", label: "Movers" },
  { key: "vault_operator", label: "Vaults" },
];

const SIDE_OPTIONS: Array<{ key: SideFilter; label: string }> = [
  { key: "all", label: "All sides" },
  { key: "long", label: "Long" },
  { key: "short", label: "Short" },
  { key: "watch", label: "Watch" },
];

const SEVERITY_OPTIONS: Array<{ key: SeverityFilter; label: string }> = [
  { key: "all", label: "All grades" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

const FAMILY_ICON: Record<TerminalSignalFamily, LucideIcon> = {
  daily_setup: FlaskConical,
  momentum_alert: Crosshair,
  market_radar: Gauge,
  reaction_zone: Layers3,
  top_mover: LineChart,
  vault_operator: BookOpenCheck,
};

function familyLabel(family: TerminalSignalFamily) {
  switch (family) {
    case "daily_setup":
      return "Lab";
    case "momentum_alert":
      return "Momentum";
    case "market_radar":
      return "Radar";
    case "reaction_zone":
      return "Reaction";
    case "top_mover":
      return "Mover";
    case "vault_operator":
      return "Vault";
  }
}

function ageLabel(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "latest";
  const minutes = Math.max(0, ms / 60_000);
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function severityClasses(severity: TerminalSignalSeverity) {
  if (severity === "high") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (severity === "medium") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-zinc-800 bg-zinc-950/75 text-zinc-400";
}

function sideClasses(side: TerminalSignalSide) {
  if (side === "long") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (side === "short") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  if (side === "watch") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  return "border-zinc-800 bg-zinc-950/75 text-zinc-400";
}

function metricToneClasses(tone: TerminalSignal["metrics"][number]["tone"]) {
  if (tone === "positive") return "text-emerald-300";
  if (tone === "negative") return "text-rose-300";
  if (tone === "warning") return "text-amber-300";
  if (tone === "info") return "text-sky-300";
  return "text-zinc-100";
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition",
        active
          ? "border-teal-300/30 bg-teal-300/12 text-teal-100"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200",
      )}
    >
      {label}
    </button>
  );
}

function SignalCard({
  signal,
  active,
  onSelect,
}: {
  signal: TerminalSignal;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = FAMILY_ICON[signal.family];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-[#0b1016] p-3 text-left transition hover:border-teal-300/25 hover:bg-[#0e151d]",
        active ? "border-teal-300/35 shadow-[0_0_0_1px_rgba(45,212,191,0.08)]" : "border-zinc-800",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-teal-300/85">
              <Icon className="h-3.5 w-3.5" />
              {familyLabel(signal.family)}
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em]", severityClasses(signal.severity))}>
              {signal.severity}
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em]", sideClasses(signal.side))}>
              {signal.side}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-zinc-100">{signal.title}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{signal.summary}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xs text-zinc-300">{signal.asset ?? "VAULT"}</div>
          <div className="mt-1 font-mono text-[10px] text-zinc-600">{ageLabel(signal.freshnessMs)}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {signal.metrics.slice(0, 3).map((metric) => (
          <div key={`${signal.id}-${metric.label}`} className="rounded-lg border border-zinc-800 bg-zinc-950/55 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{metric.label}</div>
            <div className={cn("mt-1 truncate font-mono text-xs", metricToneClasses(metric.tone))}>{metric.value}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

function SignalDetail({ signal, onClose }: { signal: TerminalSignal | null; onClose?: () => void }) {
  if (!signal) {
    return (
      <aside className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-500">
        Pick a setup. Check the trigger, the invalidation, and why it earned a flag.
      </aside>
    );
  }

  const Icon = FAMILY_ICON[signal.family];
  return (
    <aside className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1016]">
      <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_34%),#0b1016] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-teal-300">
              <Icon className="h-3.5 w-3.5" />
              {familyLabel(signal.family)}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">{signal.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{signal.summary}</p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2 text-zinc-500 transition hover:text-zinc-100"
              aria-label="Close signal detail"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Pill label="Side" value={signal.side} className={sideClasses(signal.side)} />
          <Pill label="Grade" value={signal.severity} className={severityClasses(signal.severity)} />
          <Pill label="Read" value={signal.confidence} />
          <Pill label="Freshness" value={ageLabel(signal.freshnessMs)} />
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
          <SectionEyebrow>Metrics</SectionEyebrow>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {signal.metrics.map((metric) => (
              <div key={`${signal.id}-detail-${metric.label}`} className="rounded-lg border border-zinc-800 bg-[#0a0f14] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{metric.label}</div>
                <div className={cn("mt-1 font-mono text-sm", metricToneClasses(metric.tone))}>{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
          <SectionEyebrow>Evidence</SectionEyebrow>
          <div className="mt-3 space-y-2">
            {signal.evidence.slice(0, 5).map((item, index) => (
              <div key={`${signal.id}-evidence-${index}`} className="flex gap-2 text-sm leading-6 text-zinc-300">
                <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-teal-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {signal.sourceCaveat ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.08] p-3 text-xs leading-5 text-amber-100/80">
            <div className="mb-1 flex items-center gap-2 font-medium text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              How to use it
            </div>
            {signal.sourceCaveat}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={signal.routeHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/75 px-3 text-sm font-medium text-zinc-100 transition hover:border-teal-300/35"
          >
            Open context
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          {signal.paperTradeHref ? (
            <Link
              href={signal.paperTradeHref}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 text-sm font-medium text-teal-100 transition hover:border-teal-200/45"
            >
              Paper trade
              <BookOpenCheck className="h-4 w-4" />
            </Link>
          ) : (
            <div className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 text-sm text-zinc-600">
              No paper trade
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Pill({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-950/55 px-3 py-2", className)}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-xs text-zinc-100">{value}</div>
    </div>
  );
}

function StatTile({ label, value, helper, tone = "neutral" }: { label: string; value: string; helper: string; tone?: "neutral" | "green" | "amber" | "sky" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-2 font-mono text-2xl",
          tone === "green" && "text-emerald-300",
          tone === "amber" && "text-amber-300",
          tone === "sky" && "text-sky-300",
          tone === "neutral" && "text-zinc-100",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

export default function SignalsPage() {
  const [data, setData] = useState<TerminalSignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      setError(null);
      const response = await fetch("/api/signals?limit=80");
      if (!response.ok) throw new Error(`Unable to load Intel feed (${response.status})`);
      const payload = (await response.json()) as TerminalSignalsResponse;
      setData(payload);
      setSelectedId((current) => current ?? payload.signals[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Intel feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.signals ?? []).filter((signal) => {
      if (family !== "all" && signal.family !== family) return false;
      if (side !== "all" && signal.side !== side) return false;
      if (severity !== "all" && signal.severity !== severity) return false;
      if (!needle) return true;
      return `${signal.asset ?? ""} ${signal.title} ${signal.summary} ${signal.source}`.toLowerCase().includes(needle);
    });
  }, [data?.signals, family, query, severity, side]);

  const selected = filtered.find((signal) => signal.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-5">
      <SignalLabPanel />

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#10151b]">
        <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_28%),#10151b] px-4 py-4 md:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <SectionEyebrow className="text-teal-300">Intel</SectionEyebrow>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
                Setup board.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Daily setup, momentum flags, reaction levels, movers, and wallet reads ranked in one place.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                Sources {data?.sources.length ?? 0}
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-800 md:grid-cols-4">
          <StatTile label="Live flags" value={String(data?.summary.total ?? (loading ? "—" : 0))} helper="filtered and ranked" tone="green" />
          <StatTile label="High grade" value={String(data?.summary.highSeverity ?? "—")} helper="review these first" tone="amber" />
          <StatTile label="Alert hit rate" value={data?.summary.alertWinRatePct == null ? "n/a" : `${data.summary.alertWinRatePct.toFixed(0)}%`} helper="TP/SL outcomes" tone="sky" />
          <StatTile label="Vaults" value={String(data?.summary.vaultCount ?? "—")} helper="wallets worth watching" />
        </div>
      </section>

      {data?.warnings.length ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100/80">
          Partial Intel refresh: {data.warnings.slice(0, 3).join(" ")}
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-zinc-800 bg-[#0b0f14] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 xl:w-[340px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search asset, vault, source..."
              className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950/75 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-300/40"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-600" />
            {FAMILY_OPTIONS.map((option) => (
              <FilterButton key={option.key} active={family === option.key} label={option.label} onClick={() => setFamily(option.key)} />
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SIDE_OPTIONS.map((option) => (
            <FilterButton key={option.key} active={side === option.key} label={option.label} onClick={() => setSide(option.key)} />
          ))}
          {SEVERITY_OPTIONS.map((option) => (
            <FilterButton key={option.key} active={severity === option.key} label={option.label} onClick={() => setSeverity(option.key)} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-start">
        <section className="space-y-2">
          {loading && !data ? (
            Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-32 rounded-xl" />)
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-12 text-center text-sm text-zinc-500">
              Nothing matches this view.
            </div>
          ) : (
            filtered.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                active={selected?.id === signal.id}
                onSelect={() => setSelectedId(signal.id)}
              />
            ))
          )}
        </section>

        <div className="sticky top-40">
          <SignalDetail signal={selected} />
        </div>
      </div>
    </div>
  );
}
