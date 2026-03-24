"use client";

import { useMemo } from "react";
import { useMarket } from "@/context/MarketContext";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

export default function SentimentSlider() {
  const { assets, fundingHistories } = useMarket();

  const result = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories }),
    [assets, fundingHistories]
  );

  const colorClass =
    result.score < 40
      ? "text-red-400"
      : result.score > 60
        ? "text-green-400"
        : "text-zinc-300";

  return (
    <div className="flex-shrink-0 min-w-[280px] h-[52px] rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          HyperPulse VIX Sentiment
        </span>
        <span className={`text-sm font-mono font-bold ${colorClass}`}>
          {result.score} · {result.label}
        </span>
      </div>
      <div className="mt-1.5 relative h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-500 to-green-500"
          style={{ width: "100%" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border border-zinc-900"
          style={{ left: `calc(${result.score}% - 5px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-zinc-500 font-mono">
        <span>Fear</span>
        <span>Neutral</span>
        <span>Greed</span>
      </div>
    </div>
  );
}
