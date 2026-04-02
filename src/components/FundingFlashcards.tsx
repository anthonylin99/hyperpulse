"use client";

import { useMarket } from "@/context/MarketContext";
import { formatFundingRate, formatFundingAPR, formatPct } from "@/lib/format";
import SentimentSlider from "./SentimentSlider";

const DASHBOARD_MAJORS = ["BTC", "HYPE", "ETH", "SOL"] as const;

export default function FundingFlashcards() {
  const { assets, loading, selectedAsset, setSelectedAsset } = useMarket();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 h-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-[#24786d]/20 via-transparent to-[#7dd4c4]/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[132px] h-[52px] skeleton rounded-md border border-[#24786d]/30"
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
    <div className="flex items-center gap-2 px-3 py-2 h-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-[#24786d]/20 via-transparent to-[#7dd4c4]/10">
      <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-sans flex-shrink-0">
        Market Pulse
      </span>
      <div className="flex-shrink-0">
        <SentimentSlider />
      </div>
      {majorAssets.map((asset) => {
        const isSelected = selectedAsset === asset.coin;
        const fundingColor =
          asset.fundingAPR > 20
            ? "#ef4444"
            : asset.fundingAPR < -20
              ? "#7dd4c4"
              : "#fafafa";
        const priceColor =
          asset.priceChange24h > 0
            ? "text-emerald-400"
            : asset.priceChange24h < 0
              ? "text-red-400"
              : "text-zinc-400";

        return (
          <button
            key={asset.coin}
            onClick={() => setSelectedAsset(asset.coin)}
            className={`flex-shrink-0 flex flex-col justify-center px-2.5 py-1.5 rounded-md border transition-all cursor-pointer min-w-[132px] h-[52px] ${
              isSelected
                ? "border-[#7dd4c4]/70 bg-[#24786d]/20 shadow-[0_0_0_1px_rgba(125,212,196,0.14)]"
                : "border-zinc-800 bg-zinc-950/60 hover:bg-[#24786d]/20 hover:border-[#7dd4c4]/35"
            }`}
          >
            <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-sans">
              {asset.coin}
            </span>
            <span
              className="text-[15px] font-mono font-bold leading-tight"
              style={{ color: fundingColor }}
            >
              {formatFundingRate(asset.fundingRate)}
            </span>
            <div className="flex items-center justify-between text-[8px] font-mono">
              <span className="text-zinc-500">{formatFundingAPR(asset.fundingAPR)} APR</span>
              <span className={priceColor}>{formatPct(asset.priceChange24h)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
