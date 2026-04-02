"use client";

import { useMemo, useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

export default function FundingAnalysis() {
  const { funding, stats, loading, trades } = usePortfolio();
  const [expanded, setExpanded] = useState(false);

  const analysis = useMemo(() => {
    if (funding.length === 0) return null;

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
        .sort((a, b) => a.net - b.net),
      count: funding.length,
    };
  }, [funding]);

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <div className="skeleton h-4 w-32 rounded mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="skeleton h-3 w-12 rounded mb-1" />
              <div className="skeleton h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-400">Funding Analysis</h3>
        {stats && stats.totalPnl > 0 && analysis.totalPaid > 0 && analysis.count >= 10 && (
          <span className="text-[10px] text-zinc-500">
            {((analysis.totalPaid / stats.totalPnl) * 100).toFixed(1)}% of profit
          </span>
        )}
        {analysis.count < 10 && (
          <span className="text-[10px] text-zinc-600">low sample</span>
        )}
      </div>

      {/* Compact summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-zinc-500">Paid</div>
          <div className="text-sm font-bold text-red-400">
            -{formatUSD(analysis.totalPaid)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">Earned</div>
          <div className="text-sm font-bold text-emerald-400">
            +{formatUSD(analysis.totalEarned)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">Net</div>
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

      {/* Expandable per-coin breakdown */}
      {analysis.byCoin.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            {expanded ? "Hide" : "Show"} per-coin breakdown ({analysis.byCoin.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {analysis.byCoin.map((item) => (
                <div
                  key={item.coin}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-zinc-300 font-medium w-14">{item.coin}</span>
                  <span className="text-zinc-600">{item.count}</span>
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
          )}
        </div>
      )}
    </div>
  );
}
