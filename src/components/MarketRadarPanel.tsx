"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import { formatEasternTime } from "@/lib/time";
import type { MarketRadarSignal } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type RadarResponse = {
  signals: MarketRadarSignal[];
  generatedAt: number;
  source: string;
  factorsIncluded: boolean;
};

function sourceLabel(source: string | undefined) {
  if (source === "quant-radar-plus-tracked-flow") return "Quant edge + tracked flow";
  if (source === "quant-radar") return "Quant relative-strength scan";
  if (source === "market-plus-tracked-flow") return "Market + tracked flow";
  return "Market-only scan";
}

function signalTone(signal: MarketRadarSignal) {
  if (signal.kind === "strongest_asset") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (signal.kind === "weakest_asset") return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  if (signal.kind === "crowded_long") return "border-orange-500/25 bg-orange-500/10 text-orange-300";
  if (signal.kind === "crowded_short") return "border-sky-500/25 bg-sky-500/10 text-sky-300";
  if (signal.severity === "high") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  if (signal.severity === "medium") return "border-zinc-700 bg-zinc-950/70 text-zinc-300";
  return "border-zinc-800 bg-zinc-950/70 text-zinc-400";
}

function kindLabel(kind: MarketRadarSignal["kind"]) {
  switch (kind) {
    case "strongest_asset":
      return "Long bias";
    case "weakest_asset":
      return "Short bias";
    case "crowded_long":
      return "Crowded long";
    case "crowded_short":
      return "Crowded short";
    case "liquidation_pressure":
      return "Liquidation";
    case "whale_flow":
      return "Whale flow";
    case "factor_confirmation":
      return "Factor";
    default:
      return kind;
  }
}

function formatRadarTime(time: number | undefined): string {
  if (!time || !Number.isFinite(time)) return "waiting";
  return formatEasternTime(time, true);
}

const radarMethodology = [
  "Liquidity gate: >=$10M OI and >=$20M 24h volume.",
  "Shows both long momentum and relative short/laggard candidates.",
  "Adds volume/OI participation, then penalizes overcrowded funding.",
];

function RadarMiniRow({ signal }: { signal: MarketRadarSignal }) {
  return (
    <Link
      href={signal.routeHref}
      className="group block rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-100">{signal.asset}</span>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]", signalTone(signal))}>
              {signal.severity}
            </span>
          </div>
          <div className="mt-1 truncate text-[10px] text-zinc-500">{signal.evidence[0]}</div>
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-zinc-100">{signal.value}</div>
      </div>
    </Link>
  );
}

export default function MarketRadarPanel({ variant = "compact" }: { variant?: "compact" | "hero" | "rail" }) {
  const [data, setData] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/market/radar", { cache: "no-store" });
        if (!response.ok) return;
        const nextData = (await response.json()) as RadarResponse;
        if (mounted) setData(nextData);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = window.setInterval(load, 120_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const hero = variant === "hero";
  const allSignals = data?.signals ?? [];
  const longSignals = allSignals.filter((signal) => signal.kind === "strongest_asset").slice(0, 3);
  const shortSignals = allSignals.filter((signal) => signal.kind === "weakest_asset").slice(0, 3);
  const contextSignals = allSignals.filter((signal) => signal.kind !== "strongest_asset" && signal.kind !== "weakest_asset").slice(0, hero ? 2 : 1);
  const signals = [...longSignals, ...shortSignals, ...contextSignals].slice(0, hero ? 8 : 7);

  if (variant === "rail") {
    const topLong = longSignals[0];
    const topShort = shortSignals[0];

    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionEyebrow>Momentum</SectionEyebrow>
            <div className="mt-1 text-sm font-medium text-zinc-100">Leaders / laggards</div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-600">2m scan · {formatRadarTime(data?.generatedAt)}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          </div>
        </div>

        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
            Radar is warming up.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={topLong?.routeHref ?? "/markets"}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 transition hover:border-emerald-400/35"
              >
                <div className="text-[9px] uppercase tracking-[0.14em] text-emerald-300/80">Running</div>
                <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">{topLong?.asset ?? "—"}</div>
                <div className="mt-1 truncate font-mono text-xs text-emerald-300">{topLong?.value ?? "waiting"}</div>
              </Link>
              <Link
                href={topShort?.routeHref ?? "/markets"}
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 transition hover:border-rose-400/35"
              >
                <div className="text-[9px] uppercase tracking-[0.14em] text-rose-300/80">Lagging</div>
                <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">{topShort?.asset ?? "—"}</div>
                <div className="mt-1 truncate font-mono text-xs text-rose-300">{topShort?.value ?? "waiting"}</div>
              </Link>
            </div>

            <div>
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">Long momentum</div>
              <div className="space-y-1.5">
                {longSignals.length > 0 ? longSignals.map((signal) => <RadarMiniRow key={signal.id} signal={signal} />) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] text-zinc-500">No qualified long edge.</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">Short momentum</div>
              <div className="space-y-1.5">
                {shortSignals.length > 0 ? shortSignals.map((signal) => <RadarMiniRow key={signal.id} signal={signal} />) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] text-zinc-500">No qualified short edge.</div>
                )}
              </div>
            </div>

            {contextSignals[0] ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(contextSignals[0]))}>
                    {kindLabel(contextSignals[0].kind)}
                  </span>
                  <span className="font-mono text-xs text-zinc-100">{contextSignals[0].asset}</span>
                </div>
                <div className="mt-1 truncate text-[10px] text-zinc-500">{contextSignals[0].evidence[0]}</div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    );
  }

  if (hero) {
    return (
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#13171f]">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionEyebrow className="text-teal-300">Market Radar v1</SectionEyebrow>
            <div className="mt-1 text-sm font-medium text-zinc-100">Quick context before the directory</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              Momentum Edge is not raw 24h green. It scans liquid Hyperliquid perps for BTC-adjusted and basket-adjusted
              relative strength, then checks participation and funding crowding. Refreshes every 2m.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {sourceLabel(data?.source)}
            </div>
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 font-mono text-zinc-500">
              Updated {formatRadarTime(data?.generatedAt)}
            </div>
          </div>
        </div>

        <div className="grid gap-2 border-b border-zinc-800 bg-zinc-950/30 px-3 py-2 text-[11px] leading-5 text-zinc-500 md:grid-cols-3">
          {radarMethodology.map((item) => (
            <div key={item} className="rounded-xl border border-zinc-800/80 bg-zinc-950/45 px-3 py-2">
              {item}
            </div>
          ))}
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          {signals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500 md:col-span-2 xl:col-span-4">
              Radar is warming up. HyperPulse will show qualified long momentum, short momentum, crowded longs, and paid shorts here.
            </div>
          ) : (
            signals.map((signal) => (
              <Link
                key={signal.id}
                href={signal.routeHref}
                className="group rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal))}>
                    {kindLabel(signal.kind)}
                  </span>
                  <span className="font-mono text-xs text-zinc-100">{signal.value}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-semibold tracking-tight text-zinc-100">{signal.asset}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{signal.label}</div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionEyebrow>Market Radar</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">What stands out now</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {sourceLabel(data?.source)} · refreshes every 2m
          </div>
          <div className="mt-1 max-w-[260px] text-[10px] leading-4 text-zinc-600">
            Liquidity-gated relative strength: BTC residual, basket residual, participation, funding penalty.
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">Updated {formatRadarTime(data?.generatedAt)}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
            Radar is warming up. HyperPulse will show long bias, short bias, funding crowding, and tracked-flow context here.
          </div>
        ) : (
          signals.map((signal) => (
            <Link
              key={signal.id}
              href={signal.routeHref}
              className="block rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-zinc-700 hover:bg-zinc-950/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-zinc-100">{signal.asset}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal))}>
                      {kindLabel(signal.kind)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-400">{signal.label}</div>
                  <div className="mt-1 truncate text-[11px] text-zinc-600">{signal.evidence[0]}</div>
                </div>
                <div className="font-mono text-sm text-zinc-100">{signal.value}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
