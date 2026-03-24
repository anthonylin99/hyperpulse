"use client";

import { LineChart, Line } from "recharts";
import type { MarketAsset } from "@/types";
import { formatUSD, formatCompact, formatPct, formatFundingRate, formatFundingAPR } from "@/lib/format";
import { getAssetCategory } from "@/lib/constants";
import SignalBadge from "./SignalBadge";
import type { ReactNode } from "react";

interface AssetRowProps {
  asset: MarketAsset;
  index: number;
  isExpanded: boolean;
  onSelect: () => void;
  walletConnected: boolean;
  fundingHistory?: { time: number; rate: number }[];
  detailNode: ReactNode;
}

export default function AssetRow({
  asset,
  index,
  isExpanded,
  onSelect,
  walletConnected,
  fundingHistory,
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

  const oiDeltaColor =
    asset.oiChangePct !== null
      ? asset.oiChangePct > 0
        ? "text-green-500"
        : asset.oiChangePct < 0
          ? "text-red-500"
          : "text-zinc-500"
      : "text-zinc-600";

  const oiDeltaArrow =
    asset.oiChangePct !== null
      ? asset.oiChangePct > 0
        ? "\u2191"
        : asset.oiChangePct < 0
          ? "\u2193"
          : ""
      : "";

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;
  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
  const category = getAssetCategory(asset.coin);

  return (
    <>
      <tr
        onClick={onSelect}
        className={`h-9 border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors text-sm font-mono ${rowBg} ${isExpanded ? "bg-zinc-800/40" : ""}`}
      >
        {/* Asset */}
        <td className="px-3 py-1 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-zinc-50 font-medium">{asset.coin}</span>
            <span className="text-[9px] text-zinc-600 uppercase">{category}</span>
          </div>
        </td>

        {/* Mark Price */}
        <td className="px-3 py-1 text-right text-zinc-50 whitespace-nowrap">
          {formatUSD(asset.markPx, priceDecimals)}
        </td>

        {/* 24h Change */}
        <td className={`px-3 py-1 text-right whitespace-nowrap ${priceColor}`}>
          {formatPct(asset.priceChange24h)}
        </td>

        {/* Open Interest */}
        <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.openInterest)}
        </td>

        {/* OI Delta */}
        <td className={`px-3 py-1 text-right whitespace-nowrap ${oiDeltaColor}`}>
          {asset.oiChangePct !== null ? (
            <>
              {oiDeltaArrow} {Math.abs(asset.oiChangePct).toFixed(1)}%
            </>
          ) : (
            <span className="text-zinc-700">&mdash;</span>
          )}
        </td>

        {/* Volume 24h */}
        <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.dayVolume)}
        </td>

        {/* Funding/hr */}
        <td className={`px-3 py-1 text-right whitespace-nowrap ${fundingColor}`}>
          {formatFundingRate(asset.fundingRate)}
        </td>

        {/* Funding APR */}
        <td className={`px-3 py-1 text-right whitespace-nowrap ${fundingColor}`}>
          {formatFundingAPR(asset.fundingAPR)}
        </td>

        {/* Signal */}
        <td className="px-3 py-1">
          <SignalBadge signal={asset.signal} oiChangePct={asset.oiChangePct} />
        </td>

        {/* 7d Chart Sparkline */}
        <td className="px-3 py-1">
          {fundingHistory && fundingHistory.length > 0 ? (
            <LineChart width={40} height={20} data={fundingHistory}>
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#3b82f6"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <span className="text-zinc-700">&mdash;</span>
          )}
        </td>

        {/* Trade Button */}
        <td className="px-3 py-1 whitespace-nowrap">
          {walletConnected ? (
            <div className="flex gap-1">
              <button
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-0.5 text-[11px] rounded font-medium transition-colors bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                Long &uarr;
              </button>
              <button
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-0.5 text-[11px] rounded font-medium transition-colors bg-red-500/10 text-red-500 hover:bg-red-500/20"
              >
                Short &darr;
              </button>
            </div>
          ) : (
            <button
              disabled
              className="px-2 py-0.5 text-[11px] rounded font-medium bg-zinc-800 text-zinc-600 cursor-not-allowed"
            >
              Connect to trade
            </button>
          )}
        </td>
      </tr>
      {detailNode}
    </>
  );
}
