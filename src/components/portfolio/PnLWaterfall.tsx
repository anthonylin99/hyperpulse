"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

export default function PnLWaterfall() {
  const { stats } = usePortfolio();

  if (!stats || stats.totalTrades === 0) return null;

  const items = [
    {
      label: "Gross Profit",
      value: stats.grossProfit,
      detail: `${stats.winners} winning trades`,
      color: "bg-emerald-500",
    },
    {
      label: "Gross Loss",
      value: -stats.grossLoss,
      detail: `${stats.losers} losing trades`,
      color: "bg-red-500",
    },
    {
      label: "Trading Fees",
      value: -stats.totalFeesPaid,
      detail: `${((stats.totalFeesPaid / (stats.grossProfit + stats.grossLoss || 1)) * 100).toFixed(1)}% of volume`,
      color: "bg-orange-500",
    },
    {
      label: "Funding Payments",
      value: stats.totalFundingNet,
      detail: stats.totalFundingNet >= 0 ? "earned from funding" : "paid in funding",
      color: stats.totalFundingNet >= 0 ? "bg-emerald-500" : "bg-purple-500",
    },
  ];

  const netPnl = stats.totalPnl;
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), Math.abs(netPnl), 1);

  // Calculate what % of gross profit was lost to each category
  const profitLeakage = stats.grossProfit > 0
    ? [
        { label: "Kept as profit", pct: Math.max(netPnl, 0) / stats.grossProfit * 100 },
        { label: "Lost to bad trades", pct: stats.grossLoss / stats.grossProfit * 100 },
        { label: "Lost to fees", pct: stats.totalFeesPaid / stats.grossProfit * 100 },
        { label: "Lost to funding", pct: Math.max(-stats.totalFundingNet, 0) / stats.grossProfit * 100 },
      ]
    : [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-1">Where Your Money Went</h3>
      <p className="text-xs text-zinc-600 mb-4">
        Breaking down every dollar of P&L
      </p>

      <div className="space-y-3">
        {items.map((item) => {
          const pct = (Math.abs(item.value) / maxAbs) * 100;
          const isPositive = item.value >= 0;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-300">{item.label}</span>
                  <span className="text-[10px] text-zinc-600">{item.detail}</span>
                </div>
                <span
                  className={cn(
                    "text-sm font-mono font-medium",
                    isPositive ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {isPositive ? "+" : ""}
                  {formatUSD(item.value)}
                </span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", item.color)}
                  style={{ width: `${Math.min(pct, 100)}%`, opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}

        {/* Net result */}
        <div className="border-t border-zinc-700 pt-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Net P&L</span>
            <span
              className={cn(
                "text-lg font-bold font-mono",
                netPnl >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {netPnl >= 0 ? "+" : ""}
              {formatUSD(netPnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Profit leakage breakdown */}
      {stats.grossProfit > 0 && profitLeakage.length > 0 && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">
            For every $1 you made in winning trades:
          </div>
          <div className="flex h-3 rounded-full overflow-hidden">
            {profitLeakage.map((item, i) => {
              const colors = [
                "bg-emerald-500",
                "bg-red-500",
                "bg-orange-500",
                "bg-purple-500",
              ];
              return (
                <div
                  key={item.label}
                  className={cn(colors[i], "transition-all")}
                  style={{ width: `${Math.min(item.pct, 100)}%`, opacity: 0.8 }}
                  title={`${item.label}: ${item.pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {profitLeakage.map((item, i) => {
              const colors = [
                "text-emerald-400",
                "text-red-400",
                "text-orange-400",
                "text-purple-400",
              ];
              const dots = [
                "bg-emerald-500",
                "bg-red-500",
                "bg-orange-500",
                "bg-purple-500",
              ];
              return (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", dots[i])} />
                  <span className="text-[10px] text-zinc-500">{item.label}</span>
                  <span className={cn("text-[10px] font-mono", colors[i])}>
                    {item.pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
