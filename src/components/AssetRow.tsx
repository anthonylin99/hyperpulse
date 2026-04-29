"use client";

import type { ReactNode } from "react";
import type { MarketAsset } from "@/types";
import {
  formatUSD,
  formatCompact,
  formatPct,
  formatFundingRate,
  formatFundingAPR,
} from "@/lib/format";
import { getFundingRegime } from "@/lib/fundingRegime";
import type { MarketSetupSignal } from "@/lib/tradePlan";
import SignalBadge from "./SignalBadge";
import SetupBadge from "./SetupBadge";

interface AssetRowProps {
  asset: MarketAsset;
  index: number;
  isExpanded: boolean;
  onSelect: () => void;
  onTrade: (direction: "long" | "short") => void;
  tradingEnabled: boolean;
  fundingHistory?: { time: number; rate: number }[];
  setupSignal?: MarketSetupSignal | null;
  detailNode: ReactNode;
}

export default function AssetRow({
  asset,
  index,
  isExpanded,
  onSelect,
  onTrade,
  tradingEnabled,
  fundingHistory,
  setupSignal,
  detailNode,
}: AssetRowProps) {
  const priceColor =
    asset.priceChange24h > 0
      ? "text-green-500"
      : asset.priceChange24h < 0
        ? "text-red-500"
        : "text-zinc-50";

  const fundingColor =
    asset.fundingAPR > 20
      ? "text-red-500"
      : asset.fundingAPR < -20
        ? "text-green-500"
        : "text-zinc-50";


  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;
  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
  const setupBg =
    setupSignal?.isActive && setupSignal.tone === "green"
      ? "bg-emerald-950/30"
      : setupSignal?.isActive && setupSignal.tone === "red"
        ? "bg-rose-950/30"
        : "";
  const fundingRegime = getFundingRegime(asset.fundingRate, fundingHistory);
  const fundingRegimeShort =
    fundingRegime.percentile == null
      ? null
      : fundingRegime.percentile >= 80
        ? "Hist High"
        : fundingRegime.percentile <= 20
          ? "Hist Low"
          : null;

  return (
    <>
      <tr
        onClick={onSelect}
        className={`h-8 border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors text-xs font-mono ${rowBg} ${setupBg} ${isExpanded ? "bg-zinc-800/40" : ""}`}
      >
        <td className="px-2.5 py-0.5 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-zinc-50 font-medium">{asset.coin}</span>
          </div>
        </td>

        <td className="px-2.5 py-0.5 text-right text-zinc-50 whitespace-nowrap">
          {formatUSD(asset.markPx, priceDecimals)}
        </td>

        <td className={`px-2.5 py-0.5 text-right whitespace-nowrap ${priceColor}`}>
          {formatPct(asset.priceChange24h)}
        </td>

        <td className="px-2.5 py-0.5 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.openInterest)}
        </td>

        <td className="px-2.5 py-0.5 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.dayVolume)}
        </td>

        <td className={`px-2.5 py-0.5 text-right whitespace-nowrap ${fundingColor}`}>
          {formatFundingRate(asset.fundingRate)}
        </td>

        <td className={`px-2.5 py-0.5 text-right whitespace-nowrap ${fundingColor}`}>
          <div className="flex items-center justify-end gap-1">
            <span>{formatFundingAPR(asset.fundingAPR)}</span>
            {fundingRegimeShort && (
              <span
                className={`text-[8px] px-1 py-0.5 rounded ${
                  fundingRegime.percentile != null && fundingRegime.percentile >= 80
                    ? "bg-red-500/10 text-red-400"
                    : "bg-green-500/10 text-green-400"
                }`}
                title={fundingRegime.label}
              >
                {fundingRegimeShort}
              </span>
            )}
          </div>
        </td>

        <td className="px-2.5 py-0.5">
          <SignalBadge signal={asset.signal} oiChangePct={asset.oiChangePct} />
        </td>

        <td className="px-2.5 py-0.5">
          <SetupBadge setup={setupSignal} />
        </td>

        {tradingEnabled && (
          <td className="px-2.5 py-0.5 whitespace-nowrap">
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrade("long");
                }}
                className="px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                Long ↑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrade("short");
                }}
                className="px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors bg-red-500/10 text-red-500 hover:bg-red-500/20"
              >
                Short ↓
              </button>
            </div>
          </td>
        )}
      </tr>
      {detailNode}
    </>
  );
}
