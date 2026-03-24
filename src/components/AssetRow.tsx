"use client";

import { LineChart, Line } from "recharts";
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
import { getAssetCategory } from "@/lib/constants";
import SignalBadge from "./SignalBadge";

interface AssetRowProps {
  asset: MarketAsset;
  index: number;
  isExpanded: boolean;
  onSelect: () => void;
  onTrade: (direction: "long" | "short") => void;
  walletConnected: boolean;
  fundingHistory?: { time: number; rate: number }[];
  detailNode: ReactNode;
}

export default function AssetRow({
  asset,
  index,
  isExpanded,
  onSelect,
  onTrade,
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
    asset.oiChangePct != null
      ? asset.oiChangePct > 0
        ? "text-green-500"
        : asset.oiChangePct < 0
          ? "text-red-500"
          : "text-zinc-500"
      : "text-zinc-600";

  const oiDeltaArrow =
    asset.oiChangePct != null
      ? asset.oiChangePct > 0
        ? "↑"
        : asset.oiChangePct < 0
          ? "↓"
          : ""
      : "";

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;
  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
  const category = getAssetCategory(asset.coin);
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
        className={`h-9 border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors text-sm font-mono ${rowBg} ${isExpanded ? "bg-zinc-800/40" : ""}`}
      >
        <td className="px-3 py-1 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-zinc-50 font-medium">{asset.coin}</span>
            <span className="text-[9px] text-zinc-600 uppercase">{category}</span>
          </div>
        </td>

        <td className="px-3 py-1 text-right text-zinc-50 whitespace-nowrap">
          {formatUSD(asset.markPx, priceDecimals)}
        </td>

        <td className={`px-3 py-1 text-right whitespace-nowrap ${priceColor}`}>
          {formatPct(asset.priceChange24h)}
        </td>

        <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.openInterest)}
        </td>

        <td className={`px-3 py-1 text-right whitespace-nowrap ${oiDeltaColor}`}>
          {asset.oiChangePct != null ? (
            <>
              {oiDeltaArrow} {Math.abs(asset.oiChangePct).toFixed(1)}%
            </>
          ) : (
            <span className="text-zinc-700">—</span>
          )}
        </td>

        <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
          {formatCompact(asset.dayVolume)}
        </td>

        <td className={`px-3 py-1 text-right whitespace-nowrap ${fundingColor}`}>
          {formatFundingRate(asset.fundingRate)}
        </td>

        <td className={`px-3 py-1 text-right whitespace-nowrap ${fundingColor}`}>
          <div className="flex items-center justify-end gap-1">
            <span>{formatFundingAPR(asset.fundingAPR)}</span>
            {fundingRegimeShort && (
              <span
                className={`text-[9px] px-1 py-0.5 rounded ${
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

        <td className="px-3 py-1">
          <SignalBadge signal={asset.signal} oiChangePct={asset.oiChangePct} />
        </td>

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
            <span className="text-zinc-700">—</span>
          )}
        </td>

        {walletConnected && (
          <td className="px-3 py-1 whitespace-nowrap">
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrade("long");
                }}
                className="px-2 py-0.5 text-[11px] rounded font-medium transition-colors bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                Long ↑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrade("short");
                }}
                className="px-2 py-0.5 text-[11px] rounded font-medium transition-colors bg-red-500/10 text-red-500 hover:bg-red-500/20"
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
