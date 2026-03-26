"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

export default function FundingAnalysis() {
  const { funding, stats } = usePortfolio();

  const analysis = useMemo(() => {
    if (funding.length === 0) return null;

    // Group by coin
    const byCoin = new Map<string, { paid: number; earned: number; count: number }>();
    for (const f of funding) {
      const entry = byCoin.get(f.coin) ?? { paid: 0, earned: 0, count: 0 };
      if (f.usdc < 0) {
        entry.paid += Math.abs(f.usdc);
      } else {
        entry.earned += f.usdc;
      }
      entry.count++;
      byCoin.set(f.coin, entry);
    }

    const totalPaid = funding
      .filter((f) => f.usdc < 0)
      .reduce((s, f) => s + Math.abs(f.usdc), 0);
    const totalEarned = funding
      .filter((f) => f.usdc > 0)
      .reduce((s, f) => s + f.usdc, 0);

    return {
      totalPaid,
      totalEarned,
      net: totalEarned - totalPaid,
      byCoin: Array.from(byCoin.entries())
        .map(([coin, data]) => ({
          coin,
          ...data,
          net: data.earned - data.paid,
        }))
        .sort((a, b) => a.net - b.net), // worst first
      count: funding.length,
    };
  }, [funding]);

  if (!analysis) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">
        Funding Analysis
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-xs text-zinc-500">Paid</div>
          <div className="text-sm font-bold text-red-400">
            -{formatUSD(analysis.totalPaid)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Earned</div>
          <div className="text-sm font-bold text-emerald-400">
            +{formatUSD(analysis.totalEarned)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Net</div>
          <div
            className={cn(
              "text-sm font-bold",
              analysis.net >= 0 ? "text-emerald-400" : "text-red-400",
            )}
          >
            {analysis.net >= 0 ? "+" : ""}
            {formatUSD(analysis.net)}
          </div>
        </div>
      </div>

      {/* Funding as % of profit */}
      {stats && stats.totalPnl > 0 && analysis.totalPaid > 0 && (
        <div className="text-xs text-zinc-500 mb-4 bg-zinc-800/50 rounded px-3 py-2">
          Funding costs = {((analysis.totalPaid / stats.totalPnl) * 100).toFixed(1)}%
          of realized profit
        </div>
      )}

      {/* By coin */}
      <div className="space-y-1.5">
        {analysis.byCoin.map((item) => (
          <div
            key={item.coin}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-zinc-300 font-medium w-16">{item.coin}</span>
            <span className="text-zinc-500">{item.count} payments</span>
            <span
              className={cn(
                "font-mono",
                item.net >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {item.net >= 0 ? "+" : ""}
              {formatUSD(item.net)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
