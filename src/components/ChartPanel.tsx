"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
} from "recharts";
import { useMarket } from "@/context/MarketContext";
import { getInfoClient } from "@/lib/hyperliquid";
import { formatUSD, formatPct, formatFundingAPR } from "@/lib/format";

interface ChartPanelProps {
  coin: string;
  onClose: () => void;
}

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  color: string;
  // For bar rendering: body from open to close
  bodyLow: number;
  bodyHigh: number;
}

interface FundingPoint {
  time: number;
  rate: number;
  apr: number;
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

const INTERVAL_DURATIONS: Record<Interval, number> = {
  "1m": 4 * 60 * 60 * 1000, // 4 hours
  "5m": 12 * 60 * 60 * 1000, // 12 hours
  "15m": 24 * 60 * 60 * 1000, // 24 hours
  "1h": 7 * 24 * 60 * 60 * 1000, // 7 days
  "4h": 30 * 24 * 60 * 60 * 1000, // 30 days
  "1d": 90 * 24 * 60 * 60 * 1000, // 90 days
};

export default function ChartPanel({ coin, onClose }: ChartPanelProps) {
  const { assets } = useMarket();
  const asset = assets.find((a) => a.coin === coin);

  const [interval, setInterval_] = useState<Interval>("1h");
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [fundingData, setFundingData] = useState<FundingPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCandles = useCallback(
    async (int: Interval) => {
      setLoading(true);
      try {
        const info = getInfoClient();
        const now = Date.now();
        const startTime = now - INTERVAL_DURATIONS[int];

        const data = await info.candleSnapshot({
          coin,
          interval: int,
          startTime,
          endTime: now,
        });

        const parsed: CandleData[] = data.map((c) => {
          const open = parseFloat(c.o);
          const close = parseFloat(c.c);
          const high = parseFloat(c.h);
          const low = parseFloat(c.l);
          const isGreen = close >= open;
          return {
            time: c.t,
            open,
            high,
            low,
            close,
            volume: parseFloat(c.v),
            color: isGreen ? "#22c55e" : "#ef4444",
            bodyLow: Math.min(open, close),
            bodyHigh: Math.max(open, close),
          };
        });

        setCandles(parsed);
      } catch (err) {
        console.error("Failed to fetch candles:", err);
      } finally {
        setLoading(false);
      }
    },
    [coin]
  );

  const fetchFunding = useCallback(async () => {
    try {
      const info = getInfoClient();
      const now = Date.now();
      const startTime = now - 7 * 24 * 60 * 60 * 1000; // 7 days

      const data = await info.fundingHistory({
        coin,
        startTime,
        endTime: now,
      });

      const parsed: FundingPoint[] = data.map((f) => ({
        time: f.time,
        rate: parseFloat(f.fundingRate),
        apr: parseFloat(f.fundingRate) * 8760 * 100,
      }));

      setFundingData(parsed);
    } catch (err) {
      console.error("Failed to fetch funding history:", err);
    }
  }, [coin]);

  useEffect(() => {
    fetchCandles(interval);
    fetchFunding();
  }, [interval, fetchCandles, fetchFunding]);

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        Asset not found
      </div>
    );
  }

  const priceColor =
    asset.priceChange24h > 0
      ? "text-green-500"
      : asset.priceChange24h < 0
        ? "text-red-500"
        : "text-zinc-50";

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;

  // Price domain for Y axis
  const prices = candles.map((c) => [c.low, c.high]).flat();
  const minPrice = prices.length > 0 ? Math.min(...prices) * 0.999 : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.001 : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-bold">{coin}</span>
              <span className="text-lg font-mono">
                {formatUSD(asset.markPx, priceDecimals)}
              </span>
              <span className={`text-sm font-mono ${priceColor}`}>
                {formatPct(asset.priceChange24h)}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Funding APR: {formatFundingAPR(asset.fundingAPR)}
            </div>
          </div>
        </div>

        {/* Interval selector */}
        <div className="flex gap-1">
          {INTERVALS.map((int) => (
            <button
              key={int.value}
              onClick={() => setInterval_(int.value)}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                interval === int.value
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {int.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="flex-1 min-h-0 px-2 py-1">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="skeleton w-full h-3/4 rounded" />
          </div>
        ) : candles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-600">
            No candle data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={candles}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#27272a"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tickFormatter={(t) => {
                  const d = new Date(t);
                  return interval === "1d"
                    ? d.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : d.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                }}
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickFormatter={(v) => formatUSD(v, priceDecimals)}
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                orientation="right"
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  formatUSD(Number(value), priceDecimals),
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              {/* Candle bodies as stacked bars */}
              <Bar dataKey="bodyLow" stackId="candle" fill="transparent" />
              <Bar
                dataKey={(entry: CandleData) =>
                  entry.bodyHigh - entry.bodyLow
                }
                stackId="candle"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props;
                  if (!payload) return null;
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={Math.max(height || 1, 1)}
                      fill={(payload as CandleData).color}
                      rx={1}
                    />
                  );
                }}
              />
              {/* High-low wicks as a line overlay */}
              <Line
                dataKey="high"
                stroke="transparent"
                dot={false}
                activeDot={false}
              />
              <Line
                dataKey="low"
                stroke="transparent"
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Funding Rate Sparkline */}
      {fundingData.length > 0 && (
        <div className="h-20 border-t border-zinc-800 px-2 flex-shrink-0">
          <div className="px-2 pt-1 text-[10px] text-zinc-500 uppercase tracking-wider">
            7d Funding Rate
          </div>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart
              data={fundingData}
              margin={{ top: 4, right: 10, left: 10, bottom: 0 }}
            >
              <Line
                type="monotone"
                dataKey="apr"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
              />
              <XAxis dataKey="time" hide />
              <YAxis hide />
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
      )}
    </div>
  );
}
