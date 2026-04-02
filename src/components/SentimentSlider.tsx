"use client";

import { useMemo, useState } from "react";
import { Info, X } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

export default function SentimentSlider() {
  const { assets, fundingHistories } = useMarket();
  const [showInfo, setShowInfo] = useState(false);

  const result = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories }),
    [assets, fundingHistories]
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
    result.trendScore < -15
      ? "text-red-400"
      : result.trendScore > 15
        ? "text-emerald-300"
        : "text-zinc-300";
  const trendBadge =
    result.trendScore < -15
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : result.trendScore > 15
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
        : "bg-zinc-700/40 text-zinc-200 border-zinc-600";
  const trendPos = `${(result.trendScore + 100) / 2}%`;

  return (
    <>
      <div className="flex-shrink-0 min-w-[320px] h-[56px] rounded-md border border-zinc-800 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-950/80 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                Tomorrow Bias
              </div>
              <div className={`text-[12px] font-semibold ${trendColor}`}>
                {result.trendLabel}
              </div>
            </div>
            <span className={`inline-flex h-5 items-center justify-center rounded border px-1.5 text-[10px] font-mono font-semibold ${trendBadge}`}>
              {result.trendScore}
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-zinc-400">
              {result.trendConfidence} confidence
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex h-5 min-w-[30px] items-center justify-center rounded border px-1.5 text-[10px] font-mono font-semibold ${sentimentBadge}`}>
              {result.score}
            </span>
            <span className={`text-[10px] font-semibold ${sentimentColor}`}>
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
        <div className="mt-1.5 relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-500 to-emerald-500"
            style={{ width: "100%" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-zinc-900"
            style={{ left: `calc(${trendPos} - 4px)` }}
          />
        </div>
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
                  Predictive bias for the next 24h using funding, breadth, and momentum.
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
