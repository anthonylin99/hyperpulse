"use client";

import { useMarket } from "@/context/MarketContext";
import { MAJOR_ASSETS } from "@/lib/constants";
import { formatFundingRate, formatFundingAPR } from "@/lib/format";

export default function FundingFlashcards() {
  const { assets, loading, selectedAsset, setSelectedAsset } = useMarket();

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 h-full overflow-x-auto scrollbar-hide">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[140px] h-[70px] skeleton rounded-lg"
          />
        ))}
      </div>
    );
  }

  // Filter to major assets, preserve order from MAJOR_ASSETS
  const majorAssets = MAJOR_ASSETS.map((coin) =>
    assets.find((a) => a.coin === coin)
  ).filter(Boolean);

  return (
    <div className="flex items-center gap-2 px-4 h-full overflow-x-auto scrollbar-hide">
      {majorAssets.map((asset) => {
        if (!asset) return null;
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
            className={`flex-shrink-0 flex flex-col justify-center px-4 py-2 rounded-lg border transition-all cursor-pointer min-w-[130px] h-[70px] ${
              isSelected
                ? "border-blue-500/50 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans">
              {asset.coin}
            </span>
            <span
              className="text-xl font-mono font-bold leading-tight"
              style={{ color: fundingColor }}
            >
              {formatFundingRate(asset.fundingRate)}
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {formatFundingAPR(asset.fundingAPR)} APR
            </span>
          </button>
        );
      })}
    </div>
  );
}
