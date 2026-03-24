"use client";

import { useMarket } from "@/context/MarketContext";
import { formatFundingRate, formatFundingAPR } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";

const DASHBOARD_MAJORS = ["BTC", "HYPE", "ETH", "SOL"] as const;

export default function FundingFlashcards() {
  const { assets, loading, selectedAsset, setSelectedAsset } = useMarket();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 h-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-emerald-950/10 via-transparent to-teal-950/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[132px] h-[50px] skeleton rounded-md border border-emerald-400/10"
          />
        ))}
      </div>
    );
  }

  const majorAssets = DASHBOARD_MAJORS.map((coin) =>
    assets.find((a) => a.coin === coin)
  )
    .filter((asset): asset is NonNullable<(typeof assets)[number]> => !!asset);

  return (
    <div className="flex items-center gap-1.5 px-3 h-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-emerald-950/10 via-transparent to-teal-950/10">
      <div className="flex-shrink-0">
        <SentimentSlider />
      </div>
      {majorAssets.map((asset) => {
        const isSelected = selectedAsset === asset.coin;
        const fundingColor =
          asset.fundingAPR > 20
            ? "#ef4444"
            : asset.fundingAPR < -20
              ? "#2dd4bf"
              : "#fafafa";

        return (
          <button
            key={asset.coin}
            onClick={() => setSelectedAsset(asset.coin)}
            className={`flex-shrink-0 flex flex-col justify-center px-2.5 py-1.5 rounded-md border transition-all cursor-pointer min-w-[132px] h-[50px] ${
              isSelected
                ? "border-emerald-400/40 bg-emerald-950/30 shadow-[0_0_0_1px_rgba(45,212,191,0.08)]"
                : "border-zinc-800 bg-zinc-950/60 hover:bg-emerald-950/15 hover:border-emerald-400/15"
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-sans">
              {asset.coin}
            </span>
            <span
              className="text-[17px] font-mono font-bold leading-tight"
              style={{ color: fundingColor }}
            >
              {formatFundingRate(asset.fundingRate)}
            </span>
            <span className="text-[9px] font-mono text-zinc-500">
              {formatFundingAPR(asset.fundingAPR)} APR
            </span>
          </button>
        );
      })}
    </div>
  );
}
