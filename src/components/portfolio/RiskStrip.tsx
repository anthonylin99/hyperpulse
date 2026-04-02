"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, cn } from "@/lib/format";

interface RiskCardProps {
  label: string;
  value: string;
  color?: string;
}

function RiskCard({ label, value, color }: RiskCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex-1 min-w-0">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5 truncate">
        {label}
      </div>
      <div className={cn("text-sm font-bold truncate", color ?? "text-zinc-100")}>
        {value}
      </div>
    </div>
  );
}

export default function RiskStrip() {
  const { accountState } = useWallet();

  const metrics = useMemo(() => {
    if (!accountState) return null;

    const { totalMarginUsed, accountValue, withdrawable, positions } =
      accountState;

    // Margin used %
    const marginPct =
      accountValue > 0 ? (totalMarginUsed / accountValue) * 100 : 0;

    // Buying power
    const buyingPower = withdrawable;

    // Weighted average leverage (by notional)
    let totalNotional = 0;
    let weightedLev = 0;
    for (const p of positions) {
      const notional = Math.abs(p.szi) * p.markPx;
      totalNotional += notional;
      weightedLev += notional * p.leverage;
    }
    const avgLeverage = totalNotional > 0 ? weightedLev / totalNotional : 0;

    // Nearest liquidation
    let nearestCoin: string | null = null;
    let nearestDist = Infinity;
    for (const p of positions) {
      if (!p.liquidationPx || p.markPx <= 0) continue;
      const dist =
        p.szi > 0
          ? ((p.markPx - p.liquidationPx) / p.markPx) * 100
          : ((p.liquidationPx - p.markPx) / p.markPx) * 100;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestCoin = p.coin;
      }
    }

    return {
      marginPct,
      buyingPower,
      avgLeverage,
      nearestCoin,
      nearestDist: nearestDist === Infinity ? null : nearestDist,
      positionCount: positions.length,
    };
  }, [accountState]);

  if (!accountState || !metrics) return null;

  const marginColor =
    metrics.marginPct > 80
      ? "text-red-400"
      : metrics.marginPct > 60
        ? "text-orange-400"
        : "text-zinc-100";

  const levColor =
    metrics.avgLeverage > 10
      ? "text-red-400"
      : metrics.avgLeverage > 5
        ? "text-orange-400"
        : "text-zinc-100";

  const liqColor =
    metrics.nearestDist !== null && metrics.nearestDist < 10
      ? "text-red-400"
      : metrics.nearestDist !== null && metrics.nearestDist < 20
        ? "text-orange-400"
        : "text-zinc-100";

  return (
    <div className="flex gap-2">
      <RiskCard
        label="Margin Used"
        value={`${metrics.marginPct.toFixed(1)}%`}
        color={marginColor}
      />
      <RiskCard
        label="Buying Power"
        value={formatUSD(metrics.buyingPower)}
      />
      <RiskCard
        label="Avg Leverage"
        value={`${metrics.avgLeverage.toFixed(1)}x`}
        color={levColor}
      />
      <RiskCard
        label="Nearest Liq"
        value={
          metrics.nearestCoin && metrics.nearestDist !== null
            ? `${metrics.nearestCoin} ${metrics.nearestDist.toFixed(1)}%`
            : "---"
        }
        color={liqColor}
      />
      <RiskCard
        label="Open Positions"
        value={metrics.positionCount.toString()}
      />
    </div>
  );
}
