"use client";

import { BookOpenCheck, Trash2, XCircle } from "lucide-react";
import { useShadowBook, calculateShadowTradeStats } from "@/context/ShadowBookContext";
import { cn, formatChartPrice, formatUSD } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { ShadowTrade } from "@/lib/shadowBook";

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function sourceLabel(source: ShadowTrade["source"]) {
  if (source === "momentum_alert") return "Momentum alert";
  if (source === "market_setup") return "Market setup";
  return "Manual";
}

function statusLabel(trade: ShadowTrade, stopHit: boolean, targetHit: boolean) {
  if (trade.status === "closed") return "Closed";
  if (targetHit) return "Target touched";
  if (stopHit) return "Stop touched";
  return "Tracking";
}

export default function ShadowBookPanel() {
  const { trades, closeTrade, deleteTrade, clearTrades, markForAsset } = useShadowBook();
  const openTrades = trades.filter((trade) => trade.status === "open");
  const closedTrades = trades.filter((trade) => trade.status === "closed");
  const totalPnl = trades.reduce((sum, trade) => {
    const stats = calculateShadowTradeStats(trade, markForAsset(trade.asset));
    return sum + stats.pnlUsd;
  }, 0);
  const winners = trades.filter((trade) => calculateShadowTradeStats(trade, markForAsset(trade.asset)).pnlUsd > 0).length;

  if (trades.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950/85 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
          <BookOpenCheck className="h-5 w-5" />
        </div>
        <div className="mt-4 text-lg font-semibold text-zinc-100">No paper trades yet.</div>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Track a setup from Markets or Alerts to see how it would have performed. Nothing here is a real order, and nothing is stored on HyperPulse servers.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-emerald-900/30 bg-[linear-gradient(180deg,rgba(7,16,14,0.96),rgba(9,9,11,0.9))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 label text-emerald-300">
              <BookOpenCheck className="h-4 w-4" />
              Shadow Book
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Paper trades, local to this browser.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Review what would have happened if you took a setup. P&L is levered, based on fake margin, and updates from current Hyperliquid marks.
            </p>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Clear all local paper trades? This only affects this browser.")) clearTrades();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-500 hover:border-rose-500/30 hover:text-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear local book
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Open" value={openTrades.length.toString()} helper="active simulations" />
          <SummaryCard label="Closed" value={closedTrades.length.toString()} helper="paper exits" />
          <SummaryCard label="Paper P&L" value={formatUSD(totalPnl)} helper="open + closed" tone={totalPnl >= 0 ? "green" : "red"} />
          <SummaryCard label="Win rate" value={trades.length ? `${Math.round((winners / trades.length) * 100)}%` : "n/a"} helper="positive P&L rows" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85">
        <div className="border-b border-zinc-800 px-4 py-3 label">
          Paper trade ledger
        </div>
        <div className="divide-y divide-zinc-800">
          {trades.map((trade) => (
            <ShadowTradeRow
              key={trade.id}
              trade={trade}
              currentPrice={markForAsset(trade.asset)}
              onClose={(price) => closeTrade(trade.id, price)}
              onDelete={() => deleteTrade(trade.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/75 px-4 py-3">
      <div className="label text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-2 font-mono text-xl font-semibold",
          tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-zinc-100",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

function ShadowTradeRow({
  trade,
  currentPrice,
  onClose,
  onDelete,
}: {
  trade: ShadowTrade;
  currentPrice: number | null;
  onClose: (price: number) => void;
  onDelete: () => void;
}) {
  const stats = calculateShadowTradeStats(trade, currentPrice);
  const positive = stats.pnlUsd >= 0;
  const status = statusLabel(trade, stats.stopHit, stats.targetHit);
  const canClose = trade.status === "open" && currentPrice != null;

  return (
    <article className="grid gap-4 px-4 py-4 lg:grid-cols-[180px_minmax(0,1fr)_220px]">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl font-semibold text-zinc-50">{trade.asset}</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
              trade.side === "long"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/25 bg-rose-500/10 text-rose-300",
            )}
          >
            {trade.side}
          </span>
        </div>
        <div className="mt-2 text-xs text-zinc-500">{sourceLabel(trade.source)}</div>
        <div className="mt-1 text-[11px] text-zinc-600">{formatEasternDateTime(trade.createdAt, true)}</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Metric label="Entry" value={formatChartPrice(trade.entryPrice)} />
        <Metric label={trade.status === "closed" ? "Exit" : "Current"} value={formatChartPrice(stats.markPrice)} />
        <Metric label="Margin / lev" value={`${formatUSD(trade.marginUsd)} · ${trade.leverage}x`} />
        <Metric label="Notional" value={formatUSD(trade.notionalUsd)} />
        <Metric label="Paper P&L" value={`${formatUSD(stats.pnlUsd)} · ${formatPct(stats.leveredReturnPct)}`} tone={positive ? "green" : "red"} />
        <Metric label="MFE / MAE" value={`${formatPct(stats.mfePct)} · ${formatPct(stats.maePct)}`} />
        <Metric label="Stop" value={trade.stopPrice == null ? "n/a" : formatChartPrice(trade.stopPrice)} tone={stats.stopHit ? "red" : "neutral"} />
        <Metric label="Target" value={trade.targetPrice == null ? "n/a" : formatChartPrice(trade.targetPrice)} tone={stats.targetHit ? "green" : "neutral"} />
      </div>

      <div className="flex flex-col items-start gap-2 lg:items-end">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
            trade.status === "closed"
              ? "border-zinc-800 bg-zinc-900 text-zinc-400"
              : stats.targetHit
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : stats.stopHit
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                  : "border-teal-500/20 bg-teal-500/10 text-teal-200",
          )}
        >
          {status}
        </span>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {canClose ? (
            <button
              onClick={() => onClose(currentPrice)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/30 hover:text-emerald-200"
            >
              Close paper
            </button>
          ) : null}
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] text-zinc-500 hover:border-rose-500/30 hover:text-rose-200"
          >
            <XCircle className="h-3 w-3" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="label text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-sm text-zinc-100",
          tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : null,
        )}
      >
        {value}
      </div>
    </div>
  );
}
