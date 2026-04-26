"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn, formatUSD } from "@/lib/format";

type TimeRange = "7d" | "30d" | "90d" | "all";

const RANGE_MS: Record<TimeRange, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

function EquityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="min-w-[160px] rounded-2xl border border-zinc-800/90 bg-[#070b09]/95 px-3 py-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
      <div className="mt-1.5 text-lg font-semibold text-zinc-50">{formatUSD(value)}</div>
      <div className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-300/90">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Account equity
      </div>
    </div>
  );
}

export default function EquityCurve({ density = "compact" }: { density?: "compact" | "roomy" }) {
  const { equityCurve, loading } = usePortfolio();
  const [range, setRange] = useState<TimeRange>("30d");

  const chartData = useMemo(() => {
    if (equityCurve.length === 0) return [];
    if (range === "all") {
      const baseline = equityCurve[0]?.equity ?? 0;
      return equityCurve.map((point) => ({
        time: point.time,
        accountEquity: point.equity,
        changeInView: point.equity - baseline,
      }));
    }

    const now = Date.now();
    const cutoff = now - RANGE_MS[range];
    const sorted = [...equityCurve].sort((a, b) => a.time - b.time);
    const lastBeforeCutoff = [...sorted].reverse().find((point) => point.time <= cutoff) ?? sorted[0];
    const pointsInRange = sorted.filter((point) => point.time >= cutoff);
    const openingPoint = {
      time: cutoff,
      equity: lastBeforeCutoff.equity,
      drawdown: lastBeforeCutoff.drawdown,
    };

    const scoped = [
      openingPoint,
      ...pointsInRange.filter((point) => point.time !== cutoff),
    ];

    const lastScopedPoint = scoped[scoped.length - 1];
    if (lastScopedPoint && lastScopedPoint.time < now) {
      scoped.push({
        time: now,
        equity: lastScopedPoint.equity,
        drawdown: lastScopedPoint.drawdown,
      });
    }

    return scoped.map((point) => ({
      time: point.time,
      accountEquity: point.equity,
      changeInView: point.equity - openingPoint.equity,
    }));
  }, [equityCurve, range]);

  const latestPoint = chartData[chartData.length - 1] ?? null;
  const startingPoint = chartData[0] ?? null;
  const changeInView = latestPoint?.changeInView ?? 0;
  const rangeHigh = useMemo(
    () => (chartData.length ? Math.max(...chartData.map((point) => point.accountEquity)) : null),
    [chartData],
  );
  const rangeLow = useMemo(
    () => (chartData.length ? Math.min(...chartData.map((point) => point.accountEquity)) : null),
    [chartData],
  );

  if (loading && equityCurve.length === 0) {
    return (
      <section className="rounded-[28px] border border-zinc-800 bg-zinc-950/85 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="skeleton h-3 w-28 rounded mb-2" />
            <div className="skeleton h-8 w-40 rounded mb-2" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-9 w-14 rounded-full" />
            ))}
          </div>
        </div>
        <div className="mt-5 skeleton h-[360px] w-full rounded-[22px]" />
      </section>
    );
  }

  if (chartData.length < 2) return null;

  return (
    <section className="overflow-hidden rounded-[30px] border border-emerald-900/25 bg-[linear-gradient(180deg,rgba(7,14,12,0.98),rgba(5,10,9,0.98))]">
      <div className="border-b border-zinc-800 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
              Portfolio Performance
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <div className="text-4xl font-semibold tracking-tight text-zinc-50">
                {latestPoint ? formatUSD(latestPoint.accountEquity) : "--"}
              </div>
              <div
                className={cn(
                  "pb-1 text-sm font-medium",
                  changeInView >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {changeInView >= 0 ? "+" : ""}
                {formatUSD(changeInView)} net change in view
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Equity curve
              </span>
              {startingPoint ? (
                <span>
                  Started at {formatUSD(startingPoint.accountEquity)}
                </span>
              ) : null}
              {rangeLow != null && rangeHigh != null ? (
                <span>
                  Range {formatUSD(rangeLow)} - {formatUSD(rangeHigh)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["7d", "30d", "90d", "all"] as TimeRange[]).map((value) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-colors",
                  range === value
                    ? "border-emerald-900/30 bg-emerald-500/[0.10] text-emerald-200"
                    : "border-zinc-800 bg-zinc-950/80 text-zinc-500 hover:text-zinc-200",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cn(density === "roomy" ? "h-[420px] px-4 py-5 sm:px-5" : "h-[380px] px-3 py-4 sm:px-4")}>
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 56, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolioEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.24} />
                  <stop offset="70%" stopColor="#15803d" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#020617" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="rgba(39,39,42,0.45)" strokeDasharray="0" />
              <XAxis
                dataKey="time"
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                orientation="right"
                tickFormatter={(value) => formatUSD(value, Math.abs(value) >= 1000 ? 0 : 2)}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={88}
                domain={(["dataMin - 60", "dataMax + 60"] as unknown) as [string, string]}
                mirror={false}
              />
              <Tooltip
                cursor={{ stroke: "rgba(52, 211, 153, 0.28)", strokeWidth: 1 }}
                content={<EquityTooltip />}
              />
              {startingPoint ? (
                <ReferenceLine
                  y={startingPoint.accountEquity}
                  stroke="rgba(161,161,170,0.4)"
                  strokeDasharray="4 4"
                />
              ) : null}

              <Area
                type="monotone"
                dataKey="accountEquity"
                stroke="#34d399"
                strokeWidth={3}
                fill="url(#portfolioEquityFill)"
                dot={false}
                activeDot={{
                  r: 4.5,
                  stroke: "#052e16",
                  strokeWidth: 3,
                  fill: "#6ee7b7",
                }}
              />
            </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
