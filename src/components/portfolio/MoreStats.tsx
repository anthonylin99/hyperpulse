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
}

function StatCard({ label, value, subValue, positive, tooltip }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" title={tooltip}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div
        className={cn(
          "text-xl font-bold",
          typeof value === "string" && positive === true && "text-emerald-400",
          typeof value === "string" && positive === false && "text-red-400",
          typeof value === "string" && positive === null && "text-zinc-100"
        )}
      >
        {value}
      </div>
      {subValue && <div className="text-xs text-zinc-500 mt-0.5">{subValue}</div>}
    </div>
  );
}

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function MoreStats() {
  const { stats, fills, trades, byAsset, funding, loading } = usePortfolio();

  const derived = useMemo(() => {
    if (!stats || stats.totalTrades === 0) return null;

    const liquidations = fills.filter((f) => f.liquidation).length;

    let longPnl = 0;
    let shortPnl = 0;
    let longCount = 0;
    let shortCount = 0;
    for (const t of trades) {
      if (t.direction === "long") {
        longPnl += t.pnl;
        longCount++;
      } else {
        shortPnl += t.pnl;
        shortCount++;
      }
    }

    const sortedAssets = [...byAsset].sort((a, b) => b.pnl - a.pnl);
    const bestAsset = sortedAssets[0] ?? null;
    const worstAsset = sortedAssets[sortedAssets.length - 1] ?? null;

    const fundingEarned = funding.filter((f) => f.usdc > 0).reduce((s, f) => s + f.usdc, 0);
    const fundingPaid = funding.filter((f) => f.usdc < 0).reduce((s, f) => s + f.usdc, 0);

    return {
      liquidations,
      longPnl,
      shortPnl,
      longCount,
      shortCount,
      bestAsset,
      worstAsset,
      fundingEarned,
      fundingPaid,
    };
  }, [stats, fills, trades, byAsset, funding]);

  if (loading && trades.length === 0) return null;
  if (!stats || stats.totalTrades === 0 || !derived) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-400">More Stats</h3>
        <span className="text-[10px] text-zinc-600">for deeper review</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          positive={stats.maxDrawdown < 0.15 ? true : stats.maxDrawdown > 0.3 ? false : null}
          tooltip="Largest peak-to-trough decline. Above 30% is dangerous for account longevity."
        />
        <StatCard
          label="Funding P&L"
          value={formatUSD(stats.totalFundingNet)}
          subValue={`earned ${formatUSD(derived.fundingEarned)} / paid ${formatUSD(Math.abs(derived.fundingPaid))}`}
          positive={stats.totalFundingNet > 0 ? true : stats.totalFundingNet < -5 ? false : null}
          tooltip="Net funding payments. Positive = you earned funding by being on the less crowded side."
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Liquidations"
          value={derived.liquidations.toString()}
          subValue={derived.liquidations === 0 ? "clean record" : "reduce leverage or use stops"}
          positive={derived.liquidations === 0 ? true : false}
          tooltip="Number of fills that were liquidations. Even one means your risk management needs work."
        />
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
