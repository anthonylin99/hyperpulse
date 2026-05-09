"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, cn } from "@/lib/format";
import { StatTile } from "@/components/ui";

type Tone = "neutral" | "warning" | "danger";
const toneToState: Record<Tone, "neutral" | "warning" | "danger"> = {
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
};

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

  const marginTone: Tone = metrics.marginPct > 80 ? "danger" : metrics.marginPct > 60 ? "warning" : "neutral";
  const levTone: Tone = metrics.avgLeverage > 10 ? "danger" : metrics.avgLeverage > 5 ? "warning" : "neutral";
  const liqTone: Tone =
    metrics.nearestDist !== null && metrics.nearestDist < 10
      ? "danger"
      : metrics.nearestDist !== null && metrics.nearestDist < 20
        ? "warning"
        : "neutral";

  return (
    <section className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", density === "roomy" && "gap-4")}>
      <StatTile
        label="Margin %"
        value={`${metrics.marginPct.toFixed(1)}%`}
        sub="Equity used by open positions."
        state={toneToState[marginTone]}
      />
      <StatTile
        label="Available"
        value={formatUSD(metrics.buyingPower)}
        sub="Unused margin you can deploy."
      />
      <StatTile
        label="Avg leverage"
        value={`${metrics.avgLeverage.toFixed(1)}x`}
        sub={`${metrics.openPositions} open position${metrics.openPositions === 1 ? "" : "s"}.`}
        state={toneToState[levTone]}
      />
      <StatTile
        label="Nearest liq"
        value={
          metrics.nearestCoin && metrics.nearestDist !== null
            ? `${metrics.nearestCoin} ${metrics.nearestDist.toFixed(1)}%`
            : "--"
        }
        state={toneToState[liqTone]}
      />
    </section>
  );
}
