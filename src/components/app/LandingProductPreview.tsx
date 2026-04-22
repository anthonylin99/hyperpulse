"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, BriefcaseBusiness, Layers3, Waves } from "lucide-react";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";

interface WhaleHeadline {
  headline: string;
  address: string;
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

export default function LandingProductPreview() {
  const { assets, lastUpdated, fundingHistories, btcCandles } = useMarket();
  const { factors, leader } = useFactors();
  const [whaleHeadline, setWhaleHeadline] = useState<WhaleHeadline | null>(null);

  useEffect(() => {
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
  }, []);

  const bias = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories, btcCandles }),
    [assets, fundingHistories, btcCandles],
  );

  const previewAssets = useMemo(
    () => [...assets].sort((a, b) => b.openInterest - a.openInterest).slice(0, 6),
    [assets],
  );
  const topFactorNames = useMemo(() => factors.slice(0, 3), [factors]);
  const leader7d = leader?.windows.find((window) => window.days === 7)?.spreadReturn ?? null;

  return (
    <div className="overflow-hidden rounded-[30px] border border-zinc-800 bg-[#0e1318] shadow-[0_0_0_1px_rgba(45,212,191,0.04)]">
      <div className="border-b border-zinc-800 bg-[#111820] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">HyperPulse Terminal</div>
            <div className="mt-1 text-sm font-medium text-zinc-100">Markets Overview</div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Live</span>
            <span className="font-mono text-zinc-200">
              {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1.45fr_0.75fr] xl:p-5">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {previewAssets.slice(0, 3).map((asset) => (
              <div key={asset.coin} className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 xl:min-h-[176px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{asset.coin}</div>
                    <div className="mt-2 font-mono text-lg font-semibold text-zinc-100">
                      {formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}
                    </div>
                  </div>
                  <div className={cn("rounded-full px-2 py-1 text-xs font-medium", asset.priceChange24h >= 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
                    {formatPct(asset.priceChange24h)}
                  </div>
                </div>
                <div className="mt-3">
                  <MiniSparkline values={sparklineValues(asset.priceChange24h)} tone={asset.priceChange24h >= 0 ? "positive" : "negative"} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Funding</span>
                  <span className="font-mono text-zinc-300">{formatFundingAPR(asset.fundingAPR)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/55">
            <div className="grid grid-cols-[minmax(120px,1.2fr)_repeat(4,minmax(90px,1fr))] gap-3 border-b border-zinc-800 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              <div>Asset</div>
              <div className="text-right">Price</div>
              <div className="text-right">24h</div>
              <div className="text-right">Funding APR</div>
              <div className="text-right">Signal</div>
            </div>
            <div>
              {previewAssets.map((asset) => (
                <div key={asset.coin} className="grid grid-cols-[minmax(120px,1.2fr)_repeat(4,minmax(90px,1fr))] gap-3 border-b border-zinc-800/80 px-4 py-3 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">{asset.coin}</span>
                  </div>
                  <div className="text-right font-mono text-sm text-zinc-200">{formatUSD(asset.markPx, asset.markPx < 1 ? 4 : 2)}</div>
                  <div className={cn("text-right font-mono text-sm", asset.priceChange24h >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(asset.priceChange24h)}</div>
                  <div className="text-right font-mono text-sm text-zinc-300">{formatFundingAPR(asset.fundingAPR)}</div>
                  <div className="text-right text-sm text-zinc-400">{asset.signal.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 xl:min-h-[216px]">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Tomorrow Bias</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className={cn("text-lg font-semibold", bias.trendScore >= 0 ? "text-emerald-300" : "text-rose-300")}>{bias.trendLabel}</div>
                <div className="mt-1 text-sm text-zinc-400">{bias.trendConfidence} confidence</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-xl text-zinc-100">
                {bias.trendScore}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-900">
              <div className="h-full bg-gradient-to-r from-rose-500 via-zinc-500 to-emerald-400" />
            </div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-400">
              <div className="flex items-center justify-between"><span>BTC 24h</span><span className="font-mono text-zinc-200">{bias.trendInputs.momentum24h}%</span></div>
              <div className="flex items-center justify-between"><span>BTC funding APR</span><span className="font-mono text-zinc-200">{bias.trendInputs.fundingAPR}%</span></div>
              <div className="flex items-center justify-between"><span>BTC OI change</span><span className="font-mono text-zinc-200">{bias.trendInputs.oiChange}%</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 xl:min-h-[220px]">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Factor Leader</div>
            <div className="mt-2 text-lg font-semibold text-zinc-100">{leader?.snapshot.name ?? "Watching live regimes"}</div>
            <div className="mt-1 text-sm text-zinc-400">{leader7d != null ? `${formatPct(leader7d)} over 7d` : "Artemis baskets + live HL overlay"}</div>
            <div className="mt-4 space-y-2">
              {topFactorNames.map((factor) => (
                <div key={factor.snapshot.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                  <span className="text-sm text-zinc-200">{factor.snapshot.name}</span>
                  <span className={cn("font-mono text-sm", (factor.windows.find((window) => window.days === 7)?.spreadReturn ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(factor.windows.find((window) => window.days === 7)?.spreadReturn ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 xl:min-h-[170px]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Whale Tape</div>
                <div className="mt-2 text-base font-medium text-zinc-100">{whaleHeadline?.headline ?? "Watching rare repeat-whale conviction"}</div>
              </div>
              <Waves className="h-5 w-5 text-teal-300" />
            </div>
            <div className="mt-4 flex gap-2">
              <Link href="/whales" className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100">
                Open Whales <ArrowRight className="h-4 w-4" />
              </Link>
              {whaleHeadline?.address ? (
                <Link href={`/whales/${whaleHeadline.address}`} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100">
                  Latest dossier
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-zinc-800 bg-[#0c1014] p-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
          <div className="flex items-center gap-2 text-zinc-200"><BarChart3 className="h-4 w-4 text-teal-300" /> Markets</div>
          <div className="mt-3 text-sm leading-6 text-zinc-400">Funding, OI, and signal context in one table-first market scanner.</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
          <div className="flex items-center gap-2 text-zinc-200"><BriefcaseBusiness className="h-4 w-4 text-teal-300" /> Portfolio</div>
          <div className="mt-3 text-sm leading-6 text-zinc-400">Review trade quality, positions, and journal data in a calmer workspace.</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
          <div className="flex items-center gap-2 text-zinc-200"><Layers3 className="h-4 w-4 text-teal-300" /> Factors</div>
          <div className="mt-3 text-sm leading-6 text-zinc-400">Track factor leadership and see which regimes are actually driving returns.</div>
        </div>
      </div>
    </div>
  );
}
