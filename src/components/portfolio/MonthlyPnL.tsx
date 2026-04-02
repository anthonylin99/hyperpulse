"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface MonthData {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  winRate: number;
  bestPnl: number;
  worstPnl: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function MonthlyPnL() {
  const { trades, loading } = usePortfolio();

  const months = useMemo<MonthData[]>(() => {
    if (trades.length === 0) return [];

    const grouped = new Map<string, { pnl: number; wins: number; total: number; best: number; worst: number }>();

    for (const t of trades) {
      const d = new Date(t.exitTime);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;

      let entry = grouped.get(key);
      if (!entry) {
        entry = { pnl: 0, wins: 0, total: 0, best: -Infinity, worst: Infinity };
        grouped.set(key, entry);
      }

      entry.pnl += t.pnl;
      entry.total += 1;
      if (t.pnl > 0) entry.wins += 1;
      if (t.pnl > entry.best) entry.best = t.pnl;
      if (t.pnl < entry.worst) entry.worst = t.pnl;
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [yearStr, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          key,
          label: `${MONTH_NAMES[monthIdx]} ${yearStr}`,
          pnl: data.pnl,
          trades: data.total,
          winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
          bestPnl: data.best === -Infinity ? 0 : data.best,
          worstPnl: data.worst === Infinity ? 0 : data.worst,
        };
      });
  }, [trades]);

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="skeleton h-4 w-36 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) return null;
  if (months.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">Monthly Performance</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {months.map((m) => {
          const isPositive = m.pnl >= 0;
          return (
            <div
              key={m.key}
              className={cn(
                "rounded-lg p-3 border transition-colors",
                isPositive
                  ? "bg-emerald-400/5 border-emerald-400/10"
                  : "bg-red-400/5 border-red-400/10"
              )}
            >
              <div className="text-xs text-zinc-400 font-medium">{m.label}</div>
              <div
                className={cn(
                  "text-base font-semibold mt-1",
                  isPositive ? "text-emerald-400" : "text-red-400"
                )}
              >
                {isPositive ? "+" : ""}
                {formatUSD(m.pnl)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-1.5">
                {m.trades} trade{m.trades !== 1 ? "s" : ""}
                <span className="mx-1 text-zinc-700">|</span>
                {m.winRate.toFixed(0)}% win
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
