"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, cn } from "@/lib/format";

interface RiskCardProps {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "warning" | "danger";
}

function RiskCard({ label, value, helper, tone = "default" }: RiskCardProps) {
  return (
    <div className="rounded-[22px] border border-zinc-800 bg-zinc-950/85 px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-3 text-xl font-semibold tracking-tight",
          tone === "danger"
            ? "text-red-400"
            : tone === "warning"
              ? "text-amber-300"
              : "text-zinc-100",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-500">{helper}</div>
    </div>
  );
}

export default function RiskStrip({ density = "compact" }: { density?: "compact" | "roomy" }) {
  const { accountState } = useWallet();

  const metrics = useMemo(() => {
    if (!accountState) return null;

    const { totalMarginUsed, accountValue, withdrawable, positions } = accountState;
    const marginPct = accountValue > 0 ? (totalMarginUsed / accountValue) * 100 : 0;

    let totalNotional = 0;
    let weightedLev = 0;
    for (const position of positions) {
      const notional = Math.abs(position.szi) * position.markPx;
      totalNotional += notional;
      weightedLev += notional * position.leverage;
    }
    const avgLeverage = totalNotional > 0 ? weightedLev / totalNotional : 0;

    let nearestCoin: string | null = null;
    let nearestDist = Infinity;
    for (const position of positions) {
      if (!position.liquidationPx || position.markPx <= 0) continue;
      const dist =
        position.szi > 0
          ? ((position.markPx - position.liquidationPx) / position.markPx) * 100
          : ((position.liquidationPx - position.markPx) / position.markPx) * 100;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestCoin = position.coin;
      }
    }

    return {
      marginPct,
      buyingPower: withdrawable,
      avgLeverage,
      nearestCoin,
      nearestDist: nearestDist === Infinity ? null : nearestDist,
      openPositions: positions.length,
    };
  }, [accountState]);

  if (!accountState || !metrics) return null;

  return (
    <section className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", density === "roomy" && "gap-4")}>
      <RiskCard
        label="Margin Used"
        value={`${metrics.marginPct.toFixed(1)}%`}
        helper="How much of account equity is currently tied up in active margin."
        tone={metrics.marginPct > 80 ? "danger" : metrics.marginPct > 60 ? "warning" : "default"}
      />
      <RiskCard
        label="Buying Power"
        value={formatUSD(metrics.buyingPower)}
        helper="Withdrawable balance that can still support new trades or absorb volatility."
      />
      <RiskCard
        label="Average Leverage"
        value={`${metrics.avgLeverage.toFixed(1)}x`}
        helper={`${metrics.openPositions} open position${metrics.openPositions === 1 ? "" : "s"} contributing to the current book.`}
        tone={metrics.avgLeverage > 10 ? "danger" : metrics.avgLeverage > 5 ? "warning" : "default"}
      />
      <RiskCard
        label="Nearest Liquidation"
        value={
          metrics.nearestCoin && metrics.nearestDist !== null
            ? `${metrics.nearestCoin} ${metrics.nearestDist.toFixed(1)}%`
            : "--"
        }
        helper="The closest live position to its liquidation threshold."
        tone={
          metrics.nearestDist !== null && metrics.nearestDist < 10
            ? "danger"
            : metrics.nearestDist !== null && metrics.nearestDist < 20
              ? "warning"
              : "default"
        }
      />
    </section>
  );
}
