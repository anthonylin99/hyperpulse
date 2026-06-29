"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw, ShieldAlert, Target } from "lucide-react";
import { SectionEyebrow } from "@/components/trading-ui";
import { useMarket } from "@/context/MarketContext";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import { cn, formatCompactUsd, formatFundingAPR, formatPct } from "@/lib/format";
import { normalizeMarketCoin } from "@/lib/marketCoins";
import { formatEasternTime } from "@/lib/time";

type DailySetup = {
  coin: string;
  side: "long" | "short" | "watch";
  title: string;
  status: "watch" | "no-trade";
  markPx: number;
  fundingApr: number;
  fundingZ7d: number | null;
  priceChange24h: number;
  openInterestUsd: number;
  volume24hUsd: number;
  trigger: number | null;
  invalidation: number | null;
  target: number | null;
  maxHoldHours: number;
  score: number;
  rationale: string[];
  guardrails: string[];
};

type DailySetupResponse = {
  generatedAt: number;
  setup: DailySetup;
};

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 10) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

function marketAssetElementId(asset: string) {
  return `market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function sideClasses(side: DailySetup["side"]) {
  if (side === "short") return "border-rose-500/25 bg-rose-500/10 text-rose-200";
  if (side === "long") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  return "border-zinc-700 bg-zinc-950/70 text-zinc-300";
}

export default function DailySetupPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<DailySetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { setSelectedAsset } = useMarket();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/market/daily-setup");
        if (!response.ok) return;
        const next = (await response.json()) as DailySetupResponse;
        if (mounted) setData(next);
      } catch {
        /* keep last good setup */
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, POLL_INTERVAL_MARKET);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const setup = data?.setup;
  const isActionable = setup && setup.status !== "no-trade";
  const href = setup && setup.coin !== "MARKET" ? `/markets?asset=${encodeURIComponent(setup.coin)}` : "/markets";

  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!setup || setup.coin === "MARKET" || pathname !== "/markets") return;
    event.preventDefault();
    const asset = normalizeMarketCoin(setup.coin);
    if (!asset) return;
    setSelectedAsset(asset);
    window.history.replaceState(null, "", `/markets?asset=${encodeURIComponent(asset)}`);
    window.setTimeout(() => {
      document.getElementById(marketAssetElementId(asset))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionEyebrow>Daily Setup</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">
            Funding-based watch
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
            {data?.generatedAt ? formatEasternTime(data.generatedAt, true) : "warming up"}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
        </div>
      </div>

      {!setup ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
          Building the funding setup.
        </div>
      ) : (
        <div className="space-y-3">
          <Link
            href={href}
            onClick={handleOpen}
            className="block rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold text-zinc-100">
                    {setup.coin}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", sideClasses(setup.side))}>
                    {setup.side === "watch" ? "No trade" : `${setup.side} watch`}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium text-zinc-200">{setup.title}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  {setup.rationale[0] ?? "Wait for confirmation."}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm text-zinc-100">{formatPrice(setup.markPx)}</div>
                <div className="mt-1 font-mono text-[10px] text-zinc-500">score {setup.score.toFixed(1)}</div>
              </div>
            </div>
          </Link>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Metric label="Funding" value={formatFundingAPR(setup.fundingApr)} tone={Math.abs(setup.fundingApr) >= 20 ? "hot" : "neutral"} />
            <Metric label="24h" value={formatPct(setup.priceChange24h)} tone={setup.priceChange24h >= 0 ? "green" : "red"} />
            <Metric label="OI" value={formatCompactUsd(setup.openInterestUsd)} />
            <Metric label="Volume" value={formatCompactUsd(setup.volume24hUsd)} />
          </div>

          {isActionable ? (
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <Metric label="Trigger" value={formatPrice(setup.trigger)} tone="green" />
              <Metric label="Invalid" value={formatPrice(setup.invalidation)} tone="red" />
              <Metric label="Target" value={formatPrice(setup.target)} />
            </div>
          ) : null}

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-100/90">
            <div className="mb-1 flex items-center gap-2 font-medium text-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" />
              Risk rule
            </div>
            {setup.guardrails[0] ?? "Do not add to a losing position."}
          </div>

          {!compact && setup.rationale.length > 1 ? (
            <div className="space-y-1 text-[11px] leading-5 text-zinc-500">
              {setup.rationale.slice(1).map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "hot";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-rose-300"
        : tone === "hot"
          ? "text-amber-300"
          : "text-zinc-200";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/55 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-xs", toneClass)}>{value}</div>
    </div>
  );
}
