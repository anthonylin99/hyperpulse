"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/format";
import {
  formatSignedPct,
  formatCardUsd,
  type TradeReviewCard,
} from "@/lib/tradeReviewCard";

const TONE = {
  win: { accent: "text-emerald-400", ring: "border-emerald-500/30", glow: "from-emerald-500/15", arrow: "▲" },
  loss: { accent: "text-rose-400", ring: "border-rose-500/30", glow: "from-rose-500/15", arrow: "▼" },
  flat: { accent: "text-zinc-300", ring: "border-zinc-700", glow: "from-zinc-500/10", arrow: "" },
} as const;

export default function TradeReviewCardView({ card }: { card: TradeReviewCard }) {
  // $ amounts are opt-in and live only on the owner's own view. The shareable
  // X-unfurl image is always %-only (privacy default).
  const [showUsd, setShowUsd] = useState(false);
  const tone = TONE[card.tone];

  const pctOf = (usd: number) => (card.startingBalanceUsd > 0 ? (usd / card.startingBalanceUsd) * 100 : 0);
  const renderStat = (usd: number) => (showUsd ? formatCardUsd(usd) : formatSignedPct(pctOf(usd)));

  const shareToX = () => {
    const url = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
    const headline = card.returnConfident
      ? `${formatSignedPct(card.netReturnPct)} net`
      : `${card.winRatePct.toFixed(0)}% win rate over ${card.totalTrades} trades`;
    const text = `My Hyperliquid trade review: ${headline} — "${card.verdict}"`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* The card */}
      <div className={cn("relative overflow-hidden rounded-2xl border bg-zinc-950/90 p-7 sm:p-9", tone.ring)}>
        <div className={cn("pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br to-transparent blur-2xl", tone.glow)} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-teal-400 shadow-[0_0_16px_rgba(45,212,191,0.6)]" />
            <span className="text-lg font-bold tracking-tight">HyperPulse</span>
            <span className="text-sm text-zinc-500">· trade review</span>
          </div>
          <span className="text-sm text-zinc-500">{card.handleShort} · {card.period}</span>
        </div>

        <div className="mt-7">
          <div className="flex items-baseline gap-3">
            <span className={cn("text-6xl font-extrabold tracking-tighter tabular-nums sm:text-7xl", tone.accent)}>
              {card.heroValue}
            </span>
            <span className={cn("text-3xl", tone.accent)}>{card.returnConfident ? tone.arrow : ""}</span>
          </div>
          <div className="mt-1 text-sm text-zinc-400">{card.heroLabel}</div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          {card.returnConfident ? (
            <>
              <Stat label="Win rate" value={`${card.winRatePct.toFixed(0)}%`} />
              <Stat label="Trades" value={`${card.totalTrades}`} />
              {card.biggestWin && (
                <Stat label={`Biggest W · ${card.biggestWin.coin}`} value={renderStat(card.biggestWin.usd)} valueClass="text-emerald-400" />
              )}
              {card.biggestLoss && (
                <Stat label={`Biggest L · ${card.biggestLoss.coin}`} value={renderStat(card.biggestLoss.usd)} valueClass="text-rose-400" />
              )}
            </>
          ) : (
            <>
              <Stat label="Trades" value={`${card.totalTrades}`} />
              <Stat label="Profit factor" value={`${card.profitFactor.toFixed(2)}x`} />
              {showUsd && card.biggestWin && (
                <Stat label={`Biggest W · ${card.biggestWin.coin}`} value={formatCardUsd(card.biggestWin.usd)} valueClass="text-emerald-400" />
              )}
              {showUsd && card.biggestLoss && (
                <Stat label={`Biggest L · ${card.biggestLoss.coin}`} value={formatCardUsd(card.biggestLoss.usd)} valueClass="text-rose-400" />
              )}
              {!showUsd && (
                <Stat label="Net" value={card.tone === "win" ? "positive" : card.tone === "loss" ? "negative" : "flat"} valueClass={tone.accent} />
              )}
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-lg font-semibold italic text-zinc-200">&ldquo;{card.verdict}&rdquo;</p>
          <span className="shrink-0 text-xs text-zinc-600">hyperpulsehl.com</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setShowUsd((v) => !v)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          {showUsd ? "Show %" : "Show $ (private to you)"}
        </button>
        <div className="flex items-center gap-3">
          <Link href="/portfolio" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
            Build your own →
          </Link>
          <button
            onClick={shareToX}
            className="rounded-lg bg-teal-500 px-4 py-1.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Share to X
          </button>
        </div>
      </div>
      {showUsd && (
        <p className="text-xs text-zinc-600">
          Dollar amounts are shown only here on your screen — the image that unfurls when you share stays percentage-only.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums", valueClass ?? "text-zinc-100")}>{value}</span>
    </div>
  );
}
