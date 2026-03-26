"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

export default function AssetBreakdown() {
  const { byAsset } = usePortfolio();

  if (byAsset.length === 0) return null;

  const maxAbsPnl = Math.max(...byAsset.map((a) => Math.abs(a.pnl)), 1);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">P&L by Asset</h3>
      <div className="space-y-2">
        {byAsset.map((asset) => {
          const barWidth = (Math.abs(asset.pnl) / maxAbsPnl) * 100;
          const isPos = asset.pnl >= 0;

          return (
            <div key={asset.coin} className="flex items-center gap-3">
              <span className="text-xs text-zinc-300 w-16 font-medium shrink-0">
                {asset.coin}
              </span>
              <div className="flex-1 relative h-6">
                <div
                  className={cn(
                    "absolute top-0 h-full rounded",
                    isPos ? "bg-emerald-500/20" : "bg-red-500/20",
                  )}
                  style={{ width: `${Math.max(barWidth, 2)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2">
                  <span
                    className={cn(
                      "text-xs font-mono",
                      isPos ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {isPos ? "+" : ""}
                    {formatUSD(asset.pnl)}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 w-20">
                <span className="text-xs text-zinc-500">
                  {(asset.winRate * 100).toFixed(0)}% / {asset.trades}t
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
