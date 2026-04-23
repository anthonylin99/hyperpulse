"use client";

import { useMemo } from "react";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";
import FactorLeaderStrip from "./factors/FactorLeaderStrip";

const DASHBOARD_MAJORS = ["BTC", "ETH", "SOL", "HYPE"] as const;

interface MarketOverviewPanelProps {
  title?: string;
  description?: string;
  showHeading?: boolean;
  variant?: "hero" | "compact";
}

export default function MarketOverviewPanel({
  title = "Market Overview",
  description = "Live Hyperliquid context across bias, factor regime, and major perp benchmarks.",
  showHeading = true,
  variant = "hero",
}: MarketOverviewPanelProps) {
  const { assets, loading, selectedAsset, setSelectedAsset, lastUpdated } = useMarket();
  const { factorsEnabled } = useAppConfig();
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
        "rounded-2xl border border-zinc-800",
        compact
          ? "bg-zinc-900/75 p-4"
          : "bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/10 p-5 md:p-6",
      )}
    >
      {showHeading && (
        <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between", compact ? "mb-4" : "mb-5")}>
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Pulse</div>
            <h2 className={cn("font-semibold tracking-tight text-zinc-100", compact ? "mt-1 text-lg" : "mt-2 text-2xl")}>
              {title}
            </h2>
            <p className={cn("text-zinc-400", compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6")}>
              {factorsEnabled
                ? description
                : "Live Hyperliquid context across tomorrow bias and major perp benchmarks before you scan the full market table."}
            </p>
          </div>
          <div className={cn("rounded-xl border border-zinc-800 bg-zinc-950/50 text-zinc-400", compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm")}>
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Last Sync</div>
            <div className={cn("mt-1 font-mono text-zinc-100", compact ? "text-sm" : "")}>
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

      <div className={cn("grid gap-4", compact ? "lg:grid-cols-1" : factorsEnabled ? "xl:grid-cols-[1.15fr_0.85fr]" : "xl:grid-cols-[0.9fr_1.1fr]")}>
        <div className={cn(compact ? "space-y-3" : "space-y-4")}>
          <SentimentSlider variant={compact ? "compact" : "hero"} />
          {!compact && factorsEnabled ? <FactorLeaderStrip variant="hero" /> : null}
        </div>

        <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-2")}>
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
                      "rounded-2xl border px-4 py-4 text-left transition-all",
                      active
                        ? "border-teal-400/40 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                        : "border-zinc-800 bg-zinc-950/45 hover:border-zinc-700 hover:bg-zinc-950/70",
                      compact && "px-3 py-3",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{asset.coin}</div>
                        <div className={cn("font-semibold text-zinc-100", compact ? "mt-1 text-lg" : "mt-2 text-xl")}>
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

                    <div className={cn("grid grid-cols-2 gap-3 text-xs text-zinc-500", compact ? "mt-3" : "mt-4")}>
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
