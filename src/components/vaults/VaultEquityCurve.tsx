"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatUSD } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import type { VaultPortfolioWindow } from "@/types/vaults";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_MS: Record<Range, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

function pickWindow(portfolio: VaultPortfolioWindow[], range: Range): VaultPortfolioWindow | null {
  // Map UI ranges to API periods; fall back to allTime when a smaller period
  // is missing. The 90d range is trimmed from allTime client-side.
  if (range === "7d") return portfolio.find((p) => p.period === "week") ?? null;
  if (range === "30d") return portfolio.find((p) => p.period === "month") ?? null;
  return portfolio.find((p) => p.period === "allTime") ?? null;
}

export function VaultEquityCurve({ portfolio }: { portfolio: VaultPortfolioWindow[] }) {
  const [range, setRange] = useState<Range>("30d");

  const series = useMemo(() => {
    const window = pickWindow(portfolio, range);
    if (!window) return [];
    let history = window.accountValueHistory;
    if (range === "90d") {
      const cutoff = Date.now() - RANGE_MS["90d"];
      history = history.filter(([t]) => t >= cutoff);
    }
    if (history.length < 2) return [];

    // Compute running peak + drawdown for the shaded overlay.
    let peak = history[0][1];
    return history.map(([time, equity]) => {
      peak = Math.max(peak, equity);
      const ddPct = peak > 0 ? (equity - peak) / peak : 0; // 0 or negative
      return {
        time,
        equity,
        // Shade band rendered as area between peak and current equity when in drawdown.
        drawdownBand: ddPct < 0 ? peak - equity : 0,
        peak,
      };
    });
  }, [portfolio, range]);

  return (
    <section className="overflow-hidden rounded-lg border border-emerald-900/25 bg-[linear-gradient(180deg,rgba(7,14,12,0.98),rgba(5,10,9,0.98))]">
      <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="label text-emerald-400/75">Equity curve</div>
          <div className="mt-1 text-sm text-zinc-400">
            Vault account value over time. Red shading marks drawdown from the running peak.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["7d", "30d", "90d", "all"] as Range[]).map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
                range === value
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-zinc-800 bg-zinc-950/80 text-zinc-500 hover:text-zinc-200",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[380px] px-3 py-4 sm:px-4">
        {series.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Not enough history to render this window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 56, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="vaultEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="#020617" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="vaultDrawdownFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(39,39,42,0.45)" />
              <XAxis
                dataKey="time"
                tickFormatter={(v) => formatEasternDate(Number(v))}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                orientation="right"
                tickFormatter={(v) => formatUSD(v, Math.abs(v) >= 1000 ? 0 : 2)}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={88}
                domain={["dataMin", "dataMax"]}
              />
              <Tooltip content={<EquityTooltip />} cursor={{ stroke: "rgba(52,211,153,0.28)" }} />
              <Area
                type="monotone"
                dataKey="peak"
                stroke="transparent"
                fill="url(#vaultDrawdownFill)"
                isAnimationActive={false}
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#34d399"
                strokeWidth={2.5}
                fill="url(#vaultEquityFill)"
                isAnimationActive={false}
                activeDot={{ r: 4, stroke: "#052e16", strokeWidth: 2, fill: "#6ee7b7" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function EquityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string }>;
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const eqPoint = payload.find((p) => p.dataKey === "equity");
  const peakPoint = payload.find((p) => p.dataKey === "peak");
  const equity = Number(eqPoint?.value ?? 0);
  const peak = Number(peakPoint?.value ?? equity);
  const ddPct = peak > 0 ? (equity - peak) / peak : 0;
  return (
    <div className="min-w-[180px] rounded-2xl border border-zinc-800/90 bg-[#070b09]/95 px-3 py-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.35)]">
      <div className="label">{formatEasternDate(label, true)}</div>
      <div className="mt-1.5 text-lg font-semibold text-zinc-50">{formatUSD(equity)}</div>
      {ddPct < 0 && (
        <div className="mt-1 text-xs text-red-400">
          {(ddPct * 100).toFixed(2)}% below peak {formatUSD(peak)}
        </div>
      )}
    </div>
  );
}
