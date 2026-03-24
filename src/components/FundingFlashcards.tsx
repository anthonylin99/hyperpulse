"use client";

import { useMarket } from "@/context/MarketContext";
import { formatFundingRate, formatFundingAPR } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";

const DASHBOARD_MAJORS = ["BTC", "HYPE", "ETH", "SOL"] as const;

export default function FundingFlashcards() {
  const { assets, loading, selectedAsset, setSelectedAsset } = useMarket();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 h-full overflow-x-auto scrollbar-hide">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[132px] h-[52px] skeleton rounded-md"
          />
        ))}
      </div>
    );
  }

  const majorAssets = DASHBOARD_MAJORS.map((coin) =>
    assets.find((a) => a.coin === coin)
  )
    .filter((asset): asset is NonNullable<(typeof assets)[number]> => !!asset)
    .sort((a, b) => b.openInterest - a.openInterest);

  return (
    <div className="flex items-center gap-1.5 px-3 h-full overflow-x-auto scrollbar-hide">
      <SentimentSlider />
      {majorAssets.map((asset) => {
        const isSelected = selectedAsset === asset.coin;
        const fundingColor =
          asset.fundingAPR > 20
            ? "#ef4444"
            : asset.fundingAPR < -20
              ? "#22c55e"
              : "#fafafa";

        return (
          <button
            key={asset.coin}
            onClick={() => setSelectedAsset(asset.coin)}
            className={`flex-shrink-0 flex flex-col justify-center px-2.5 py-1.5 rounded-md border transition-all cursor-pointer min-w-[132px] h-[52px] ${
              isSelected
                ? "border-blue-500/50 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700"
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
