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

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function StatsGridSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((col) => (
            <div key={col} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="skeleton h-3 w-20 rounded mb-2" />
              <div className="skeleton h-6 w-28 rounded" />
            </div>
          ))}
        </div>
      ))}
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
      {/* Row 1: The Money — what matters most */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          label="Avg Win vs Avg Loss"
          value={
            <span>
              <span className="text-emerald-400">{formatUSD(stats.avgWin)}</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-red-400">{formatUSD(stats.avgLoss)}</span>
            </span>
          }
          subValue={stats.avgWin > stats.avgLoss ? "winners > losers" : "losers > winners — cut losses faster"}
          positive={null}
          tooltip="Are your winning trades bigger than your losing trades? If not, you're giving back profits."
        />
        <StatCard
          label="Max Drawdown"
          value={`${(stats.maxDrawdown * 100).toFixed(1)}%`}
          subValue={stats.maxDrawdown > 0.3 ? "high risk — consider smaller size" : stats.maxDrawdown < 0.1 ? "well controlled" : "moderate"}
          positive={
            stats.maxDrawdown < 0.15 ? true : stats.maxDrawdown > 0.3 ? false : null
          }
          tooltip="Largest peak-to-trough decline. Above 30% is dangerous for account longevity."
        />
      </div>

      {/* Row 2: Perps-specific — funding, fees, liquidations */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Funding P&L"
          value={formatUSD(stats.totalFundingNet)}
          subValue={`earned ${formatUSD(derived.fundingEarned)} / paid ${formatUSD(Math.abs(derived.fundingPaid))}`}
          positive={stats.totalFundingNet > 0 ? true : stats.totalFundingNet < -5 ? false : null}
          tooltip="Net funding payments. Positive = you earned funding by being on the less crowded side."
        />
        <StatCard
          label="Fees Paid"
          value={formatUSD(stats.totalFeesPaid)}
          subValue={`${derived.feePct.toFixed(2)}% of volume`}
          positive={derived.feePct < 0.03 ? true : derived.feePct > 0.06 ? false : null}
          tooltip="Total trading fees. Use limit orders to reduce fees — makers pay less than takers on Hyperliquid."
        />
        <StatCard
          label="Biggest Win / Loss"
          value={
            <span>
              <span className="text-emerald-400">{formatUSD(stats.largestWin)}</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-red-400">{formatUSD(stats.largestLoss)}</span>
            </span>
          }
          subValue={stats.bestTrade ? `${stats.bestTrade.coin} / ${stats.worstTrade?.coin}` : ""}
          positive={null}
          tooltip="Your single best and worst trades. Large outliers suggest inconsistent sizing."
        />
        <StatCard
          label="Liquidations"
          value={derived.liquidations.toString()}
          subValue={derived.liquidations === 0 ? "clean record" : "reduce leverage or use stops"}
          positive={derived.liquidations === 0 ? true : false}
          tooltip="Number of fills that were liquidations. Even one means your risk management needs work."
        />
      </div>

      {/* Row 3: Behavioral — directional bias, best/worst coins, hold time */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Long vs Short P&L"
          value={
            <span>
              <span className={derived.longPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{formatUSD(derived.longPnl)}</span>
              <span className="text-zinc-500"> / </span>
              <span className={derived.shortPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{formatUSD(derived.shortPnl)}</span>
            </span>
          }
          subValue={`${derived.longCount} long / ${derived.shortCount} short trades`}
          positive={null}
          tooltip="P&L split by direction. If one side is consistently negative, consider trading only your profitable direction."
        />
        <StatCard
          label="Best Asset"
          value={derived.bestAsset ? `${derived.bestAsset.coin} ${formatUSD(derived.bestAsset.pnl)}` : "—"}
          subValue={derived.bestAsset ? `${derived.bestAsset.trades} trades, ${(derived.bestAsset.winRate * 100).toFixed(0)}% win` : ""}
          positive={derived.bestAsset && derived.bestAsset.pnl > 0 ? true : null}
          tooltip="The coin you're most profitable on. Focus your edge here."
        />
        <StatCard
          label="Worst Asset"
          value={derived.worstAsset ? `${derived.worstAsset.coin} ${formatUSD(derived.worstAsset.pnl)}` : "—"}
          subValue={derived.worstAsset ? `${derived.worstAsset.trades} trades, ${(derived.worstAsset.winRate * 100).toFixed(0)}% win` : ""}
          positive={derived.worstAsset && derived.worstAsset.pnl < 0 ? false : null}
          tooltip="The coin you're losing the most on. Consider avoiding it or changing your strategy."
        />
        <StatCard
          label="Avg Hold Time"
          value={`${formatDuration(stats.avgWinDuration)} W / ${formatDuration(stats.avgLossDuration)} L`}
          subValue={
            stats.avgLossDuration > stats.avgWinDuration * 1.5
              ? "holding losers too long"
              : stats.avgWinDuration > stats.avgLossDuration * 1.5
                ? "letting winners run — good"
                : "balanced"
          }
          positive={
            stats.avgLossDuration > stats.avgWinDuration * 1.5
              ? false
              : stats.avgWinDuration > stats.avgLossDuration * 1.5
                ? true
                : null
          }
          tooltip="How long you hold winning vs losing trades. Holding losers longer than winners is a classic retail mistake."
        />
      </div>
    </div>
  );
}
