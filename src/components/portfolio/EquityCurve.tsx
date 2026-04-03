"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

type TimeRange = "7d" | "30d" | "90d" | "all";

const RANGE_MS: Record<TimeRange, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

export default function EquityCurve() {
  const { equityCurve, loading, trades } = usePortfolio();
  const [range, setRange] = useState<TimeRange>("all");

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="skeleton h-4 w-24 rounded mb-1" />
            <div className="skeleton h-6 w-20 rounded" />
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-6 w-10 rounded" />
            ))}
          </div>
        </div>
        <div className="skeleton w-full rounded" style={{ height: 240 }} />
      </div>
    );
  }

  const now = Date.now();
  const cutoff = range === "all" ? 0 : now - RANGE_MS[range];
  const filtered = equityCurve.filter((p) => p.time >= cutoff);
  const hasRangeData = filtered.length >= 2;
  if (equityCurve.length < 2) return null;

  const startEquity = hasRangeData ? filtered[0].equity : equityCurve[0].equity;
  const endEquity = hasRangeData
    ? filtered[filtered.length - 1].equity
    : equityCurve[equityCurve.length - 1].equity;
  const pnl = hasRangeData ? endEquity - startEquity : 0;
  const isPositive = pnl >= 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-400">Equity Curve</h3>
          <span
            className={cn(
              "text-lg font-bold",
              isPositive ? "text-emerald-400" : "text-red-400",
            )}
          >
            {isPositive ? "+" : ""}
            {formatUSD(pnl)}
          </span>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                range === r
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {hasRangeData ? (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={filtered}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isPositive ? "#10b981" : "#ef4444"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={isPositive ? "#10b981" : "#ef4444"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickFormatter={(t) =>
                new Date(t).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              width={50}
              domain={["auto", "auto"]}
            />
            <Tooltip
              position={{ x: 0, y: 0 }}
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              wrapperStyle={{
                top: 8,
                right: 8,
                left: "auto",
                pointerEvents: "none",
              }}
              labelFormatter={(t) => new Date(t).toLocaleDateString()}
              formatter={(value) => [formatUSD(Number(value)), "Equity"]}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={isPositive ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              fill="url(#equityGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[240px] flex items-center justify-center text-sm text-zinc-500">
          Not enough trades in this range. Try a longer window.
        </div>
      )}
    </div>
  );
}
