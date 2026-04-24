"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn, formatUSD } from "@/lib/format";

type TimeRange = "7d" | "30d" | "90d" | "all";
type ChartMode = "line" | "bars";

const RANGE_MS: Record<TimeRange, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(timestamp: number): number {
  const date = new Date(startOfDay(timestamp));
  date.setDate(date.getDate() - date.getDay());
  return date.getTime();
}

function formatPeriodLabel(timestamp: number, weekly: boolean): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(weekly ? {} : {}),
  });
}

export default function EquityCurve({ density = "compact" }: { density?: "compact" | "roomy" }) {
  const { equityCurve, trades, loading } = usePortfolio();
  const [range, setRange] = useState<TimeRange>("30d");
  const [chartMode, setChartMode] = useState<ChartMode>("line");

  const chartData = useMemo(() => {
    if (equityCurve.length === 0) return [];

    const now = Date.now();
    const cutoff = range === "all" ? 0 : now - RANGE_MS[range];
    const filtered = equityCurve.filter((point) => point.time >= cutoff);
    const scoped = filtered.length >= 2 ? filtered : equityCurve;
    if (scoped.length === 0) return [];

    const startEquity = scoped[0].equity;
    return scoped.map((point) => ({
      time: point.time,
      accountEquity: point.equity,
      realizedPnl: point.equity - startEquity,
    }));
  }, [equityCurve, range]);

  const latestPoint = chartData[chartData.length - 1] ?? null;
  const latestRealized = latestPoint?.realizedPnl ?? 0;

  const pnlBars = useMemo(() => {
    if (trades.length === 0) return [];
    const now = Date.now();
    const cutoff = range === "all" ? 0 : now - RANGE_MS[range];
    const visibleTrades = trades.filter((trade) => trade.exitTime >= cutoff);
    const weekly = range === "90d" || range === "all";
    const grouped = new Map<number, { time: number; label: string; pnl: number; trades: number }>();

    for (const trade of visibleTrades) {
      const time = weekly ? startOfWeek(trade.exitTime) : startOfDay(trade.exitTime);
      const current = grouped.get(time) ?? {
        time,
        label: formatPeriodLabel(time, weekly),
        pnl: 0,
        trades: 0,
      };
      current.pnl += trade.pnl;
      current.trades += 1;
      grouped.set(time, current);
    }

    return Array.from(grouped.values()).sort((a, b) => a.time - b.time);
  }, [range, trades]);

  const visibleBarPnl = pnlBars.reduce((sum, point) => sum + point.pnl, 0);
  const realizedInView = chartMode === "bars" ? visibleBarPnl : latestRealized;

  if (loading && trades.length === 0) {
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

  if (trades.length === 0 || chartData.length < 2) return null;

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
                  realizedInView >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {realizedInView >= 0 ? "+" : ""}
                {formatUSD(realizedInView)} realized in view
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              {chartMode === "line" ? (
                <>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Account equity
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-zinc-100" />
                    Realized trade P&amp;L
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Positive closed P&amp;L
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    Negative closed P&amp;L
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="mr-1 inline-flex overflow-hidden rounded-full border border-zinc-800 bg-zinc-950/80">
              {(["line", "bars"] as ChartMode[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setChartMode(value)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-colors",
                    chartMode === value
                      ? "bg-emerald-500/[0.12] text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
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
        {chartMode === "bars" && pnlBars.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-zinc-800 bg-zinc-950/45 px-4 text-center">
            <div>
              <div className="text-sm font-medium text-zinc-200">No closed-trade P&amp;L in this range.</div>
              <div className="mt-2 text-xs text-zinc-500">
                Switch ranges or use the line view to inspect the account curve.
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === "line" ? (
            <ComposedChart data={chartData} margin={{ top: 10, right: 22, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolioEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
              </defs>

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
                yAxisId="equity"
                orientation="right"
                tickFormatter={(value) => formatUSD(value, Math.abs(value) >= 1000 ? 0 : 2)}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <YAxis yAxisId="pnl" hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#050807",
                  border: "1px solid rgba(39, 39, 42, 0.95)",
                  borderRadius: "14px",
                  fontSize: "12px",
                  color: "#f4f4f5",
                }}
                labelFormatter={(value) =>
                  new Date(value).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                }
                formatter={(value, name) => [
                  formatUSD(Number(value ?? 0)),
                  name === "accountEquity" ? "Account equity" : "Realized trade P&L",
                ]}
              />

              <Area
                yAxisId="equity"
                type="monotone"
                dataKey="accountEquity"
                stroke="#34d399"
                strokeWidth={2.4}
                fill="url(#portfolioEquityFill)"
              />
              <Line
                yAxisId="pnl"
                type="monotone"
                dataKey="realizedPnl"
                stroke="#f4f4f5"
                strokeWidth={1.65}
                dot={false}
                activeDot={{ r: 3.5, fill: "#f4f4f5" }}
              />
            </ComposedChart>
            ) : (
            <ComposedChart data={pnlBars} margin={{ top: 10, right: 22, left: 0, bottom: 8 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                orientation="right"
                tickFormatter={(value) => formatUSD(Number(value), Math.abs(Number(value)) >= 1000 ? 0 : 2)}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={72}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#050807",
                  border: "1px solid rgba(39, 39, 42, 0.95)",
                  borderRadius: "14px",
                  fontSize: "12px",
                  color: "#f4f4f5",
                }}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as { time?: number; trades?: number } | undefined;
                  if (!point?.time) return "Realized P&L";
                  return `${new Date(point.time).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })} · ${point.trades ?? 0} trade${point.trades === 1 ? "" : "s"}`;
                }}
                formatter={(value) => [formatUSD(Number(value ?? 0)), "Realized P&L"]}
              />
              <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="4 4" />
              <Bar dataKey="pnl" maxBarSize={34} radius={[6, 6, 4, 4]}>
                {pnlBars.map((point) => (
                  <Cell key={point.time} fill={point.pnl >= 0 ? "#34d399" : "#f87171"} />
                ))}
              </Bar>
            </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
