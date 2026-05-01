"use client";

import { useMemo } from "react";
import { useMarket } from "@/context/MarketContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";

const DASHBOARD_MAJORS = ["BTC", "ETH", "SOL", "HYPE"] as const;

interface MarketOverviewPanelProps {
  title?: string;
  description?: string;
  showHeading?: boolean;
  variant?: "hero" | "compact";
}

export default function MarketOverviewPanel({
  title = "Market Overview",
  description = "Live Hyperliquid context across next-session bias and major perp benchmarks.",
  showHeading = true,
  variant = "hero",
}: MarketOverviewPanelProps) {
  const { assets, loading, selectedAsset, setSelectedAsset } = useMarket();
  const compact = variant === "compact";

  const majors = useMemo(
    () =>
      DASHBOARD_MAJORS.map((coin) => assets.find((asset) => asset.coin === coin)).filter(
        (asset): asset is NonNullable<(typeof assets)[number]> => Boolean(asset),
      ),
    [assets],
  );

  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-zinc-800",
        compact
          ? "bg-zinc-900/75 p-3"
          : "bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/10 p-5 md:p-6",
      )}
    >
      {showHeading && (
        <div className={cn("flex flex-col gap-3", compact ? "mb-3" : "mb-5 lg:flex-row lg:items-end lg:justify-between")}>
          <div className="min-w-0 max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Pulse</div>
            <h2 className={cn("font-semibold tracking-tight text-zinc-100", compact ? "mt-1 text-base" : "mt-2 text-2xl")}>
              {title}
            </h2>
            <p className={cn("text-zinc-400", compact ? "mt-1 text-[11px] leading-4" : "mt-2 text-sm leading-6")}>
              {compact ? "Bias and benchmark context." : description}
            </p>
          </div>
        </div>
      )}

      <div className={cn("grid gap-4", compact ? "lg:grid-cols-1" : "xl:grid-cols-[0.9fr_1.1fr]")}>
        <div className={cn(compact ? "space-y-3" : "space-y-4")}>
          <SentimentSlider variant={compact ? "compact" : "hero"} />
        </div>

        <div className={cn("grid min-w-0 gap-2.5", compact ? "" : "sm:grid-cols-2")}>
          {loading && majors.length === 0
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={cn("rounded-2xl border border-zinc-800 skeleton", compact ? "h-[72px]" : "h-[110px]")} />
              ))
            : majors.map((asset) => {
                const active = selectedAsset === asset.coin;
                return (
                  <button
                    key={asset.coin}
                    onClick={() => setSelectedAsset(active ? null : asset.coin)}
                    className={cn(
                      "min-w-0 rounded-2xl border px-4 py-4 text-left transition-all",
                      active
                        ? "border-teal-400/40 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                        : "border-zinc-800 bg-zinc-950/45 hover:border-zinc-700 hover:bg-zinc-950/70",
                      compact && "rounded-xl px-3 py-2",
                    )}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{asset.coin}</div>
                        <div className={cn("font-semibold text-zinc-100", compact ? "mt-0.5 text-sm" : "mt-2 text-xl")}>
                          {formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "rounded-full px-2 py-1 font-medium",
                          compact ? "text-[11px]" : "text-xs",
                          asset.priceChange24h >= 0
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-red-500/10 text-red-300",
                        )}
                      >
                        {formatPct(asset.priceChange24h)}
                      </div>
                    </div>

                    <div className={cn("grid min-w-0 grid-cols-2 gap-2 text-zinc-500", compact ? "mt-2 text-[11px]" : "mt-4 text-xs")}>
                      <div>
                        <div className="uppercase tracking-[0.14em] text-zinc-600">Funding APR</div>
                        <div className={cn("mt-1 truncate text-zinc-300", compact ? "text-xs" : "text-sm")}>{formatFundingAPR(asset.fundingAPR)}</div>
                      </div>
                      <div>
                        <div className="uppercase tracking-[0.14em] text-zinc-600">Signal</div>
                        <div className={cn("mt-1 truncate text-zinc-300", compact ? "text-xs" : "text-sm")}>{asset.signal.label}</div>
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
