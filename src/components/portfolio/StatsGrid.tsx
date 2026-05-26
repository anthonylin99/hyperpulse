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
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85">
      <div className="grid gap-px bg-zinc-900/80 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-zinc-950/85 p-4">
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
  const { stats, trades, loading, capitalSummary } = usePortfolio();
  const { accountState } = useWallet();

  const metrics = useMemo<RailMetric[]>(() => {
    const accountValue = accountState?.accountValue ?? 0;
    const perpsValue = accountState?.isolatedAccountValue ?? 0;
    const spotWalletValue = accountState?.spotTotalValue ?? 0;
    const perpPositions = accountState?.positions.length ?? 0;
    const spotPositions = accountState?.spotPositions.length ?? 0;
    const openPositions = perpPositions + spotPositions;
    const unrealizedPnl = accountState?.unrealizedPnl ?? 0;

    const tradingPnl =
      stats ? stats.totalPnl + stats.totalFundingNet - stats.totalFeesPaid : 0;
    const netExternalFlows = capitalSummary?.netExternalCapitalUsd ?? 0;
    const directCashNet = capitalSummary
      ? (capitalSummary.directDepositsUsd ?? 0) - (capitalSummary.directWithdrawalsUsd ?? 0)
      : 0;
    const transferNet = capitalSummary
      ? (capitalSummary.externalTransferInUsd ?? 0) - (capitalSummary.externalTransferOutUsd ?? 0)
      : 0;
    const equityExDeposits = capitalSummary
      ? accountValue - netExternalFlows
      : accountValue;

    return [
      {
        label: "Equity ex-deposits",
        value: capitalSummary ? formatUSD(equityExDeposits) : formatUSD(accountValue),
        subValue: capitalSummary
          ? `Raw ${formatUSD(accountValue)} · external ${formatUSD(netExternalFlows)}`
          : `Perps ${formatUSD(perpsValue)} · Spot ${formatUSD(spotWalletValue)}`,
        tone:
          capitalSummary && equityExDeposits > 0
            ? "positive"
            : capitalSummary && equityExDeposits < 0
              ? "negative"
              : "neutral",
      },
      {
        label: "External flows",
        value: capitalSummary ? formatUSD(netExternalFlows) : "--",
        subValue: capitalSummary
          ? `Cash ${formatUSD(directCashNet)} · transfers ${formatUSD(transferNet)}`
          : "Waiting for ledger",
        tone:
          netExternalFlows > 0
            ? "positive"
            : netExternalFlows < 0
              ? "negative"
              : "neutral",
      },
      {
        label: "Trading P&L",
        value: stats ? formatUSD(tradingPnl) : "--",
        subValue: stats
          ? `Closed ${formatUSD(stats.totalPnl)} · fees/funding ${formatUSD(stats.totalFundingNet - stats.totalFeesPaid)}`
          : "Waiting for trade history",
        tone: tradingPnl > 0 ? "positive" : tradingPnl < 0 ? "negative" : "neutral",
      },
      {
        label: "Win rate",
        value: stats ? `${(stats.winRate * 100).toFixed(1)}%` : "--",
        subValue: stats ? `${stats.winners}W / ${stats.losers}L` : "No closed trades yet",
        tone:
          !stats ? "neutral" : stats.winRate > 0.5 ? "positive" : stats.winRate < 0.4 ? "negative" : "neutral",
      },
      {
        label: "Positions",
        value: openPositions.toString(),
        subValue:
          openPositions > 0
            ? `${perpPositions} perp · ${spotPositions} spot`
            : "None open",
        tone: "neutral",
      },
      {
        label: "Unrealized",
        value: formatUSD(unrealizedPnl),
        subValue: "Mark-to-market",
        tone:
          unrealizedPnl > 0 ? "positive" : unrealizedPnl < 0 ? "negative" : "neutral",
      },
    ];
  }, [accountState, capitalSummary, stats]);

  if (loading && trades.length === 0 && !accountState) return <RailSkeleton />;

  if (!accountState && !stats) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85">
      <div className="grid gap-px bg-zinc-900/80 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "bg-zinc-950/90 p-4",
              density === "roomy" && "p-5",
            )}
          >
            <div className="label">{metric.label}</div>
            <div
              className={cn(
                "mt-2 tabular-nums",
                density === "roomy" ? "text-stat-lg" : "text-stat",
                metric.tone === "positive"
                  ? "text-emerald-400"
                  : metric.tone === "negative"
                    ? "text-red-400"
                    : "text-zinc-100",
              )}
            >
              {metric.value}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{metric.subValue}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 bg-emerald-500/[0.04] px-4 py-2 text-[11px] text-zinc-500">
        External flows exclude internal spot/perp moves. Equity ex-deposits subtracts net outside capital from current account value.
      </div>
    </section>
  );
}
