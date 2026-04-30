"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import type { MarketRadarSignal } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type RadarResponse = {
  signals: MarketRadarSignal[];
  generatedAt: number;
  source: string;
  factorsIncluded: boolean;
};

function signalTone(severity: MarketRadarSignal["severity"]) {
  if (severity === "high") return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  if (severity === "medium") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-zinc-800 bg-zinc-950/70 text-zinc-400";
}

function kindLabel(kind: MarketRadarSignal["kind"]) {
  switch (kind) {
    case "strongest_asset":
      return "Strength";
    case "weakest_asset":
      return "Weakness";
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

export default function MarketRadarPanel({ variant = "compact" }: { variant?: "compact" | "hero" }) {
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
  const signals = data?.signals.slice(0, hero ? 4 : 5) ?? [];

  if (hero) {
    return (
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#13171f]">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionEyebrow className="text-teal-300">Market Radar v1</SectionEyebrow>
            <div className="mt-1 text-sm font-medium text-zinc-100">Quick context before the directory</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              Live strength, weakness, and funding crowding from Hyperliquid.
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {data?.source === "market-plus-tracked-flow" ? "Market + tracked flow" : "Market-only scan"}
          </div>
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          {signals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500 md:col-span-2 xl:col-span-4">
              Radar is warming up. HyperPulse will show the strongest liquid perp, weakest liquid perp, crowded longs, and paid shorts here.
            </div>
          ) : (
            signals.map((signal) => (
              <Link
                key={signal.id}
                href={signal.routeHref}
                className="group rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal.severity))}>
                    {kindLabel(signal.kind)}
                  </span>
                  <span className="font-mono text-xs text-zinc-100">{signal.value}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-semibold tracking-tight text-zinc-100">{signal.asset}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{signal.label}</div>
                  </div>
                  <div className="text-[11px] font-medium text-teal-300 opacity-70 transition group-hover:opacity-100">Open</div>
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
            {data?.source === "market-plus-tracked-flow" ? "Market + tracked flow" : "Market-only scan"}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
            Radar is warming up. HyperPulse will show strength, weakness, funding crowding, and tracked-flow context here.
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
                    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal.severity))}>
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
