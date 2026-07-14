"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, RefreshCw, ShieldCheck } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { cn, formatPct } from "@/lib/format";
import { normalizeMarketCoin } from "@/lib/marketCoins";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import { SectionEyebrow } from "@/components/trading-ui";
import type { TradeIdea, TradeIdeasPayload } from "@/lib/tradeIdeas";

function formatLevel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function convictionTone(conviction: TradeIdea["conviction"]): string {
  if (conviction === "A") return "border-teal-400/40 bg-teal-500/10 text-teal-200";
  if (conviction === "B") return "border-amber-400/35 bg-amber-500/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900/70 text-zinc-300";
}

function convictionLabel(conviction: TradeIdea["conviction"]): string {
  if (conviction === "A") return "A · confirmed";
  if (conviction === "B") return "B · wait for trigger";
  return "C · early watch";
}

function IdeaCard({ idea, rank, onSelect }: {
  idea: TradeIdea;
  rank: number;
  onSelect: (asset: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const sideTone = idea.side === "long" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-red-400/40 bg-red-500/10 text-red-300";
  return (
    <Link
      href={`/markets?asset=${encodeURIComponent(idea.coin)}`}
      onClick={(event) => onSelect(idea.coin, event)}
      className="flex min-w-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950/45 p-3 transition hover:border-zinc-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-600">#{rank}</span>
          <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]", sideTone)}>
            {idea.side}
          </span>
          <span className="font-mono text-sm font-semibold text-zinc-100">{idea.displayName}</span>
        </div>
        <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]", convictionTone(idea.conviction))}>
          {convictionLabel(idea.conviction)}
        </span>
      </div>

      <div className="mt-2 text-sm font-medium text-zinc-100">{idea.headline}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-400">{idea.thesis}</div>

      <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-xs leading-5 text-zinc-200">
        {idea.action}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">Trigger</div>
          <div className="mt-0.5 font-mono text-zinc-200">{formatLevel(idea.trigger)}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">Stop out</div>
          <div className="mt-0.5 font-mono text-red-300">{formatLevel(idea.invalidation)}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">Target</div>
          <div className="mt-0.5 font-mono text-emerald-300">{formatLevel(idea.target)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        <span>Funding <span className={cn("font-mono", idea.fundingApr >= 0 ? "text-red-300" : "text-emerald-300")}>{formatPct(idea.fundingApr)}</span></span>
        <span>24h <span className={cn("font-mono", idea.priceChange24h >= 0 ? "text-emerald-300" : "text-red-300")}>{formatPct(idea.priceChange24h)}</span></span>
        <span>Horizon {idea.horizonHours}h</span>
      </div>

      <div className="mt-2 text-[11px] leading-4 text-zinc-500">Wrong if: {idea.wrongIf}</div>

      {idea.trackRecordNote ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-teal-500/20 bg-teal-500/5 px-2 py-1.5 text-[10px] leading-4 text-teal-200/80">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          {idea.trackRecordNote}
        </div>
      ) : null}
    </Link>
  );
}

export default function TradeIdeasPanel() {
  const [data, setData] = useState<TradeIdeasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { setSelectedAsset } = useMarket();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/ideas");
        if (!response.ok) return;
        const next = (await response.json()) as TradeIdeasPayload;
        if (mounted) setData(next);
      } catch {
        /* keep last good data */
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

  const handleSelect = (coin: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/markets") return;
    event.preventDefault();
    const asset = normalizeMarketCoin(coin);
    if (!asset) return;
    setSelectedAsset(asset);
    window.history.replaceState(null, "", `/markets?asset=${encodeURIComponent(asset)}`);
    window.setTimeout(() => {
      document.getElementById(`market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionEyebrow>Trade ideas</SectionEyebrow>
          <div className="mt-1 text-base font-semibold text-zinc-100">What to trade right now</div>
          <div className="mt-0.5 text-xs leading-5 text-zinc-500">
            {data?.marketNote ?? "Reading positioning, funding, and price confirmation…"}
          </div>
        </div>
        <div className="rounded-xl border border-teal-500/20 bg-teal-500/10 p-2 text-teal-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
        </div>
      </div>

      {!data || data.ideas.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-400">
          {loading
            ? "Scanning the market…"
            : "No trade. Nothing has both stressed positioning and price confirmation right now — standing aside is the correct play. Check back in a few hours."}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.ideas.map((idea, index) => (
            <IdeaCard key={idea.id} idea={idea} rank={index + 1} onSelect={handleSelect} />
          ))}
        </div>
      )}

      <div className="mt-3 text-[10px] leading-4 text-zinc-600">
        Not financial advice. Every idea is invalid the moment its stop-out level breaks — no averaging, no exceptions.
      </div>
    </section>
  );
}
