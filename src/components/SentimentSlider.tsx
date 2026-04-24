"use client";

import { useMemo, useState } from "react";
import { Info, X } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

export default function SentimentSlider({ variant = "compact" }: { variant?: "compact" | "hero" }) {
  const { assets, fundingHistories, btcCandles } = useMarket();
  const [showInfo, setShowInfo] = useState(false);

  const result = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories, btcCandles }),
    [assets, fundingHistories, btcCandles]
  );

  const sentimentColor =
    result.score < 40
      ? "text-red-400"
      : result.score > 60
        ? "text-[#7dd4c4]"
        : "text-zinc-300";
  const sentimentBadge =
    result.score < 40
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : result.score > 60
        ? "bg-[#7dd4c4]/20 text-[#b9ece2] border-[#7dd4c4]/40"
        : "bg-zinc-700/40 text-zinc-200 border-zinc-600";

  const trendColor =
    result.trendScore < 0 ? "text-red-400" : "text-emerald-300";
  const trendBadge =
    result.trendScore < 0
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  const trendPos = `${(result.trendScore + 100) / 2}%`;
  const hoverSummary = `BTC 24h: ${result.trendInputs.momentum24h}% · BTC 48h: ${result.trendInputs.momentum48h}% · BTC OI: ${result.trendInputs.oiChange}% · BTC funding: ${result.trendInputs.fundingAPR}%`;
  const isHero = variant === "hero";

  return (
    <>
      <div
        className={
          isHero
            ? "rounded-2xl border border-zinc-800 bg-zinc-950/45 px-4 py-4"
            : "h-auto min-h-[64px] w-full min-w-0 rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-950/80 px-3 py-2"
        }
        title={hoverSummary}
        onDoubleClick={() => setShowInfo(true)}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div>
              <div className={isHero ? "text-[11px] uppercase tracking-[0.18em] text-zinc-500" : "text-[9px] uppercase tracking-wider text-zinc-500"}>
                Tomorrow Bias
              </div>
              <div className={`${isHero ? "text-base" : "text-[12px]"} font-semibold ${trendColor}`}>
                {result.trendLabel}
              </div>
            </div>
            <span className={`inline-flex ${isHero ? "h-7 min-w-[38px] text-xs" : "h-5 text-[10px]"} items-center justify-center rounded border px-1.5 font-mono font-semibold ${trendBadge}`}>
              {result.trendScore}
            </span>
            <span className={`rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono uppercase tracking-wider text-zinc-400 ${isHero ? "text-[10px]" : "text-[8px]"}`}>
              {result.trendConfidence} confidence
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`inline-flex ${isHero ? "h-7 min-w-[42px] text-xs" : "h-5 min-w-[30px] text-[10px]"} items-center justify-center rounded border px-1.5 font-mono font-semibold ${sentimentBadge}`}>
              {result.score}
            </span>
            <span className={`${isHero ? "text-sm" : "text-[10px]"} font-semibold ${sentimentColor}`}>
              {result.label}
            </span>
            <button
              onClick={() => setShowInfo(true)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Sentiment methodology"
              title="View model details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className={`${isHero ? "mt-4" : "mt-1.5"} relative ${isHero ? "h-2" : "h-1.5"} rounded-full bg-zinc-800 overflow-hidden`}>
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-500 to-emerald-500"
            style={{ width: "100%" }}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${isHero ? "w-3 h-3" : "w-2 h-2"} rounded-full bg-white border border-zinc-900`}
            style={{ left: `calc(${trendPos} - ${isHero ? 6 : 4}px)` }}
          />
        </div>
        {isHero && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs text-zinc-500">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
              <div className="uppercase tracking-[0.14em] text-zinc-600">BTC 24h</div>
              <div className="mt-1 text-sm text-zinc-200">{result.trendInputs.momentum24h}%</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
              <div className="uppercase tracking-[0.14em] text-zinc-600">BTC OI</div>
              <div className="mt-1 text-sm text-zinc-200">{result.trendInputs.oiChange}%</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
              <div className="uppercase tracking-[0.14em] text-zinc-600">BTC Funding APR</div>
              <div className="mt-1 text-sm text-zinc-200">{result.trendInputs.fundingAPR}%</div>
            </div>
          </div>
        )}
      </div>
      {showInfo && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50"
            onClick={() => setShowInfo(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[540px] max-w-[92vw] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div>
                <div className="text-sm font-medium">HyperPulse Tomorrow Bias</div>
                <div className="text-[11px] text-zinc-500">
                  BTC‑anchored bias for the next 24h–48h using momentum, OI, and funding.
                </div>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 rounded hover:bg-zinc-800"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="px-4 py-3 text-xs space-y-3">
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                Tomorrow Bias score: <span className="font-mono">{result.trendScore}</span> (
                {result.trendLabel}, {result.trendConfidence} confidence)
                <div className="mt-1 text-[11px] text-zinc-500">
                  Window: {result.trendWindowHours}h · Anchor: BTC
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-zinc-400">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  BTC 24h: <span className="font-mono">{result.trendInputs.momentum24h}%</span>
                  <br />
                  BTC 48h: <span className="font-mono">{result.trendInputs.momentum48h}%</span>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  BTC OI: <span className="font-mono">{result.trendInputs.oiChange}%</span>
                  <br />
                  BTC funding APR: <span className="font-mono">{result.trendInputs.fundingAPR}%</span>
                </div>
              </div>
              <div className="text-zinc-500">
                Weights — 24h momentum {Math.round(result.trendWeights.momentum24h * 100)}%, 48h
                momentum {Math.round(result.trendWeights.momentum48h * 100)}%, OI{" "}
                {Math.round(result.trendWeights.oiChange * 100)}%, funding contrarian{" "}
                {Math.round(result.trendWeights.fundingContrarian * 100)}%.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500">Funding Regime</div>
                  <div className="font-mono">{result.fundingRegimeScore}</div>
                  <div className="text-zinc-600">
                    weight {(result.weights.fundingRegime * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500">Breadth</div>
                  <div className="font-mono">{result.breadthScore}</div>
                  <div className="text-zinc-600">
                    weight {(result.weights.breadth * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500">Volatility (Inverted)</div>
                  <div className="font-mono">{100 - result.volatilityScore}</div>
                  <div className="text-zinc-600">
                    weight {(result.weights.volatility * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="text-zinc-400">
                Funding sub-weights: APR direction{" "}
                {(result.fundingSubWeights.directionApr * 100).toFixed(0)}%, signal bias{" "}
                {(result.fundingSubWeights.signalBias * 100).toFixed(0)}%, MA regime{" "}
                {(result.fundingSubWeights.maRegime * 100).toFixed(0)}%.
              </div>

              <div className="text-zinc-500">
                Scope: score reflects Hyperliquid microstructure only.
              </div>

              <div className="grid grid-cols-2 gap-2 text-zinc-400">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  Assets: <span className="font-mono">{result.assetCount}</span>
                  <br />
                  Up 24h: <span className="font-mono">{result.upCount}</span>
                  <br />
                  OI up: <span className="font-mono">{result.oiUpCount}</span>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  Long signals: <span className="font-mono">{result.longSignals}</span>
                  <br />
                  Short signals: <span className="font-mono">{result.shortSignals}</span>
                  <br />
                  Median funding APR:{" "}
                  <span className="font-mono">{result.medianFundingApr}%</span>
                </div>
              </div>

              <div className="text-zinc-500">
                Vol breadth: {result.volatilityBreadthPct}% of assets moved ±6%+ in 24h. Avg abs
                24h move: {result.avgAbs24hMove}% | avg abs OI move: {result.avgAbsOiMove}%.
              </div>

              <div className="text-zinc-500">
                Note: This is a Hyperliquid-native sentiment index. It does not ingest TradFi macro
                volatility (e.g. SPX options/VIX), so divergence vs broader markets is expected.
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
