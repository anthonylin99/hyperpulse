"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";
import type { RoundTripTrade } from "@/types";

function formatDuration(ms: number): string {
  const mins = ms / (1000 * 60);
  if (mins < 60) return `${mins.toFixed(0)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

interface AssetDetailModalProps {
  coin: string;
  onClose: () => void;
}

export default function AssetDetailModal({ coin, onClose }: AssetDetailModalProps) {
  const { trades, funding } = usePortfolio();

  const coinTrades = useMemo(
    () => trades.filter((t) => t.coin === coin).sort((a, b) => b.exitTime - a.exitTime),
    [trades, coin],
  );

  const coinFunding = useMemo(
    () => funding.filter((f) => f.coin === coin),
    [funding, coin],
  );

  const stats = useMemo(() => {
    if (coinTrades.length === 0) return null;
    const wins = coinTrades.filter((t) => t.pnl > 0);
    const losses = coinTrades.filter((t) => t.pnl <= 0);
    const totalPnl = coinTrades.reduce((s, t) => s + t.pnl, 0);
    const totalVolume = coinTrades.reduce((s, t) => s + t.notional, 0);
    const totalFees = coinTrades.reduce((s, t) => s + t.fees, 0);
    const totalFunding = coinFunding.reduce((s, f) => s + f.usdc, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    const avgHold = coinTrades.reduce((s, t) => s + t.duration, 0) / coinTrades.length;
    const longs = coinTrades.filter((t) => t.direction === "long");
    const shorts = coinTrades.filter((t) => t.direction === "short");
    const longPnl = longs.reduce((s, t) => s + t.pnl, 0);
    const shortPnl = shorts.reduce((s, t) => s + t.pnl, 0);
    const bestTrade = coinTrades.reduce((best, t) => (t.pnl > best.pnl ? t : best), coinTrades[0]);
    const worstTrade = coinTrades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst), coinTrades[0]);

    // Cumulative P&L for sparkline
    const cumPnl: { time: number; pnl: number }[] = [];
    let running = 0;
    const sorted = [...coinTrades].sort((a, b) => a.exitTime - b.exitTime);
    for (const t of sorted) {
      running += t.pnl;
      cumPnl.push({ time: t.exitTime, pnl: running });
    }

    return {
      totalPnl,
      totalVolume,
      totalFees,
      totalFunding,
      winRate: wins.length / coinTrades.length,
      avgWin,
      avgLoss,
      avgHold,
      tradeCount: coinTrades.length,
      longCount: longs.length,
      shortCount: shorts.length,
      longPnl,
      shortPnl,
      bestTrade,
      worstTrade,
      cumPnl,
    };
  }, [coinTrades, coinFunding]);

  if (!stats) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-zinc-100">{coin}</h2>
            <span
              className={cn(
                "text-sm font-medium",
                stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {stats.totalPnl >= 0 ? "+" : ""}
              {formatUSD(stats.totalPnl)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-lg px-2 transition-colors"
          >
            x
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
          <StatCard label="Trades" value={stats.tradeCount.toString()} />
          <StatCard
            label="Win Rate"
            value={`${(stats.winRate * 100).toFixed(0)}%`}
            color={stats.winRate >= 0.5 ? "text-emerald-400" : "text-red-400"}
          />
          <StatCard
            label="Avg Win"
            value={formatUSD(stats.avgWin)}
            color="text-emerald-400"
          />
          <StatCard
            label="Avg Loss"
            value={formatUSD(stats.avgLoss)}
            color="text-red-400"
          />
          <StatCard label="Volume" value={formatUSD(stats.totalVolume)} />
          <StatCard label="Fees Paid" value={formatUSD(stats.totalFees)} color="text-red-400" />
          <StatCard
            label="Funding"
            value={formatUSD(stats.totalFunding)}
            color={stats.totalFunding >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <StatCard label="Avg Hold" value={formatDuration(stats.avgHold)} />
        </div>

        {/* Long vs Short */}
        <div className="px-6 pb-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-zinc-500">Long:</span>
            <span className="text-zinc-300">{stats.longCount} trades</span>
            <span className={stats.longPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {stats.longPnl >= 0 ? "+" : ""}
              {formatUSD(stats.longPnl)}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">Short:</span>
            <span className="text-zinc-300">{stats.shortCount} trades</span>
            <span className={stats.shortPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {stats.shortPnl >= 0 ? "+" : ""}
              {formatUSD(stats.shortPnl)}
            </span>
          </div>
        </div>

        {/* Cumulative P&L mini chart (text-based) */}
        <div className="px-6 pb-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Cumulative P&L
          </div>
          <div className="flex items-end gap-px h-12">
            {stats.cumPnl.map((point, i) => {
              const maxAbs = Math.max(...stats.cumPnl.map((p) => Math.abs(p.pnl)), 1);
              const height = Math.max((Math.abs(point.pnl) / maxAbs) * 100, 4);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-sm min-w-[3px]",
                    point.pnl >= 0 ? "bg-emerald-500/60" : "bg-red-500/60",
                  )}
                  style={{ height: `${height}%` }}
                  title={`${new Date(point.time).toLocaleDateString()}: ${formatUSD(point.pnl)}`}
                />
              );
            })}
          </div>
        </div>

        {/* Trade History Table */}
        <div className="px-6 pb-6">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            All {coin} Trades
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left px-2 py-1.5">Date</th>
                  <th className="text-left px-2 py-1.5">Dir</th>
                  <th className="text-right px-2 py-1.5">Entry</th>
                  <th className="text-right px-2 py-1.5">Exit</th>
                  <th className="text-right px-2 py-1.5">Size</th>
                  <th className="text-right px-2 py-1.5">P&L</th>
                  <th className="text-right px-2 py-1.5">P&L %</th>
                  <th className="text-right px-2 py-1.5">Duration</th>
                </tr>
              </thead>
              <tbody>
                {coinTrades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
        {label}
      </div>
      <div className={cn("text-sm font-medium", color || "text-zinc-200")}>
        {value}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: RoundTripTrade }) {
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
      <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
        {new Date(trade.exitTime).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            trade.direction === "long"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400",
          )}
        >
          {trade.direction.toUpperCase()}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">
        {trade.entryPx < 1
          ? trade.entryPx.toPrecision(4)
          : trade.entryPx.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">
        {trade.exitPx < 1
          ? trade.exitPx.toPrecision(4)
          : trade.exitPx.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-1.5 text-right text-zinc-400 font-mono">
        {formatUSD(trade.notional)}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right font-mono font-medium",
          trade.pnl >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        {trade.pnl >= 0 ? "+" : ""}
        {formatUSD(trade.pnl)}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right font-mono",
          trade.pnlPct >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        {trade.pnlPct >= 0 ? "+" : ""}
        {trade.pnlPct.toFixed(2)}%
      </td>
      <td className="px-2 py-1.5 text-right text-zinc-400">
        {formatDuration(trade.duration)}
      </td>
    </tr>
  );
}
