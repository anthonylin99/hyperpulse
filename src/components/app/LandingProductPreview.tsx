"use client";

import Link from "next/link";
import { useMemo } from "react";
import BrandLogo from "@/components/brand/BrandLogo";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

const EQUITY_POINTS = [36, 37, 39, 42, 46, 48, 47, 50, 53, 55, 54, 58, 63, 65, 67, 71, 74];

function chartPath(points: number[]) {
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * 100;
      const y = 100 - point;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function MiniCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-3 font-mono text-2xl text-zinc-100",
          tone === "positive" && "text-emerald-300",
          tone === "negative" && "text-rose-300",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

export default function LandingProductPreview() {
  const { assets, lastUpdated, fundingHistories, btcCandles } = useMarket();
  const { leader } = useFactors();
  const { factorsEnabled } = useAppConfig();

  const bias = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories, btcCandles }),
    [assets, fundingHistories, btcCandles]
  );

  const majors = useMemo(
    () =>
      ["BTC", "ETH", "SOL", "HYPE"]
        .map((coin) => assets.find((asset) => asset.coin === coin))
        .filter((asset): asset is NonNullable<(typeof assets)[number]> => Boolean(asset)),
    [assets]
  );

  const previewAssets = useMemo(
    () => [...assets].sort((a, b) => b.openInterest - a.openInterest).slice(0, 4),
    [assets]
  );

  const leader7d = leader?.windows.find((window) => window.days === 7)?.spreadReturn ?? null;

  return (
    <div className="overflow-hidden rounded-[34px] border border-zinc-800 bg-[#0d1218] shadow-[0_0_0_1px_rgba(45,212,191,0.05)]">
      <div className="border-b border-zinc-800 bg-[#0f161d] px-4 py-3">
        <div className="scrollbar-hide flex items-center gap-4 overflow-x-auto text-[11px] text-zinc-400">
          {majors.map((asset) => (
            <div key={asset.coin} className="flex items-center gap-2 whitespace-nowrap border-r border-zinc-800 pr-4">
              <span className="text-zinc-500">{asset.coin}</span>
              <span className="font-mono text-zinc-200">
                {formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}
              </span>
              <span className={asset.priceChange24h >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
                {formatPct(asset.priceChange24h)}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 whitespace-nowrap border-r border-zinc-800 pr-4">
            <span className="text-zinc-500">Funding (7D)</span>
            <span className="font-mono text-rose-300">
              {formatFundingAPR(majors[0]?.fundingAPR ?? 0)}
            </span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-zinc-500">Bias</span>
            <span className={bias.trendScore >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
              {bias.trendLabel} ({bias.trendScore >= 0 ? "+" : ""}{bias.trendScore})
            </span>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-[#0c1117] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo compact markClassName="h-8 w-8" textClassName="h-5" />
          <div className="hidden items-center gap-1 text-sm md:flex">
            <span className="rounded-xl bg-emerald-500/[0.08] px-3 py-2 text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.14)]">
              Markets
            </span>
            <span className="px-3 py-2 text-zinc-500">Portfolio</span>
            {factorsEnabled ? <span className="px-3 py-2 text-zinc-500">Factors</span> : null}
            <span className="px-3 py-2 text-zinc-500">Docs</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300">
            All Accounts
          </div>
        </div>
      </div>

      <div className="p-5 xl:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MiniCard label="Total Equity" value="$1,230.51" helper="+$559.40 (63.3%)" tone="positive" />
          <MiniCard label="P&L (30D)" value="+$559.40" helper="Realized" tone="positive" />
          <MiniCard label="Win Rate" value="63.3%" helper="31W / 18L" />
          <MiniCard label="Open Positions" value="5" helper="Live exposure" />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Equity Performance</div>
                <div className="mt-1 text-sm text-zinc-400">Account equity vs realized P&amp;L</div>
              </div>
              <div className="flex gap-2 text-[11px] text-zinc-500">
                {["7D", "30D", "90D", "ALL"].map((window) => (
                  <div
                    key={window}
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      window === "30D"
                        ? "border-teal-500/30 bg-teal-500/10 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950/70"
                    )}
                  >
                    {window}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-56 w-full">
                <defs>
                  <linearGradient id="landing-equity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(45,212,191,0.3)" />
                    <stop offset="100%" stopColor="rgba(45,212,191,0.02)" />
                  </linearGradient>
                </defs>
                <path d={`${chartPath(EQUITY_POINTS)} L100,100 L0,100 Z`} fill="url(#landing-equity)" />
                <path d={chartPath(EQUITY_POINTS)} fill="none" stroke="#5eead4" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Market Bias (Tomorrow)</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-100">{bias.trendLabel}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-400 via-zinc-300 to-emerald-400"
                  style={{ width: `${Math.min(100, Math.max(18, 50 + bias.trendScore * 10))}%` }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-zinc-500">Funding (7D)</span>
                <span className={majors[0]?.fundingAPR && majors[0].fundingAPR < 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
                  {formatFundingAPR(majors[0]?.fundingAPR ?? 0)}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Market Pulse</div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/75 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Asset</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">24H</th>
                      <th className="px-4 py-3">Funding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewAssets.map((asset) => (
                      <tr key={asset.coin} className="border-t border-zinc-800 text-zinc-200">
                        <td className="px-4 py-3 font-medium">{asset.coin}</td>
                        <td className="px-4 py-3 font-mono">{formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}</td>
                        <td className={cn("px-4 py-3 font-mono", asset.priceChange24h >= 0 ? "text-emerald-300" : "text-rose-300")}>
                          {formatPct(asset.priceChange24h)}
                        </td>
                        <td className={cn("px-4 py-3 font-mono", asset.fundingAPR <= 0 ? "text-emerald-300" : "text-rose-300")}>
                          {formatFundingAPR(asset.fundingAPR)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-3xl border border-zinc-800 bg-zinc-950/55 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Factor Lens</div>
            <div className="mt-1 text-sm text-zinc-300">
              {leader7d != null
                ? `${leader?.snapshot.name ?? "Top factor"} ${formatPct(leader7d)} over 7D`
                : "Markets, portfolio, and docs in one cleaner shell."}
            </div>
          </div>
          <Link href="/markets" className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100">
            View Markets
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">Hyperliquid Native</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">Read-only Wallet Review</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">Built for Traders</span>
          </div>
          <div className="font-mono text-zinc-400">
            {lastUpdated
              ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
              : "--:--:--"}
          </div>
        </div>
      </div>
    </div>
  );
}
