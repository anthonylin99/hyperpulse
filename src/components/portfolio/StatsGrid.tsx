"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null;
}

function StatCard({ label, value, subValue, positive }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div
        className={cn(
          "text-xl font-bold",
          positive === true && "text-emerald-400",
          positive === false && "text-red-400",
          positive === null && "text-zinc-100",
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

export default function StatsGrid() {
  const { stats } = usePortfolio();

  if (!stats || stats.totalTrades === 0) return null;

  const avgDurationHours = stats.avgTradeDuration / (1000 * 60 * 60);
  const durationStr =
    avgDurationHours < 1
      ? `${(avgDurationHours * 60).toFixed(0)}m`
      : avgDurationHours < 24
        ? `${avgDurationHours.toFixed(1)}h`
        : `${(avgDurationHours / 24).toFixed(1)}d`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Win Rate"
        value={`${(stats.winRate * 100).toFixed(1)}%`}
        subValue={`${stats.winners}W / ${stats.losers}L`}
        positive={stats.winRate > 0.5 ? true : stats.winRate < 0.4 ? false : null}
      />
      <StatCard
        label="Profit Factor"
        value={
          stats.profitFactor === Infinity
            ? "∞"
            : stats.profitFactor.toFixed(2)
        }
        subValue={`${formatUSD(stats.avgWin)} avg win`}
        positive={
          stats.profitFactor > 1.5
            ? true
            : stats.profitFactor < 1
              ? false
              : null
        }
      />
      <StatCard
        label="Sharpe Ratio"
        value={stats.sharpeRatio.toFixed(2)}
        subValue="annualized"
        positive={
          stats.sharpeRatio > 1 ? true : stats.sharpeRatio < 0.5 ? false : null
        }
      />
      <StatCard
        label="Max Drawdown"
        value={`${(stats.maxDrawdown * 100).toFixed(1)}%`}
        positive={
          stats.maxDrawdown < 0.15
            ? true
            : stats.maxDrawdown > 0.3
              ? false
              : null
        }
      />
      <StatCard
        label="Expectancy"
        value={formatUSD(stats.expectancy)}
        subValue="per trade"
        positive={
          stats.expectancy > 0 ? true : stats.expectancy < 0 ? false : null
        }
      />
      <StatCard
        label="Avg Loss"
        value={formatUSD(stats.avgLoss)}
        subValue={`${stats.longestLoseStreak} max streak`}
        positive={false}
      />
      <StatCard
        label="Total Trades"
        value={stats.totalTrades.toLocaleString()}
        subValue={`avg ${durationStr} hold`}
        positive={null}
      />
      <StatCard
        label="Calmar Ratio"
        value={stats.calmarRatio.toFixed(2)}
        subValue="return / drawdown"
        positive={
          stats.calmarRatio > 2 ? true : stats.calmarRatio < 0.5 ? false : null
        }
      />
    </div>
  );
}
