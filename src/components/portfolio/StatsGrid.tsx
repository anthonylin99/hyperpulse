"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string | React.ReactNode;
  subValue?: string;
  positive?: boolean | null;
  tooltip?: string;
  large?: boolean;
}

function StatCard({ label, value, subValue, positive, tooltip, large }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" title={tooltip}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div
        className={cn(
          large ? "text-2xl font-bold" : "text-xl font-bold",
          typeof value === "string" && positive === true && "text-emerald-400",
          typeof value === "string" && positive === false && "text-red-400",
          typeof value === "string" && positive === null && "text-zinc-100",
        )}
      >
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-zinc-500 mt-0.5">{subValue}</div>
      )}
    </div>
  );
}

function StatsGridSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((col) => (
          <div key={col} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="skeleton h-3 w-20 rounded mb-2" />
            <div className="skeleton h-6 w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsGrid() {
  const { stats, fills, trades, byAsset, funding, loading } = usePortfolio();

  const derived = useMemo(() => {
    if (!stats || stats.totalTrades === 0) return null;

    // Liquidation count from fills
    const liquidations = fills.filter((f) => f.liquidation).length;

    // Long vs Short P&L
    let longPnl = 0;
    let shortPnl = 0;
    let longCount = 0;
    let shortCount = 0;
    for (const t of trades) {
      if (t.direction === "long") { longPnl += t.pnl; longCount++; }
      else { shortPnl += t.pnl; shortCount++; }
    }

    // Best/worst asset
    const sortedAssets = [...byAsset].sort((a, b) => b.pnl - a.pnl);
    const bestAsset = sortedAssets[0] ?? null;
    const worstAsset = sortedAssets[sortedAssets.length - 1] ?? null;

    // Fee as % of volume
    const totalVolume = trades.reduce((s, t) => s + t.notional, 0);
    const feePct = totalVolume > 0 ? (stats.totalFeesPaid / totalVolume) * 100 : 0;

    // Funding earned vs paid
    const fundingEarned = funding.filter((f) => f.usdc > 0).reduce((s, f) => s + f.usdc, 0);
    const fundingPaid = funding.filter((f) => f.usdc < 0).reduce((s, f) => s + f.usdc, 0);

    return {
      liquidations,
      longPnl, shortPnl, longCount, shortCount,
      bestAsset, worstAsset,
      feePct, totalVolume,
      fundingEarned, fundingPaid,
    };
  }, [stats, fills, trades, byAsset, funding]);

  if (loading && trades.length === 0) return <StatsGridSkeleton />;

  if (!stats || stats.totalTrades === 0 || !derived) return null;

  const netPnl = stats.totalPnl + stats.totalFundingNet - stats.totalFeesPaid;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Net P&L"
          value={formatUSD(netPnl)}
          subValue={`trading ${formatUSD(stats.totalPnl)} + funding ${formatUSD(stats.totalFundingNet)} - fees ${formatUSD(stats.totalFeesPaid)}`}
          positive={netPnl > 0 ? true : netPnl < 0 ? false : null}
          large
        />
        <StatCard
          label="Win Rate"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          subValue={`${stats.winners}W / ${stats.losers}L`}
          positive={stats.winRate > 0.5 ? true : stats.winRate < 0.4 ? false : null}
          tooltip="Percentage of round-trip trades that were profitable"
        />
        <StatCard
          label="Fees Paid"
          value={formatUSD(stats.totalFeesPaid)}
          subValue={`${derived.feePct.toFixed(2)}% of volume`}
          positive={derived.feePct < 0.03 ? true : derived.feePct > 0.06 ? false : null}
          tooltip="Total trading fees. Use limit orders to reduce fees — makers pay less than takers on Hyperliquid."
        />
      </div>
    </div>
  );
}
