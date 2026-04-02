"use client";

import { useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";
import AssetDetailModal from "./AssetDetailModal";

export default function AssetBreakdown() {
  const { byAsset, loading, trades } = usePortfolio();
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="skeleton h-4 w-24 rounded mb-4" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-4 w-16 rounded shrink-0" />
              <div className="skeleton h-6 flex-1 rounded" />
              <div className="skeleton h-4 w-20 rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (byAsset.length === 0) return null;

  const maxAbsPnl = Math.max(...byAsset.map((a) => Math.abs(a.pnl)), 1);

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">
          P&L by Asset
          <span className="text-zinc-600 text-xs ml-2 font-normal">click for details</span>
        </h3>
        <div className="space-y-2">
          {byAsset.map((asset) => {
            const barWidth = (Math.abs(asset.pnl) / maxAbsPnl) * 100;
            const isPos = asset.pnl >= 0;

            return (
              <button
                key={asset.coin}
                onClick={() => setSelectedCoin(asset.coin)}
                className="w-full flex items-center gap-3 rounded-md hover:bg-zinc-800/50 transition-colors px-1 py-0.5 -mx-1 text-left"
              >
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
              </button>
            );
          })}
        </div>
      </div>

      {selectedCoin && (
        <AssetDetailModal
          coin={selectedCoin}
          onClose={() => setSelectedCoin(null)}
        />
      )}
    </>
  );
}
