"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, cn } from "@/lib/format";
import type { Position } from "@/types";

function liqDistancePct(pos: Position): number | null {
  if (!pos.liquidationPx || pos.markPx <= 0) return null;
  if (pos.szi > 0) {
    return ((pos.markPx - pos.liquidationPx) / pos.markPx) * 100;
  }
  return ((pos.liquidationPx - pos.markPx) / pos.markPx) * 100;
}

function liqDistanceColor(dist: number | null): string {
  if (dist === null) return "text-zinc-500";
  if (dist < 10) return "text-red-400";
  if (dist < 20) return "text-orange-400";
  return "text-zinc-300";
}

export default function PositionsTable() {
  const { accountState } = useWallet();
  const positions = accountState?.positions ?? [];

  const sorted = useMemo(
    () =>
      [...positions].sort(
        (a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl)
      ),
    [positions]
  );

  const totals = useMemo(() => {
    let notional = 0;
    let pnl = 0;
    for (const p of sorted) {
      notional += Math.abs(p.szi) * p.markPx;
      pnl += p.unrealizedPnl;
    }
    return { notional, pnl };
  }, [sorted]);

  if (sorted.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-lg">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left p-2 font-medium">Asset</th>
            <th className="text-left p-2 font-medium">Side</th>
            <th className="text-right p-2 font-medium">Size</th>
            <th className="text-right p-2 font-medium">Notional</th>
            <th className="text-right p-2 font-medium">Entry</th>
            <th className="text-right p-2 font-medium">Mark</th>
            <th className="text-right p-2 font-medium">Unrealized P&L</th>
            <th className="text-right p-2 font-medium">P&L%</th>
            <th className="text-right p-2 font-medium">Leverage</th>
            <th className="text-right p-2 font-medium">Liq Price</th>
            <th className="text-right p-2 font-medium">Liq Dist%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pos) => {
            const isLong = pos.szi > 0;
            const notional = Math.abs(pos.szi) * pos.markPx;
            const pnlPct = pos.returnOnEquity * 100;
            const dist = liqDistancePct(pos);

            return (
              <tr
                key={pos.coin}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
              >
                <td className="p-2 text-zinc-100 font-medium">{pos.coin}</td>
                <td
                  className={cn(
                    "p-2 font-medium",
                    isLong ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {isLong ? "LONG" : "SHORT"}
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {Math.abs(pos.szi).toFixed(4)}
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {formatUSD(notional)}
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {formatUSD(pos.entryPx)}
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {formatUSD(pos.markPx)}
                </td>
                <td
                  className={cn(
                    "p-2 text-right font-medium",
                    pos.unrealizedPnl >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {formatUSD(pos.unrealizedPnl)}
                </td>
                <td
                  className={cn(
                    "p-2 text-right",
                    pnlPct >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {pos.leverage.toFixed(1)}x
                </td>
                <td className="p-2 text-right text-zinc-300">
                  {pos.liquidationPx ? formatUSD(pos.liquidationPx) : "---"}
                </td>
                <td className={cn("p-2 text-right", liqDistanceColor(dist))}>
                  {dist !== null ? `${dist.toFixed(1)}%` : "---"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700 text-zinc-300 font-medium">
            <td className="p-2" colSpan={3}>
              Total ({sorted.length} positions)
            </td>
            <td className="p-2 text-right">{formatUSD(totals.notional)}</td>
            <td colSpan={2} />
            <td
              className={cn(
                "p-2 text-right font-medium",
                totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {formatUSD(totals.pnl)}
            </td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
