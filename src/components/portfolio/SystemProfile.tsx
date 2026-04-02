"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD } from "@/lib/format";

export default function SystemProfile() {
  const { stats, byAsset, byHour } = usePortfolio();

  const profile = useMemo(() => {
    if (!stats || stats.totalTrades < 5) return null;

    const winRate = stats.winRate;
    const payoff = stats.payoffRatio;
    const expectancy = stats.expectancy;

    let edgeLabel = "Developing edge";
    if (expectancy > 0 && winRate >= 0.55 && payoff >= 1.2) edgeLabel = "Positive edge";
    else if (expectancy < 0) edgeLabel = "Negative edge";

    let styleLabel = "Balanced";
    if (winRate >= 0.6 && payoff < 1) styleLabel = "High win-rate, small winners";
    if (winRate < 0.45 && payoff >= 1.8) styleLabel = "Low win‑rate, big winners";

    const assetBins = byAsset.filter((a) => a.trades >= 3);
    const bestAsset = assetBins.length > 0 ? [...assetBins].sort((a, b) => b.pnl - a.pnl)[0] : null;

    const hourBins = byHour.filter((h) => h.trades >= 3);
    const bestHour = hourBins.length > 0 ? hourBins.reduce((a, b) => (a.pnl > b.pnl ? a : b)) : null;

    return {
      edgeLabel,
      styleLabel,
      expectancy,
      bestAsset,
      bestHour,
    };
  }, [stats, byAsset, byHour]);

  if (!profile) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-zinc-400">System Profile</h3>
        <span className="text-[10px] text-zinc-600">what your data says</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[11px] text-zinc-500">Edge</div>
          <div className="text-[12px] text-zinc-200 font-medium">{profile.edgeLabel}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Expectancy: {formatUSD(profile.expectancy)}/trade</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[11px] text-zinc-500">Style</div>
          <div className="text-[12px] text-zinc-200 font-medium">{profile.styleLabel}</div>
          {profile.bestAsset && (
            <div className="text-[10px] text-zinc-500 mt-0.5">Best asset: {profile.bestAsset.coin}</div>
          )}
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[11px] text-zinc-500">Timing</div>
          <div className="text-[12px] text-zinc-200 font-medium">
            {profile.bestHour ? `Best hour: ${profile.bestHour.hour}:00 UTC` : "Not enough data"}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Trade Insights below for specifics</div>
        </div>
      </div>
    </div>
  );
}
