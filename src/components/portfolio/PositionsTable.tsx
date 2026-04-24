"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { NotebookPen } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatFundingAPR, formatUSD } from "@/lib/format";
import { positionSizingPct } from "@/lib/portfolioSizing";
import {
  emptyPositionNote,
  getPositionNotes,
  positionNoteKey,
  setPositionNote,
  type PositionNote,
} from "@/lib/positionNotes";
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
  const { accountState, address } = useWallet();
  const { assets } = useMarket();
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, PositionNote>>({});
  const [notesAddress, setNotesAddress] = useState<string | null>(null);
  const [noteWarning, setNoteWarning] = useState<string | null>(null);
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

  const assetByCoin = useMemo(
    () => new Map(assets.map((asset) => [asset.coin, asset])),
    [assets],
  );

  useEffect(() => {
    if (!address) {
      setNotes({});
      setNotesAddress(null);
      setExpandedNote(null);
      setNoteWarning(null);
      return;
    }
    setNotes(getPositionNotes(address));
    setNotesAddress(address);
    setExpandedNote(null);
    setNoteWarning(null);
  }, [address]);

  const effectiveNotes = useMemo(
    () => (notesAddress === address ? notes : {}),
    [address, notes, notesAddress],
  );

  const handleNoteChange = useCallback(
    (key: string, field: keyof Omit<PositionNote, "updatedAt">, value: string) => {
      if (!address || notesAddress !== address) return;
      const nextNote: PositionNote = {
        ...(effectiveNotes[key] ?? emptyPositionNote()),
        [field]: value,
        updatedAt: Date.now(),
      };
      const saved = setPositionNote(address, key, nextNote);
      if (!saved) {
        setNoteWarning("Notes could not be saved in this browser session.");
        return;
      }
      setNoteWarning(null);
      setNotes((prev) => ({
        ...prev,
        [key]: nextNote,
      }));
    },
    [address, effectiveNotes, notesAddress],
  );

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
        {noteWarning ? (
          <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {noteWarning}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", density === "roomy" ? "min-w-[1180px]" : "min-w-[1100px]")}>
          <thead className="bg-zinc-950/90">
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              <th className="px-5 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Position Value</th>
              <th className="px-4 py-3 font-medium">Entry Price</th>
              <th className="px-4 py-3 font-medium">Mark Price</th>
              <th className="px-4 py-3 font-medium">P&amp;L (ROE)</th>
              <th className="px-4 py-3 font-medium">Liq. Price</th>
              <th className="px-4 py-3 font-medium">Sizing</th>
              <th className="px-4 py-3 font-medium">Plan</th>
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
              const sizingPct = positionSizingPct(position, accountState);
              const noteKey = positionNoteKey(position);
              const note = effectiveNotes[noteKey] ?? emptyPositionNote();
              const hasNote = !!(note.thesis || note.invalidation || note.review);
              const isExpanded = expandedNote === noteKey;
              const marketAsset = assetByCoin.get(position.coin);

              return (
                <Fragment key={`${position.marketType ?? "perp"}-${position.coin}-${isLong ? "long" : "short"}`}>
                  <tr className="border-b border-zinc-800/70 align-top">
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
                    <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                      <div className={cn("font-mono font-medium", sizingPct == null ? "text-zinc-500" : "text-emerald-300")}>
                        {sizingPct == null ? "n/a" : `${sizingPct.toFixed(1)}%`}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {isSpot ? "No margin" : "of tradeable USDC"}
                      </div>
                    </td>
                    <td className={cn(density === "roomy" ? "px-4 py-5" : "px-4 py-4")}>
                      <button
                        type="button"
                        onClick={() => setExpandedNote((current) => (current === noteKey ? null : noteKey))}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors",
                          isExpanded
                            ? "border-emerald-500/30 bg-emerald-500/[0.10] text-emerald-200"
                            : "border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                        )}
                      >
                        <NotebookPen className="h-3.5 w-3.5" />
                        {hasNote ? "Review" : "Add note"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-zinc-800/70 bg-zinc-950">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
                              Decision support
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {[
                                {
                                  label: "Entry → mark",
                                  value: `${formatUSD(position.entryPx, position.entryPx < 1 ? 5 : 2)} → ${formatUSD(position.markPx, position.markPx < 1 ? 5 : 2)}`,
                                },
                                {
                                  label: "PnL / ROE",
                                  value: `${position.unrealizedPnl >= 0 ? "+" : ""}${formatUSD(position.unrealizedPnl)} · ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`,
                                  tone: position.unrealizedPnl >= 0 ? "positive" : "negative",
                                },
                                {
                                  label: "Liq distance",
                                  value: isSpot ? "Spot balance" : dist !== null ? `${dist.toFixed(1)}%` : "Unavailable",
                                  tone: tone === "danger" ? "negative" : tone === "warning" ? "warning" : "neutral",
                                },
                                {
                                  label: "Funding drag",
                                  value: isSpot ? "n/a" : marketAsset ? formatFundingAPR(marketAsset.fundingAPR) : "n/a",
                                  tone: marketAsset && marketAsset.fundingAPR <= 0 ? "positive" : "negative",
                                },
                                {
                                  label: "Sizing",
                                  value: sizingPct == null ? "n/a" : `${sizingPct.toFixed(1)}% of tradeable USDC`,
                                  tone: sizingPct == null ? "neutral" : "positive",
                                },
                                {
                                  label: "Market signal",
                                  value: marketAsset?.signal.label ?? (isSpot ? "Spot market" : "No live signal"),
                                },
                              ].map((item) => (
                                <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{item.label}</div>
                                  <div
                                    className={cn(
                                      "mt-1 font-mono text-xs text-zinc-200",
                                      item.tone === "positive" && "text-emerald-300",
                                      item.tone === "negative" && "text-red-300",
                                      item.tone === "warning" && "text-amber-300",
                                    )}
                                  >
                                    {item.value}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 text-xs leading-5 text-zinc-500">
                              Local-only context for review. HyperPulse is surfacing risk inputs, not placing trades or giving custody.
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            {[
                              { field: "thesis" as const, label: "Thesis", placeholder: "Why am I in this?" },
                              { field: "invalidation" as const, label: "Invalidation", placeholder: "What proves me wrong?" },
                              { field: "review" as const, label: "Review", placeholder: "What should future me remember?" },
                            ].map((item) => (
                              <label key={item.field} className="block">
                                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{item.label}</span>
                                <textarea
                                  value={note[item.field]}
                                  onChange={(event) => handleNoteChange(noteKey, item.field, event.target.value)}
                                  placeholder={item.placeholder}
                                  className="mt-2 min-h-[118px] w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs leading-5 text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/40"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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
              <td className="px-4 py-4 text-zinc-500">Margin / tradeable USDC.</td>
              <td className="px-4 py-4 text-zinc-500">Notes stay local.</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
