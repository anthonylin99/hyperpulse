"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Gauge, Landmark, RefreshCcw } from "lucide-react";
import PriceChart from "@/components/PriceChart";
import { CompactStat, FilterChip, SectionEyebrow, SurfaceButton } from "@/components/trading-ui";
import { useMarket } from "@/context/MarketContext";
import { cn, formatCompactUsd, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import type { HypeFundamentalsContext } from "@/lib/hypeFundamentals";

type HypeView = "overview" | "levels" | "fundamentals";

const VIEW_OPTIONS: Array<{ key: HypeView; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "levels", label: "Levels" },
  { key: "fundamentals", label: "Fundamentals" },
];

export default function HypeTokenRoutePage() {
  const { assets, loading, error, fundingHistories, lastUpdated } = useMarket();
  const [view, setView] = useState<HypeView>("overview");
  const [fundamentals, setFundamentals] = useState<HypeFundamentalsContext | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);
  const hype = useMemo(() => assets.find((asset) => asset.coin === "HYPE") ?? null, [assets]);
  const fundingHistory = fundingHistories.HYPE ?? [];

  async function fetchFundamentals() {
    setFundamentalsLoading(true);
    setFundamentalsError(null);
    try {
      const response = await fetch("/api/hype/fundamentals");
      if (!response.ok) throw new Error("HYPE fundamentals unavailable.");
      setFundamentals((await response.json()) as HypeFundamentalsContext);
    } catch (err) {
      setFundamentalsError(err instanceof Error ? err.message : "HYPE fundamentals unavailable.");
    } finally {
      setFundamentalsLoading(false);
    }
  }

  useEffect(() => {
    fetchFundamentals();
  }, []);

  const priceDecimals = hype && hype.markPx >= 100 ? 2 : 3;
  const priceTone = hype == null || hype.priceChange24h === 0
    ? "text-zinc-100"
    : hype.priceChange24h > 0
      ? "text-emerald-300"
      : "text-red-300";
  const confidenceTone =
    fundamentals?.confidenceAdjustment === "raise"
      ? "green"
      : fundamentals?.confidenceAdjustment === "lower"
        ? "amber"
        : "neutral";

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 px-1 py-2">
      <section className="rounded-lg border border-teal-300/15 bg-[linear-gradient(180deg,rgba(8,18,20,0.98),rgba(7,10,14,0.98))] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-teal-200">
              <Landmark className="h-3.5 w-3.5" />
              Hyperliquid Token Portfolio
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 md:text-6xl">HYPE</h1>
              <div className={cn("pb-1 font-mono text-2xl font-semibold", priceTone)}>
                {hype ? formatUSD(hype.markPx, priceDecimals) : loading ? "Loading" : "n/a"}
              </div>
              {hype ? (
                <div className={cn("mb-1 rounded-full border px-2.5 py-1 font-mono text-xs", hype.priceChange24h >= 0 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-200")}>
                  {formatPct(hype.priceChange24h)} 24h
                </div>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              A HYPE-only trading workspace for token levels, exchange-usage proxies, funding pressure, and live Hyperliquid market structure.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
            <HeroMetric label="Open interest" value={hype ? formatCompactUsd(hype.openInterest) : "n/a"} />
            <HeroMetric label="24h volume" value={hype ? formatCompactUsd(hype.dayVolume) : "n/a"} />
            <HeroMetric label="Funding APR" value={hype ? formatFundingAPR(hype.fundingAPR) : "n/a"} />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Market data is retrying: {error}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((option) => (
              <FilterChip
                key={option.key}
                label={option.label}
                active={view === option.key}
                onClick={() => setView(option.key)}
                className="py-2 text-xs"
              />
            ))}
          </div>

          {view === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <CompactStat
                label="Fundamental regime"
                value={fundamentals ? regimeLabel(fundamentals.regime) : fundamentalsLoading ? "Loading" : "n/a"}
                helper={fundamentals?.decisionLabel ?? "Uses Hyperliquid public stats and live perp context."}
                tone={confidenceTone}
              />
              <CompactStat
                label="Level bias"
                value={fundamentals ? levelBiasLabel(fundamentals.levelBias) : "n/a"}
                helper="Changes confidence around chart levels, not execution."
                tone={confidenceTone}
              />
              <CompactStat
                label="Data freshness"
                value={fundamentals?.statsStale ? "History stale" : fundamentals ? "History live" : "n/a"}
                helper={fundamentals?.latestStatsAt ? new Date(fundamentals.latestStatsAt).toLocaleDateString() : "Live market context still updates."}
                tone={fundamentals?.statsStale ? "amber" : "neutral"}
              />
            </div>
          ) : null}

          {view === "levels" || view === "overview" ? (
            <PriceChart coin="HYPE" marketType="perp" />
          ) : null}

          {view === "fundamentals" ? (
            <HypeFundamentalAudit
              fundamentals={fundamentals}
              loading={fundamentalsLoading}
              error={fundamentalsError}
              onRefresh={fetchFundamentals}
            />
          ) : null}
        </main>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>Token Tape</SectionEyebrow>
              <span className="font-mono text-[11px] text-zinc-600">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "syncing"}
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              <SideMetric icon={Activity} label="24h move" value={hype ? formatPct(hype.priceChange24h) : "n/a"} />
              <SideMetric icon={Gauge} label="Max leverage" value={hype ? `${hype.maxLeverage}x` : "n/a"} />
              <SideMetric icon={BarChart3} label="OI tick" value={hype?.oiChangePct == null ? "n/a" : formatPct(hype.oiChangePct)} />
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>Fundamental Read</SectionEyebrow>
              <SurfaceButton size="sm" tone="ghost" onClick={fetchFundamentals} disabled={fundamentalsLoading} aria-label="Refresh HYPE fundamentals">
                <RefreshCcw className={cn("h-3.5 w-3.5", fundamentalsLoading && "animate-spin")} />
              </SurfaceButton>
            </div>
            <div className="mt-3 text-sm font-semibold text-zinc-100">
              {fundamentals?.decisionLabel ?? (fundamentalsLoading ? "Loading HYPE context" : "Context unavailable")}
            </div>
            <div className="mt-3 space-y-2">
              {(fundamentals?.evidence ?? []).slice(0, 4).map((item) => (
                <div key={item} className="rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs leading-5 text-zinc-400">
                  {item}
                </div>
              ))}
              {fundamentalsError ? (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {fundamentalsError}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <SectionEyebrow>Funding Snapshot</SectionEyebrow>
            <div className="mt-3 text-xs leading-5 text-zinc-500">
              {fundingHistory.length > 0
                ? `${fundingHistory.length} recent HYPE funding samples loaded for the portfolio view.`
                : "Funding history will populate as the market enrichment worker refreshes."}
            </div>
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs leading-5 text-zinc-400">
              Treat funding as crowding context. HYPE levels still need price acceptance, rejection, or failed breakout confirmation.
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function HypeFundamentalAudit({
  fundamentals,
  loading,
  error,
  onRefresh,
}: {
  fundamentals: HypeFundamentalsContext | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <SectionEyebrow>Fundamentals Audit</SectionEyebrow>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">HYPE regime inputs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            These inputs help decide whether to trust or fade HYPE reaction levels. They are not a standalone trade trigger.
          </p>
        </div>
        <SurfaceButton size="sm" tone="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </SurfaceButton>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AuditMetric label="7d HYPE volume" value={formatCompactUsd(fundamentals?.metrics.volume7dUsd)} helper={`Share ${formatPct(fundamentals?.metrics.volumeShare7dPct)}`} />
        <AuditMetric label="30d HYPE volume" value={formatCompactUsd(fundamentals?.metrics.volume30dUsd)} helper={`Share ${formatPct(fundamentals?.metrics.volumeShare30dPct)}`} />
        <AuditMetric label="Live OI" value={formatCompactUsd(fundamentals?.metrics.liveOpenInterestUsd)} helper={`7d OI ${formatPct(fundamentals?.metrics.openInterest7dChangePct)}`} />
        <AuditMetric label="Live funding APR" value={formatPct(fundamentals?.metrics.liveFundingApr)} helper={`30d avg ${formatPct(fundamentals?.metrics.funding30dAvgApr)}`} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {(fundamentals?.caveats ?? []).map((item) => (
          <div key={item} className="rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs leading-5 text-zinc-500">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function SideMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-teal-300" />
        {label}
      </div>
      <div className="font-mono text-xs text-zinc-100">{value}</div>
    </div>
  );
}

function AuditMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-2 font-mono text-base font-semibold text-zinc-100">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

function regimeLabel(value: HypeFundamentalsContext["regime"]) {
  if (value === "expanding") return "Usage expanding";
  if (value === "cooling") return "Usage cooling";
  if (value === "mixed") return "Mixed";
  return "Unknown";
}

function levelBiasLabel(value: HypeFundamentalsContext["levelBias"]) {
  if (value === "support_bid") return "Support bid";
  if (value === "breakout_confirm") return "Breakout confirm";
  if (value === "resistance_fade") return "Resistance fade";
  if (value === "mean_revert") return "Mean revert";
  return "Neutral";
}
