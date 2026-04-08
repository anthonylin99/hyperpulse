"use client";

import { useMemo } from "react";
import { useMarket } from "@/context/MarketContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";
import FactorLeaderStrip from "./factors/FactorLeaderStrip";

const DASHBOARD_MAJORS = ["BTC", "ETH", "SOL", "HYPE"] as const;

interface MarketOverviewPanelProps {
  title?: string;
  description?: string;
  showHeading?: boolean;
}

export default function MarketOverviewPanel({
  title = "Market Overview",
  description = "Live Hyperliquid context across bias, factor regime, and major perp benchmarks.",
  showHeading = true,
}: MarketOverviewPanelProps) {
  const { assets, loading, selectedAsset, setSelectedAsset, lastUpdated } = useMarket();

  const majors = useMemo(
    () =>
      DASHBOARD_MAJORS.map((coin) => assets.find((asset) => asset.coin === coin)).filter(
        (asset): asset is NonNullable<(typeof assets)[number]> => Boolean(asset),
      ),
    [assets],
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/10 p-5 md:p-6">
      {showHeading && (
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Pulse</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Last Sync</div>
            <div className="mt-1 font-mono text-zinc-100">
              {lastUpdated
                ? lastUpdated.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : loading
                  ? "Connecting..."
                  : "--:--:--"}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <SentimentSlider variant="hero" />
          <FactorLeaderStrip variant="hero" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {loading && majors.length === 0
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[110px] rounded-2xl border border-zinc-800 skeleton" />
              ))
            : majors.map((asset) => {
                const active = selectedAsset === asset.coin;
                return (
                  <button
                    key={asset.coin}
                    onClick={() => setSelectedAsset(active ? null : asset.coin)}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition-all",
                      active
                        ? "border-teal-400/40 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                        : "border-zinc-800 bg-zinc-950/45 hover:border-zinc-700 hover:bg-zinc-950/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{asset.coin}</div>
                        <div className="mt-2 text-xl font-semibold text-zinc-100">
                          {formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "rounded-full px-2 py-1 text-xs font-medium",
                          asset.priceChange24h >= 0
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-red-500/10 text-red-300",
                        )}
                      >
                        {formatPct(asset.priceChange24h)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                      <div>
                        <div className="uppercase tracking-[0.14em] text-zinc-600">Funding APR</div>
                        <div className="mt-1 text-sm text-zinc-300">{formatFundingAPR(asset.fundingAPR)}</div>
                      </div>
                      <div>
                        <div className="uppercase tracking-[0.14em] text-zinc-600">Signal</div>
                        <div className="mt-1 text-sm text-zinc-300">{asset.signal.label}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
        </div>
      </div>
    </section>
  );
}
