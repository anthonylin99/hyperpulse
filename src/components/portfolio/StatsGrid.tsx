"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatUSD } from "@/lib/format";

interface RailMetric {
  label: string;
  value: string;
  subValue: string;
  tone?: "positive" | "negative" | "neutral";
}

function RailSkeleton() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950/85">
      <div className="grid gap-px bg-zinc-900/80 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-zinc-950/85 px-4 py-4">
            <div className="skeleton h-3 w-20 rounded mb-3" />
            <div className="skeleton h-6 w-24 rounded mb-2" />
            <div className="skeleton h-3 w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsGrid({ density = "compact" }: { density?: "compact" | "roomy" }) {
  const { stats, trades, loading } = usePortfolio();
  const { accountState } = useWallet();

  const metrics = useMemo<RailMetric[]>(() => {
    const accountValue = accountState?.accountValue ?? 0;
    const perpsValue = accountState?.isolatedAccountValue ?? 0;
    const spotWalletValue = accountState?.spotTotalValue ?? 0;
    const perpPositions = accountState?.positions.length ?? 0;
    const spotPositions = accountState?.spotPositions.length ?? 0;
    const openPositions = perpPositions + spotPositions;
    const unrealizedPnl = accountState?.unrealizedPnl ?? 0;

    const netPnl =
      stats ? stats.totalPnl + stats.totalFundingNet - stats.totalFeesPaid : 0;

    return [
      {
        label: "Account Equity",
        value: formatUSD(accountValue),
        subValue: `Perps ${formatUSD(perpsValue)} • Spot wallet ${formatUSD(spotWalletValue)}`,
        tone: "neutral",
      },
      {
        label: "Net P&L",
        value: formatUSD(netPnl),
        subValue: stats
          ? `Trading ${formatUSD(stats.totalPnl)} • Funding ${formatUSD(stats.totalFundingNet)}`
          : "Waiting for trade history",
        tone: netPnl > 0 ? "positive" : netPnl < 0 ? "negative" : "neutral",
      },
      {
        label: "Win Rate",
        value: stats ? `${(stats.winRate * 100).toFixed(1)}%` : "--",
        subValue: stats ? `${stats.winners}W / ${stats.losers}L` : "No closed trades yet",
        tone:
          !stats ? "neutral" : stats.winRate > 0.5 ? "positive" : stats.winRate < 0.4 ? "negative" : "neutral",
      },
      {
        label: "Open Holdings",
        value: openPositions.toString(),
        subValue:
          openPositions > 0
            ? `${perpPositions} perp • ${spotPositions} spot`
            : "No live perps or spot holdings",
        tone: "neutral",
      },
      {
        label: "Total Fees",
        value: stats ? formatUSD(stats.totalFeesPaid) : "--",
        subValue: stats ? `${trades.length} closed trades analyzed` : "Will populate after trading",
        tone: "neutral",
      },
      {
        label: "Unrealized P&L",
        value: formatUSD(unrealizedPnl),
        subValue: "Current mark-to-market",
        tone:
          unrealizedPnl > 0 ? "positive" : unrealizedPnl < 0 ? "negative" : "neutral",
      },
    ];
  }, [accountState, stats, trades.length]);

  if (loading && trades.length === 0 && !accountState) return <RailSkeleton />;

  if (!accountState && !stats) return null;

  return (
    <section className="overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950/85">
      <div className="grid gap-px bg-zinc-900/80 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "bg-zinc-950/90",
              density === "roomy" ? "px-5 py-5" : "px-4 py-4",
            )}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {metric.label}
            </div>
            <div
              className={cn(
                density === "roomy" ? "mt-3 text-[1.9rem] font-semibold tracking-tight" : "mt-3 text-2xl font-semibold tracking-tight",
                metric.tone === "positive"
                  ? "text-emerald-400"
                  : metric.tone === "negative"
                    ? "text-red-400"
                    : "text-zinc-100",
              )}
            >
              {metric.value}
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">{metric.subValue}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 bg-emerald-500/[0.04] px-4 py-2 text-[11px] text-zinc-500">
        Equity reflects perps plus the full spot wallet. Staked HYPE remains excluded from this workspace by design.
      </div>
    </section>
  );
}
