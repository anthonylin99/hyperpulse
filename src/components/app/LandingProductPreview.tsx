"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Layers3,
  LayoutGrid,
  Shield,
  Waves,
} from "lucide-react";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

interface WhaleHeadline {
  headline: string;
  address: string;
}

const MENU_ITEMS: Array<{ label: string; icon: typeof LayoutGrid; active?: boolean }> = [
  { label: "Overview", icon: LayoutGrid, active: true },
  { label: "Markets", icon: BarChart3 },
  { label: "Factors", icon: Layers3 },
  { label: "Whales", icon: Waves },
  { label: "Portfolio", icon: BriefcaseBusiness },
  { label: "Docs", icon: Shield },
] as const;

const EQUITY_POINTS = [38, 39, 41, 42, 44, 47, 51, 49, 52, 56, 59, 57, 60, 64, 66, 63, 67];

function chartPath(points: number[]) {
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * 100;
      const y = 100 - point;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function MiniSparkline({ values, tone = "positive" }: { values: number[]; tone?: "positive" | "negative" }) {
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${(index / (values.length - 1 || 1)) * 100},${100 - value}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full">
      <path d={path} fill="none" stroke={tone === "positive" ? "#5eead4" : "#fb7185"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function sparklineValues(seed: number) {
  const base = Math.max(18, Math.min(82, 50 + seed * 3));
  return [0, 1, 2, 3, 4, 5, 6].map((index) => {
    const swing = ((index % 2 === 0 ? -1 : 1) * (Math.abs(seed) + index * 0.8));
    return Math.max(8, Math.min(92, base + swing));
  });
}

function StatCard({ label, value, helper, tone = "neutral" }: { label: string; value: string; helper: string; tone?: "neutral" | "positive" | "negative" }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
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
  const { whalesEnabled, factorsEnabled } = useAppConfig();
  const [whaleHeadline, setWhaleHeadline] = useState<WhaleHeadline | null>(null);

  useEffect(() => {
    if (!whalesEnabled) {
      setWhaleHeadline(null);
      return;
    }
    let mounted = true;

    const loadHeadline = async () => {
      try {
        const response = await fetch("/api/whales/feed?timeframe=24h&severity=all", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { alerts?: Array<{ headline: string; walletAddress?: string; wallet?: string }> };
        const first = data.alerts?.[0];
        if (!mounted || !first) return;
        setWhaleHeadline({ headline: first.headline, address: first.walletAddress ?? first.wallet ?? "" });
      } catch {
        // ignore
      }
    };

    loadHeadline();
    return () => {
      mounted = false;
    };
  }, [whalesEnabled]);

  const bias = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories, btcCandles }),
    [assets, fundingHistories, btcCandles],
  );

  const majors = useMemo(
    () => ["BTC", "ETH", "SOL", "HYPE"]
      .map((coin) => assets.find((asset) => asset.coin === coin))
      .filter((asset): asset is NonNullable<(typeof assets)[number]> => Boolean(asset)),
    [assets],
  );
  const previewAssets = useMemo(
    () => [...assets].sort((a, b) => b.openInterest - a.openInterest).slice(0, 4),
    [assets],
  );
  const leader7d = leader?.windows.find((window) => window.days === 7)?.spreadReturn ?? null;
  const portfolioPreview = {
    equity: 1230.51,
    pnl30d: 559.4,
    winRate: 63.3,
    openPositions: 5,
    unrealized: -69.96,
  };

  return (
    <div className="overflow-hidden rounded-[34px] border border-zinc-800 bg-[#0d1218] shadow-[0_0_0_1px_rgba(45,212,191,0.05)]">
      <div className="border-b border-zinc-800 bg-[#0f161d] px-4 py-3">
        <div className="scrollbar-hide flex items-center gap-4 overflow-x-auto text-[11px] text-zinc-400">
          {majors.map((asset) => (
            <div key={asset.coin} className="flex items-center gap-2 whitespace-nowrap border-r border-zinc-800 pr-4">
              <span className="text-zinc-500">{asset.coin}</span>
              <span className="font-mono text-zinc-200">{formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}</span>
              <span className={asset.priceChange24h >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>{formatPct(asset.priceChange24h)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 whitespace-nowrap border-r border-zinc-800 pr-4">
            <span className="text-zinc-500">Funding (7D)</span>
            <span className="font-mono text-rose-300">{formatFundingAPR(majors[0]?.fundingAPR ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap border-r border-zinc-800 pr-4">
            <span className="text-zinc-500">Bias</span>
            <span className={bias.trendScore >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
              {bias.trendLabel} ({bias.trendScore})
            </span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-zinc-500">{whalesEnabled ? "Whale Alert" : "Portfolio"}</span>
            <span className="font-mono text-zinc-200">{whalesEnabled ? whaleHeadline?.headline ?? "Watching tape" : "Read-only by default"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Live</span>
            <span className="font-mono text-zinc-200">
              {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-zinc-800 bg-[#0b1015] p-4">
          <div className="text-xl font-semibold tracking-tight text-zinc-100">
            Hyper<span className="text-[#66e0cc]">Pulse</span>
          </div>
          <div className="mt-6 space-y-2">
            {MENU_ITEMS.filter((item) => {
              if (!whalesEnabled && item.label === "Whales") return false;
              if (!factorsEnabled && item.label === "Factors") return false;
              return true;
            }).map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm",
                    item.active
                      ? "border border-teal-500/20 bg-teal-500/10 text-zinc-100"
                      : "text-zinc-500",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Account Equity</div>
            <div className="mt-3 font-mono text-3xl text-zinc-100">$1,230.51</div>
            <div className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
              +$559.40 (63.3%)
            </div>
          </div>
        </aside>

        <div className="p-5 xl:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Overview</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">Your live market command center.</div>
            </div>
            <Link href="/markets" className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100">
              Customize
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total Equity" value="$1,219.97" helper="+$559.42 (30D)" tone="positive" />
            <StatCard label="P&L (30D)" value="+$559.40" helper="+63.3%" tone="positive" />
            <StatCard label="Win Rate" value="63.3%" helper="31W / 18L" />
            <StatCard label="Open Positions" value="5" helper="Live exposure" />
            <StatCard label="Unrealized P&L" value="-$69.96" helper="Current" tone="negative" />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Portfolio Performance</div>
                  <div className="mt-1 text-sm text-zinc-400">Account equity vs realized P&L</div>
                </div>
                <div className="flex gap-2 text-[11px] text-zinc-500">
                  {['7D','30D','90D','ALL'].map((window) => (
                    <div key={window} className={cn('rounded-full border px-2.5 py-1', window === '30D' ? 'border-teal-500/30 bg-teal-500/10 text-zinc-100' : 'border-zinc-800 bg-zinc-950/70')}>
                      {window}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-52 w-full">
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
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Market Pulse</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-100">{bias.trendLabel}</div>
                <div className="mt-1 text-sm text-zinc-400">Bias (Tomorrow)</div>
                <div className="mt-4 h-2 rounded-full bg-zinc-900">
                  <div className="h-full bg-gradient-to-r from-rose-500 via-zinc-500 to-emerald-400" />
                </div>
                <div className="mt-4 space-y-3 text-sm text-zinc-400">
                  <div className="flex items-center justify-between"><span>BTC 24H</span><span className="font-mono text-emerald-300">{formatPct(majors[0]?.priceChange24h ?? 0)}</span></div>
                  <div className="flex items-center justify-between"><span>BTC Funding APR</span><span className="font-mono text-rose-300">{formatFundingAPR(majors[0]?.fundingAPR ?? 0)}</span></div>
                  <div className="flex items-center justify-between">
                    <span>{factorsEnabled ? "Factor Leader" : "Mode"}</span>
                    <span className="font-mono text-zinc-200">{factorsEnabled ? leader?.snapshot.name ?? "Live" : "Read-only"}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    {factorsEnabled ? "Top Factor (7D)" : "Funding Regime"}
                  </div>
                  <div className="mt-2 text-lg font-medium text-zinc-100">
                    {factorsEnabled ? leader?.snapshot.name ?? "Market Risk" : bias.trendLabel}
                  </div>
                  <div className="mt-2 font-mono text-emerald-300">
                    {factorsEnabled ? leader7d != null ? formatPct(leader7d) : "+0.00%" : formatFundingAPR(majors[0]?.fundingAPR ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{whalesEnabled ? "Whale Alert" : "Portfolio Mode"}</div>
                  <div className="mt-2 text-base font-medium text-zinc-100">{whalesEnabled ? whaleHeadline?.headline ?? 'Watching tape' : 'Paste any public wallet'}</div>
                  <div className="mt-2 text-xs text-zinc-500">{whalesEnabled ? "Tracked positioning flow" : "No seed phrase, no manual private key"}</div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Top Movers (24H)</div>
                  <div className="mt-3 space-y-2">
                    {previewAssets.slice(0, 3).map((asset) => (
                      <div key={asset.coin} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{asset.coin}</span>
                        <span className={asset.priceChange24h >= 0 ? 'font-mono text-emerald-300' : 'font-mono text-rose-300'}>{formatPct(asset.priceChange24h)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Markets</div>
                  <div className="mt-1 text-sm text-zinc-400">Funding, price, and signal context</div>
                </div>
                <Activity className="h-4 w-4 text-teal-300" />
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c1014]">
                <div className="grid grid-cols-[minmax(110px,1.2fr)_repeat(4,minmax(80px,1fr))] gap-3 border-b border-zinc-800 px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  <div>Asset</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">24h</div>
                  <div className="text-right">Funding</div>
                  <div className="text-right">Signal</div>
                </div>
                {previewAssets.map((asset) => (
                  <div key={asset.coin} className="grid grid-cols-[minmax(110px,1.2fr)_repeat(4,minmax(80px,1fr))] gap-3 border-b border-zinc-800/80 px-4 py-3 last:border-b-0">
                    <div className="text-sm text-zinc-200">{asset.coin}</div>
                    <div className="text-right font-mono text-sm text-zinc-200">{formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}</div>
                    <div className={cn('text-right font-mono text-sm', asset.priceChange24h >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{formatPct(asset.priceChange24h)}</div>
                    <div className="text-right font-mono text-sm text-zinc-300">{formatFundingAPR(asset.fundingAPR)}</div>
                    <div className="text-right text-sm text-zinc-400">{asset.signal.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Portfolio Sneak Peek</div>
                  <div className="mt-1 text-sm text-zinc-400">Review layer inside the same shell</div>
                </div>
                <Link href="/portfolio" className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100">
                  Open
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Total Equity</div>
                  <div className="mt-2 font-mono text-2xl text-zinc-100">${portfolioPreview.equity.toFixed(2)}</div>
                  <div className="mt-1 text-xs text-emerald-300">+${portfolioPreview.pnl30d.toFixed(2)} (30D)</div>
                  <div className="mt-4 h-24">
                    <MiniSparkline values={sparklineValues(8)} tone="positive" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Win Rate</div>
                    <div className="mt-2 font-mono text-2xl text-zinc-100">{portfolioPreview.winRate}%</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Open Positions</div>
                    <div className="mt-2 font-mono text-2xl text-zinc-100">{portfolioPreview.openPositions}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Unrealized</div>
                    <div className="mt-2 font-mono text-2xl text-rose-300">{formatUSD(portfolioPreview.unrealized)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
