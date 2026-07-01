"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Crosshair, Gauge, Landmark, RefreshCcw, ShieldAlert, Target } from "lucide-react";
import PriceChart from "@/components/PriceChart";
import { FilterChip, SectionEyebrow, SurfaceButton } from "@/components/trading-ui";
import { useMarket } from "@/context/MarketContext";
import { cn, formatCompactUsd, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import type { HypeFundamentalsContext } from "@/lib/hypeFundamentals";

type HypeView = "overview" | "levels" | "fundamentals";

const VIEW_OPTIONS: Array<{ key: HypeView; label: string }> = [
  { key: "overview", label: "Trade plan" },
  { key: "levels", label: "Levels" },
  { key: "fundamentals", label: "Fundamentals" },
];

type HypeLevelPlan = {
  bias: string;
  plan: string;
  risk: string;
  levels: Array<{
    label: string;
    price: number;
    role: "trigger" | "target" | "support" | "invalid" | "risk";
    note: string;
  }>;
};

function roundLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) return Number(value.toFixed(1));
  return Number(value.toFixed(2));
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000) return formatUSD(value, 0);
  if (value >= 100) return formatUSD(value, 2);
  return formatUSD(value, 2);
}

function deriveHypeLevelPlan(args: {
  mark: number | null;
  priceChange24h: number | null;
  oiChangePct: number | null;
  fundingApr: number | null;
  levelBias?: HypeFundamentalsContext["levelBias"];
}): HypeLevelPlan {
  const mark = args.mark && Number.isFinite(args.mark) && args.mark > 0 ? args.mark : 64;
  const momentumUp = (args.priceChange24h ?? 0) > 0.4;
  const oiExpanding = (args.oiChangePct ?? 0) > 1;
  const fundingHot = Math.abs(args.fundingApr ?? 0) >= 20;
  const breakoutBias = args.levelBias === "breakout_confirm" || (momentumUp && oiExpanding);
  const supportBias = args.levelBias === "support_bid";
  const fadeBias = args.levelBias === "resistance_fade" || args.levelBias === "mean_revert";

  const reclaim = roundLevel(mark * 1.012);
  const breakout = roundLevel(mark * 1.035);
  const target = roundLevel(mark * 1.065);
  const stretch = Math.max(roundLevel(mark * 1.105), 77);
  const support = roundLevel(mark * 0.978);
  const invalid = roundLevel(mark * 0.955);
  const flush = roundLevel(mark * 0.925);

  const bias = breakoutBias
    ? "Breakout bias, but only above reclaim"
    : supportBias
      ? "Support bid if the low holds"
      : fadeBias
        ? "Fade rallies until reclaim"
        : "Range trade until a level breaks";

  const plan = breakoutBias
    ? `Long only after ${formatPrice(reclaim)} reclaims and holds. First target ${formatPrice(breakout)}, then ${formatPrice(target)}.`
    : supportBias
      ? `Buy defense near ${formatPrice(support)} only if price rejects lower. No defense, no long.`
      : fadeBias
        ? `Avoid chasing. Failed reclaim near ${formatPrice(reclaim)} is the short-term fade area.`
        : `Let HYPE choose. Long above ${formatPrice(reclaim)}; defensive below ${formatPrice(support)}.`;

  const risk = fundingHot
    ? `Funding is stretched. Keep size smaller and do not add if ${formatPrice(invalid)} breaks.`
    : `Hard invalidation sits near ${formatPrice(invalid)}. Below that, wait for ${formatPrice(flush)} or a fresh reclaim.`;

  return {
    bias,
    plan,
    risk,
    levels: [
      { label: "Reclaim trigger", price: reclaim, role: "trigger", note: "Longs need acceptance above this." },
      { label: "Breakout target", price: breakout, role: "target", note: "First upside checkpoint." },
      { label: "Profit zone", price: target, role: "target", note: "Trim if momentum stalls here." },
      { label: "ATH / price discovery", price: stretch, role: "target", note: "Unload or trail if flow cools." },
      { label: "Support to defend", price: support, role: "support", note: "Lose this and longs are on defense." },
      { label: "Hard invalidation", price: invalid, role: "invalid", note: "No adding below this line." },
      { label: "Flush watch", price: flush, role: "risk", note: "Next area to look for forced selling to exhaust." },
    ],
  };
}

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
  const levelPlan = useMemo(
    () =>
      deriveHypeLevelPlan({
        mark: hype?.markPx ?? null,
        priceChange24h: hype?.priceChange24h ?? null,
        oiChangePct: hype?.oiChangePct ?? null,
        fundingApr: hype?.fundingAPR ?? null,
        levelBias: fundamentals?.levelBias,
      }),
    [fundamentals?.levelBias, hype?.fundingAPR, hype?.markPx, hype?.oiChangePct, hype?.priceChange24h],
  );

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 px-1 py-2">
      <section className="rounded-lg border border-teal-300/15 bg-[linear-gradient(180deg,rgba(8,18,20,0.98),rgba(7,10,14,0.98))] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-teal-200">
              <Landmark className="h-3.5 w-3.5" />
              HYPE desk
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
              HYPE levels, exchange usage, funding pressure, and live Hyperliquid market structure in one view.
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

          {view === "overview" ? <HypeTradePlan plan={levelPlan} mark={hype?.markPx ?? null} /> : null}

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
              <SectionEyebrow>Current call</SectionEyebrow>
              <span className="font-mono text-[11px] text-zinc-600">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "syncing"}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold leading-6 text-zinc-100">{levelPlan.bias}</div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">{levelPlan.plan}</div>
            <div className="mt-4 grid gap-2">
              <SideMetric icon={Activity} label="24h move" value={hype ? formatPct(hype.priceChange24h) : "n/a"} />
              <SideMetric icon={Gauge} label="Max leverage" value={hype ? `${hype.maxLeverage}x` : "n/a"} />
              <SideMetric icon={BarChart3} label="OI tick" value={hype?.oiChangePct == null ? "n/a" : formatPct(hype.oiChangePct)} />
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>Key levels</SectionEyebrow>
              <SurfaceButton size="sm" tone="ghost" onClick={fetchFundamentals} disabled={fundamentalsLoading} aria-label="Refresh HYPE fundamentals">
                <RefreshCcw className={cn("h-3.5 w-3.5", fundamentalsLoading && "animate-spin")} />
              </SurfaceButton>
            </div>
            <div className="mt-3 space-y-2">
              {levelPlan.levels.slice(0, 5).map((level) => (
                <LevelRow key={level.label} level={level} />
              ))}
              {fundamentalsError ? (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {fundamentalsError}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <SectionEyebrow>Risk line</SectionEyebrow>
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs leading-5 text-zinc-400">
              {levelPlan.risk}
            </div>
            <div className="mt-3 text-xs leading-5 text-zinc-500">
              {fundingHistory.length > 0 ? `${fundingHistory.length} funding samples loaded.` : "Waiting for funding history."}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function HypeTradePlan({ plan, mark }: { plan: HypeLevelPlan; mark: number | null }) {
  const trigger = plan.levels.find((level) => level.role === "trigger");
  const invalid = plan.levels.find((level) => level.role === "invalid");
  const target = plan.levels.find((level) => level.label === "Profit zone") ?? plan.levels.find((level) => level.role === "target");

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70">
      <div className="border-b border-zinc-800 bg-[#10151b] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>HYPE trade plan</SectionEyebrow>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">{plan.bias}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{plan.plan}</p>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-2 text-xs">
            <PlanChip label="Now" value={formatPrice(mark)} />
            <PlanChip label="Trigger" value={formatPrice(trigger?.price)} tone="green" />
            <PlanChip label="Invalid" value={formatPrice(invalid?.price)} tone="red" />
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-zinc-800 md:grid-cols-3">
        <TradeRule icon={Crosshair} label="Entry" value={trigger ? `Long only after ${formatPrice(trigger.price)} accepts.` : "Wait for reclaim."} />
        <TradeRule icon={Target} label="Take profit" value={target ? `Trim into ${formatPrice(target.price)} unless OI expands.` : "No target yet."} />
        <TradeRule icon={ShieldAlert} label="Wrong below" value={invalid ? `${formatPrice(invalid.price)} breaks the setup.` : plan.risk} tone="red" />
      </div>

      <div className="grid gap-px bg-zinc-800 md:grid-cols-2 xl:grid-cols-4">
        {plan.levels.map((level) => (
          <LevelCard key={level.label} level={level} />
        ))}
      </div>
    </section>
  );
}

function PlanChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "red" }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/75 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-sm font-semibold", tone === "green" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-zinc-100")}>{value}</div>
    </div>
  );
}

function TradeRule({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof Crosshair; label: string; value: string; tone?: "neutral" | "red" }) {
  return (
    <div className="bg-zinc-950/70 p-4">
      <div className={cn("flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]", tone === "red" ? "text-red-300" : "text-teal-300")}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-zinc-200">{value}</div>
    </div>
  );
}

function levelTone(role: HypeLevelPlan["levels"][number]["role"]) {
  if (role === "trigger") return "border-teal-400/25 bg-teal-400/10 text-teal-200";
  if (role === "target") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (role === "support") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (role === "invalid") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

function LevelCard({ level }: { level: HypeLevelPlan["levels"][number] }) {
  return (
    <div className="bg-zinc-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{level.label}</div>
          <div className="mt-2 font-mono text-lg font-semibold text-zinc-100">{formatPrice(level.price)}</div>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]", levelTone(level.role))}>
          {level.role}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-500">{level.note}</div>
    </div>
  );
}

function LevelRow({ level }: { level: HypeLevelPlan["levels"][number] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs font-medium text-zinc-300">{level.label}</div>
        <div className="font-mono text-xs text-zinc-100">{formatPrice(level.price)}</div>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-500">{level.note}</div>
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
          <SectionEyebrow>Fundamentals</SectionEyebrow>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">What changes the HYPE level read</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Usage, OI, volume, and funding decide whether to trust the breakout or fade the level.
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
