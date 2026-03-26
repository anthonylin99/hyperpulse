"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null;
  tooltip?: string;
}

function StatCard({ label, value, subValue, positive, tooltip }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" title={tooltip}>
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

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function StatsGrid() {
  const { stats } = usePortfolio();

  if (!stats || stats.totalTrades === 0) return null;

  return (
    <div className="space-y-3">
      {/* Primary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Win Rate"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          subValue={`${stats.winners}W / ${stats.losers}L`}
          positive={stats.winRate > 0.5 ? true : stats.winRate < 0.4 ? false : null}
          tooltip="Percentage of trades that were profitable"
        />
        <StatCard
          label="Profit Factor"
          value={
            stats.profitFactor === Infinity
              ? "∞"
              : stats.profitFactor.toFixed(2)
          }
          subValue={`$${stats.grossProfit.toFixed(0)} / $${stats.grossLoss.toFixed(0)}`}
          positive={
            stats.profitFactor > 1.5
              ? true
              : stats.profitFactor < 1
                ? false
                : null
          }
          tooltip="Gross profit divided by gross loss. Above 1.5 is strong"
        />
        <StatCard
          label="Sharpe Ratio"
          value={stats.sharpeRatio.toFixed(2)}
          subValue="annualized"
          positive={
            stats.sharpeRatio > 1 ? true : stats.sharpeRatio < 0.5 ? false : null
          }
          tooltip="Risk-adjusted return. Above 1.0 is good, above 2.0 is excellent"
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
          tooltip="Largest peak-to-trough decline in portfolio equity"
        />
      </div>

      {/* Risk / reward metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Payoff Ratio"
          value={
            stats.payoffRatio === Infinity
              ? "∞"
              : stats.payoffRatio.toFixed(2)
          }
          subValue={`${formatUSD(stats.avgWin)} / ${formatUSD(stats.avgLoss)}`}
          positive={
            stats.payoffRatio > 1.5
              ? true
              : stats.payoffRatio < 0.8
                ? false
                : null
          }
          tooltip="Avg win / avg loss. Above 1.0 means wins are bigger than losses"
        />
        <StatCard
          label="Kelly Criterion"
          value={`${(stats.kellyCriterion * 100).toFixed(1)}%`}
          subValue={stats.kellyCriterion === 0 ? "edge insufficient" : "optimal size"}
          positive={
            stats.kellyCriterion > 0.1
              ? true
              : stats.kellyCriterion === 0
                ? false
                : null
          }
          tooltip="Optimal fraction of capital to risk per trade based on your edge"
        />
        <StatCard
          label="Expectancy"
          value={formatUSD(stats.expectancy)}
          subValue="per trade"
          positive={
            stats.expectancy > 0 ? true : stats.expectancy < 0 ? false : null
          }
          tooltip="Average profit/loss per trade. Must be positive to be profitable long-term"
        />
        <StatCard
          label="Sortino Ratio"
          value={stats.sortinoRatio.toFixed(2)}
          subValue="downside only"
          positive={
            stats.sortinoRatio > 1.5 ? true : stats.sortinoRatio < 0.5 ? false : null
          }
          tooltip="Like Sharpe but only penalizes downside volatility. Higher is better"
        />
      </div>

      {/* Duration & streak metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Trades"
          value={stats.totalTrades.toLocaleString()}
          subValue={`avg ${formatDuration(stats.avgTradeDuration)} hold`}
          positive={null}
        />
        <StatCard
          label="Win vs Loss Duration"
          value={`${formatDuration(stats.avgWinDuration)} / ${formatDuration(stats.avgLossDuration)}`}
          subValue={
            stats.avgLossDuration > stats.avgWinDuration * 1.5
              ? "holding losers too long"
              : stats.avgWinDuration > stats.avgLossDuration * 1.5
                ? "letting winners run"
                : "balanced"
          }
          positive={
            stats.avgLossDuration > stats.avgWinDuration * 1.5
              ? false
              : stats.avgWinDuration > stats.avgLossDuration * 1.5
                ? true
                : null
          }
          tooltip="How long winning trades last vs losing trades"
        />
        <StatCard
          label="Calmar Ratio"
          value={stats.calmarRatio.toFixed(2)}
          subValue="return / drawdown"
          positive={
            stats.calmarRatio > 2 ? true : stats.calmarRatio < 0.5 ? false : null
          }
          tooltip="Annualized return divided by max drawdown. Higher means better risk-adjusted"
        />
        <StatCard
          label="Recovery Factor"
          value={stats.recoveryFactor.toFixed(2)}
          subValue={`${stats.longestWinStreak}W / ${stats.longestLoseStreak}L streaks`}
          positive={
            stats.recoveryFactor > 1
              ? true
              : stats.recoveryFactor < 0
                ? false
                : null
          }
          tooltip="Net profit / max drawdown. Above 1.0 means you've recovered from your worst dip"
        />
      </div>
    </div>
  );
}
