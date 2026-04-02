"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface SignalItem {
  title: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
}

export default function TradeSignals() {
  const { stats, byHour, byAsset, funding } = usePortfolio();

  const items = useMemo<SignalItem[]>(() => {
    if (!stats || stats.totalTrades < 5) return [];

    const signals: SignalItem[] = [];

    // Funding drag signal
    const fundingCount = funding.length;
    if (stats.grossProfit > 0 && fundingCount >= 10) {
      const fundingDrag = Math.abs(stats.totalFundingNet) / stats.grossProfit;
      if (stats.totalFundingNet < 0 && fundingDrag >= 0.1) {
        signals.push({
          title: "Funding Drag",
          detail: `${formatUSD(Math.abs(stats.totalFundingNet))} paid — ${(fundingDrag * 100).toFixed(0)}% of gross profit` ,
          tone: "warning",
        });
      }
    }

    const hourBins = byHour.filter((h) => h.trades >= 3);
    if (hourBins.length >= 2) {
      const best = hourBins.reduce((a, b) => (a.pnl > b.pnl ? a : b));
      const worst = hourBins.reduce((a, b) => (a.pnl < b.pnl ? a : b));
      if (best.pnl > 0) {
        signals.push({
          title: `Best Hour: ${best.hour}:00 UTC`,
          detail: `${formatUSD(best.pnl)} P&L, ${(best.winRate * 100).toFixed(0)}% win rate`,
          tone: "positive",
        });
      }
      if (worst.pnl < 0 && worst.hour !== best.hour) {
        signals.push({
          title: `Avoid: ${worst.hour}:00 UTC`,
          detail: `${formatUSD(worst.pnl)} P&L, ${(worst.winRate * 100).toFixed(0)}% win rate`,
          tone: "warning",
        });
      }
    }

    const assetBins = byAsset.filter((a) => a.trades >= 3);
    if (assetBins.length >= 2) {
      const sorted = [...assetBins].sort((a, b) => b.pnl - a.pnl);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best && best.pnl > 0) {
        signals.push({
          title: `Best Asset: ${best.coin}`,
          detail: `${formatUSD(best.pnl)} P&L, ${(best.winRate * 100).toFixed(0)}% win rate`,
          tone: "positive",
        });
      }
      if (worst && worst.pnl < 0 && worst.coin !== best.coin) {
        signals.push({
          title: `Worst Asset: ${worst.coin}`,
          detail: `${formatUSD(worst.pnl)} P&L, ${(worst.winRate * 100).toFixed(0)}% win rate`,
          tone: "warning",
        });
      }
    }

    return signals.slice(0, 3);
  }, [stats, byHour, byAsset, funding]);

  if (items.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-zinc-400">Trade Signals</h3>
        <span className="text-[10px] text-zinc-600">data-backed hints</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              "rounded-md border px-3 py-2",
              item.tone === "positive"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : item.tone === "warning"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-zinc-800 bg-zinc-900"
            )}
          >
            <div className="text-[11px] text-zinc-200 font-medium">{item.title}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
