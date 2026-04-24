"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import {
  SIZING_TARGET_MAX_PCT,
  SIZING_TARGET_MIN_PCT,
  getDeployableCapital,
  positionSizingPct,
  sizingTone,
} from "@/lib/portfolioSizing";
import { cn, formatUSD } from "@/lib/format";

function toneClass(tone: ReturnType<typeof sizingTone>): string {
  if (tone === "target") return "text-emerald-300";
  if (tone === "over") return "text-red-300";
  if (tone === "under") return "text-amber-300";
  return "text-zinc-500";
}

export default function SizingDiscipline() {
  const { accountState } = useWallet();
  const { sizingSnapshots, researchLoading } = usePortfolio();

  const metrics = useMemo(() => {
    const perpPositions = (accountState?.positions ?? []).filter((position) => position.marketType !== "hip3_spot");
    const deployableCapital = getDeployableCapital(accountState);
    const rows = perpPositions.map((position) => {
      const sizingPct = positionSizingPct(position, accountState);
      const notional = Math.abs(position.szi) * position.markPx;
      return {
        asset: position.coin,
        side: position.szi >= 0 ? "Long" : "Short",
        marginUsed: position.marginUsed,
        notional,
        leverage: position.leverage,
        sizingPct,
        tone: sizingTone(sizingPct),
      };
    });
    const largest = rows
      .filter((row) => row.sizingPct != null)
      .sort((a, b) => (b.sizingPct ?? 0) - (a.sizingPct ?? 0))[0] ?? null;
    const inBand = rows.filter((row) => row.tone === "target").length;

    return { deployableCapital, rows, largest, inBand };
  }, [accountState]);

  if (!accountState) return null;

  return (
    <section className="overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950/85">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
              Sizing Discipline
            </div>
            <h3 className="mt-2 text-lg font-semibold text-zinc-100">
              Initial margin as a share of deployable capital.
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Target band {SIZING_TARGET_MIN_PCT}%–{SIZING_TARGET_MAX_PCT}%. New snapshots persist from first capture onward.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-xs">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Deployable</div>
              <div className="mt-1 font-mono text-zinc-100">{formatUSD(metrics.deployableCapital)}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">In Band</div>
              <div className="mt-1 font-mono text-emerald-300">
                {metrics.inBand}/{metrics.rows.length}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Captured</div>
              <div className="mt-1 font-mono text-zinc-100">
                {researchLoading ? "..." : sizingSnapshots.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-800/70">
        {metrics.rows.length > 0 ? (
          metrics.rows.map((row) => (
            <div key={`${row.asset}-${row.side}`} className="grid gap-3 px-5 py-3 text-sm md:grid-cols-[1fr_1fr_1fr_1fr] md:items-center">
              <div>
                <div className="font-medium text-zinc-100">{row.asset}</div>
                <div className={cn("mt-1 text-xs", row.side === "Long" ? "text-emerald-300" : "text-red-300")}>
                  {row.side} · {row.leverage.toFixed(1)}x
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Margin / Notional</div>
                <div className="mt-1 font-mono text-zinc-200">
                  {formatUSD(row.marginUsed)} · {formatUSD(row.notional)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Sizing</div>
                <div className={cn("mt-1 font-mono font-semibold", toneClass(row.tone))}>
                  {row.sizingPct == null ? "n/a" : `${row.sizingPct.toFixed(1)}%`}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.tone === "target" && "bg-emerald-400",
                    row.tone === "over" && "bg-red-400",
                    row.tone === "under" && "bg-amber-300",
                    row.tone === "unknown" && "bg-zinc-700",
                  )}
                  style={{ width: `${Math.min(Math.max(row.sizingPct ?? 0, 2), 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-sm text-zinc-500">
            No live perp margin to size right now. Closed trades before this feature will remain marked as not captured.
          </div>
        )}
      </div>

      {metrics.largest ? (
        <div className="border-t border-zinc-800 bg-emerald-500/[0.035] px-5 py-3 text-xs text-zinc-500">
          Largest active sizing: <span className={toneClass(metrics.largest.tone)}>{metrics.largest.asset} {metrics.largest.sizingPct?.toFixed(1)}%</span>.
        </div>
      ) : null}
    </section>
  );
}
