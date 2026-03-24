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

  const colorClass =
    result.score < 40
      ? "text-red-400"
      : result.score > 60
        ? "text-[#7dd4c4]"
        : "text-zinc-300";
  const scoreBadgeClass =
    result.score < 40
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : result.score > 60
        ? "bg-[#7dd4c4]/20 text-[#b9ece2] border-[#7dd4c4]/40"
        : "bg-zinc-700/40 text-zinc-200 border-zinc-600";

  return (
    <>
      <div className="flex-shrink-0 min-w-[272px] h-[46px] rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              HyperPulse VIX Sentiment
            </span>
            <button
              onClick={() => setShowInfo(true)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Sentiment methodology"
              title="View composition and weights"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`inline-flex h-5 min-w-[30px] items-center justify-center rounded border px-1.5 text-[11px] font-mono font-semibold ${scoreBadgeClass}`}
            >
              {result.score}
            </span>
            <span className={`text-[11px] font-semibold ${colorClass}`}>
              {result.label}
            </span>
            <span
              className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-[8px] font-mono uppercase tracking-wider text-zinc-400"
              title="Hyperliquid-native scope"
            >
              HL-native
            </span>
          </div>
        </div>
        <div className="mt-1 relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-500 to-green-500"
            style={{ width: "100%" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-zinc-900"
            style={{ left: `calc(${result.score}% - 4px)` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[8px] text-zinc-500 font-mono">
          <span>Fear</span>
          <span>Neutral</span>
          <span>Greed</span>
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
                <div className="text-sm font-medium">HyperPulse Sentiment Method</div>
                <div className="text-[11px] text-zinc-500">
                  Public composition and weights (0-100 fear to greed)
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
