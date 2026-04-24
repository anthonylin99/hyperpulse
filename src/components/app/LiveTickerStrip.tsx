"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMarket } from "@/context/MarketContext";
import { cn, formatCompact, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import type { MarketAsset } from "@/types";

const FALLBACK_TICKERS = ["BTC", "ETH", "SOL", "HYPE", "AAVE", "ZEC"] as const;

function TickerItem({ asset }: { asset: MarketAsset }) {
  const priceDecimals = asset.markPx < 1 ? 4 : 2;
  return (
    <Link
      href={`/markets?asset=${asset.coin}`}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-zinc-800/70 bg-zinc-950/50 px-3 py-1.5 transition hover:border-teal-400/30 hover:bg-teal-500/[0.06]"
    >
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
        {asset.coin}
      </span>
      <span className="font-mono text-[11px] text-zinc-400">
        {formatUSD(asset.markPx, priceDecimals)}
      </span>
      <span
        className={cn(
          "font-mono text-[11px]",
          asset.priceChange24h >= 0 ? "text-emerald-300" : "text-rose-300",
        )}
      >
        {formatPct(asset.priceChange24h)}
      </span>
      <span className="hidden font-mono text-[11px] text-zinc-500 sm:inline">
        OI {formatCompact(asset.openInterest)}
      </span>
      <span
        className={cn(
          "font-mono text-[11px]",
          asset.fundingAPR <= 0 ? "text-emerald-300" : "text-rose-300",
        )}
      >
        FND {formatFundingAPR(asset.fundingAPR)}
      </span>
    </Link>
  );
}

function PlaceholderTickerItem({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-zinc-800/70 bg-zinc-950/50 px-3 py-1.5">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
        {label}
      </span>
      <span className="font-mono text-[11px] text-zinc-600">Loading...</span>
    </div>
  );
}

export default function LiveTickerStrip() {
  const { assets, loading, lastUpdated } = useMarket();
  const tickerAssets = useMemo(
    () => [...assets].sort((a, b) => b.openInterest - a.openInterest).slice(0, 14),
    [assets],
  );
  const hasLiveAssets = tickerAssets.length > 0;

  const timeLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";

  return (
    <div className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto max-w-[1480px] px-4 py-2 sm:px-6 xl:px-8">
        <div className="flex items-center gap-4 text-xs">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-zinc-950 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-zinc-950 to-transparent" />
            <div className="hp-ticker-track">
              {[0, 1].map((group) => (
                <div key={group} className="hp-ticker-group" aria-hidden={group === 1}>
                  {hasLiveAssets
                    ? tickerAssets.map((asset) => <TickerItem key={`${group}-${asset.coin}`} asset={asset} />)
                    : FALLBACK_TICKERS.map((coin) => <PlaceholderTickerItem key={`${group}-${coin}`} label={coin} />)}
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap pl-2 text-zinc-400">
            <span className={cn("h-2 w-2 rounded-full", loading ? "bg-zinc-600" : "bg-emerald-400")}></span>
            <span>{loading ? "Syncing" : "Live"}</span>
            <span className="font-mono text-zinc-200">{timeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
