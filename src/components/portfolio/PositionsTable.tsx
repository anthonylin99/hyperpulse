"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { cn, formatUSD } from "@/lib/format";
import type { Position } from "@/types";

function liqDistancePct(position: Position): number | null {
  if (!position.liquidationPx || position.markPx <= 0) return null;
  if (position.szi > 0) {
    return ((position.markPx - position.liquidationPx) / position.markPx) * 100;
  }
  return ((position.liquidationPx - position.markPx) / position.markPx) * 100;
}

function riskTone(dist: number | null): "default" | "warning" | "danger" {
  if (dist == null) return "default";
  if (dist < 10) return "danger";
  if (dist < 20) return "warning";
  return "default";
}

export default function PositionsTable({ density = "compact" }: { density?: "compact" | "roomy" }) {
  const { accountState } = useWallet();
  const positions = useMemo(
    () => [...(accountState?.positions ?? []), ...(accountState?.spotPositions ?? [])],
    [accountState?.positions, accountState?.spotPositions],
  );

  const sorted = useMemo(
    () =>
      [...positions].sort(
        (a, b) => Math.abs(b.szi) * b.markPx - Math.abs(a.szi) * a.markPx,
      ),
    [positions],
  );

  const totals = useMemo(() => {
    let notional = 0;
    let pnl = 0;

    for (const position of sorted) {
      notional += Math.abs(position.szi) * position.markPx;
      pnl += position.unrealizedPnl;
    }

    return { notional, pnl };
  }, [sorted]);

  if (sorted.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950/85">
      <div className={cn("border-b border-zinc-800", density === "roomy" ? "px-6 py-5" : "px-5 py-4")}>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
          Positions
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="text-lg font-semibold text-zinc-100">
            Hyperliquid-style position view
          </div>
          <div className="text-sm text-zinc-500">
            {sorted.length} position{sorted.length === 1 ? "" : "s"} • {formatUSD(totals.notional)} value • 5m snapshot
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", density === "roomy" ? "min-w-[1100px]" : "min-w-[1020px]")}>
          <thead className="bg-zinc-950/90">
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              <th className="px-5 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Position Value</th>
              <th className="px-4 py-3 font-medium">Entry Price</th>
              <th className="px-4 py-3 font-medium">Mark Price</th>
              <th className="px-4 py-3 font-medium">P&amp;L (ROE)</th>
              <th className="px-4 py-3 font-medium">Liq. Price</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => {
              const isLong = position.szi > 0;
              const notional = Math.abs(position.szi) * position.markPx;
              const pnlPct = position.returnOnEquity * 100;
              const dist = liqDistancePct(position);
              const tone = riskTone(dist);
              const isSpot = position.marketType === "hip3_spot";

              return (
                <tr key={position.coin} className="border-b border-zinc-800/70 align-top">
                  <td className={cn(density === "roomy" ? "px-5 py-5" : "px-5 py-4")}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-medium text-zinc-100">{position.coin}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]",
                              isSpot
                                ? "bg-zinc-800 text-zinc-300"
                                : isLong
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-red-500/10 text-red-300",
                            )}
                          >
                            {isSpot ? "Spot" : isLong ? "Long" : "Short"}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {isSpot ? "wallet balance" : `${position.leverage.toFixed(1)}x`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                    <div className="font-medium text-zinc-100">{formatUSD(notional)}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {Math.abs(position.szi).toFixed(4)} {position.coin}
                    </div>
                  </td>
                  <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                    <div className="font-medium text-zinc-100">
                      {formatUSD(position.entryPx, position.entryPx < 1 ? 5 : 2)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Entry</div>
                  </td>
                  <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                    <div className="font-medium text-zinc-100">
                      {formatUSD(position.markPx, position.markPx < 1 ? 5 : 2)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Mark</div>
                  </td>
                  <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                    <div
                      className={cn(
                        "font-medium",
                        position.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {formatUSD(position.unrealizedPnl)}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-xs",
                        pnlPct >= 0 ? "text-emerald-300/80" : "text-red-300/80",
                      )}
                    >
                      {pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(1)}% ROE
                    </div>
                  </td>
                  <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                    <div className="font-medium text-zinc-100">
                      {position.liquidationPx
                        ? formatUSD(position.liquidationPx, position.liquidationPx < 1 ? 5 : 2)
                        : "N/A"}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-xs font-medium",
                        tone === "danger"
                          ? "text-red-400"
                          : tone === "warning"
                            ? "text-amber-300"
                            : "text-zinc-400",
                      )}
                    >
                      {isSpot
                        ? "Spot balance"
                        : dist !== null
                          ? `${dist.toFixed(1)}% to liq`
                          : "Liquidation unavailable"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-950/90">
            <tr className="text-sm">
              <td className="px-5 py-4 font-medium text-zinc-200">
                Total
                <div className="mt-1 text-xs font-normal text-zinc-500">
                  {sorted.length} open holding{sorted.length === 1 ? "" : "s"}
                </div>
              </td>
              <td className="px-4 py-4 text-zinc-300">{formatUSD(totals.notional)}</td>
              <td className="px-4 py-4 text-zinc-500">Portfolio average</td>
              <td className="px-4 py-4 text-zinc-500">Latest snapshot</td>
              <td
                className={cn(
                  "px-4 py-4 font-medium",
                  totals.pnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {formatUSD(totals.pnl)}
              </td>
              <td className="px-4 py-4 text-zinc-500">Review risk strip above for aggregate risk.</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
