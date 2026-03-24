"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MarketAsset } from "@/types";
import { formatUSD, formatPct, formatFundingRate, formatFundingAPR, formatCompact } from "@/lib/format";
import { getFundingRegime } from "@/lib/fundingRegime";
import PriceChart from "./PriceChart";

interface AssetDetailProps {
  asset: MarketAsset;
  fundingHistory?: { time: number; rate: number }[];
  onClose: () => void;
}

const FUNDING_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
] as const;

export default function AssetDetail({
  asset,
  fundingHistory,
  onClose,
}: AssetDetailProps) {
  const [fundingRange, setFundingRange] = useState<7 | 30 | 60>(7);
  const [extendedFunding, setExtendedFunding] = useState<{ time: number; rate: number }[] | null>(null);
  const [loadingFunding, setLoadingFunding] = useState(false);
  const [tab, setTab] = useState<"price" | "funding">("price");

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;
  const priceColor =
    asset.priceChange24h > 0
      ? "text-green-500"
      : asset.priceChange24h < 0
        ? "text-red-500"
        : "text-zinc-50";

  const fetchExtendedFunding = useCallback(async (days: number) => {
    if (days === 7) {
      setExtendedFunding(null);
      return;
    }
    setLoadingFunding(true);
    try {
      const now = Date.now();
      const startTime = now - days * 24 * 60 * 60 * 1000;
      const res = await fetch(
        `/api/market/funding?coin=${asset.coin}&startTime=${startTime}&endTime=${now}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setExtendedFunding(
        data.map((f: { time: number; fundingRate: string }) => ({
          time: f.time,
          rate: parseFloat(f.fundingRate),
        }))
      );
    } catch {
      // silently fail
    } finally {
      setLoadingFunding(false);
    }
  }, [asset.coin]);

  useEffect(() => {
    fetchExtendedFunding(fundingRange);
  }, [fundingRange, fetchExtendedFunding]);

  const activeFunding = fundingRange === 7 ? fundingHistory : extendedFunding;
  const aprData = activeFunding?.map((f) => ({
    time: f.time,
    apr: f.rate * 8760 * 100,
  }));
  const fundingRegime = getFundingRegime(
    asset.fundingRate,
    activeFunding ?? undefined
  );
  const regimeColor =
    fundingRegime.tone === "red"
      ? "text-red-400"
      : fundingRegime.tone === "green"
        ? "text-green-400"
        : "text-zinc-400";

  return (
    <div className="bg-zinc-900/80 border-t border-b border-zinc-700 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-zinc-50 font-bold text-sm">{asset.coin}</span>
          <span className="text-zinc-400">
            {formatUSD(asset.markPx, priceDecimals)}
          </span>
          <span className={priceColor}>
            {formatPct(asset.priceChange24h)}
          </span>
          <span className="text-zinc-400">
            Funding: {formatFundingRate(asset.fundingRate)} ({formatFundingAPR(asset.fundingAPR)} APR)
          </span>
          <span className="text-zinc-400">
            OI: {formatCompact(asset.openInterest)}
          </span>
          <span className="text-zinc-400">
            Vol: {formatCompact(asset.dayVolume)}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1 px-4 pb-2">
        <button
            onClick={() => setTab("price")}
            className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
              tab === "price"
                ? "bg-[#7dd4c4]/20 text-[#b9ece2]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
        >
          Price Chart
        </button>
        <button
            onClick={() => setTab("funding")}
            className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
              tab === "funding"
                ? "bg-[#7dd4c4]/20 text-[#b9ece2]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
        >
          Funding History
        </button>
      </div>

      {/* Chart area */}
      <div className="px-4 pb-3">
        {tab === "price" ? (
          <div className="h-[280px]">
            <PriceChart coin={asset.coin} />
          </div>
        ) : (
          <div>
            {/* Funding range selector */}
            <div className="flex items-center gap-1 mb-2">
              {FUNDING_RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setFundingRange(r.days as 7 | 30 | 60)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                    fundingRange === r.days
                      ? "bg-[#7dd4c4]/20 text-[#b9ece2]"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {loadingFunding && (
                <span className="text-[10px] text-zinc-600 ml-2">Loading...</span>
              )}
            </div>

            {aprData && aprData.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className={regimeColor}>{fundingRegime.label}</span>
                  {fundingRegime.percentile != null && (
                    <span className="text-zinc-500">
                      {fundingRegime.percentile.toFixed(0)}th percentile
                    </span>
                  )}
                  {fundingRegime.meanAPR != null && (
                    <span className="text-zinc-500">
                      Mean: {formatFundingAPR(fundingRegime.meanAPR)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-600">
                  Funding chart is annualized APR (hourly rate x 8760).
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={aprData}
                    margin={{ top: 4, right: 10, left: 10, bottom: 0 }}
                  >
                    <Line
                      type="monotone"
                      dataKey="apr"
                      stroke="#7dd4c4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(t) =>
                        new Date(t).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      axisLine={{ stroke: "#27272a" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontFamily: "monospace",
                      }}
                      labelFormatter={(t) =>
                        new Date(t).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                        })
                      }
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [
                        `${Number(value).toFixed(1)}% APR`,
                        "Funding",
                      ]}
                    />
                  </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-zinc-600 font-mono">
                {loadingFunding ? "Loading funding data..." : "No funding history available"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
