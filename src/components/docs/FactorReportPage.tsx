"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { FactorReport, MarketBriefAsset, MarketBriefPoint } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type FactorReportResponse = {
  report: FactorReport;
};

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function tone(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "text-zinc-500";
  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function SparkLine({ points, positive }: { points: MarketBriefPoint[]; positive: boolean }) {
  const path = useMemo(() => {
    if (points.length === 0) return "";
    const values = points.map((point) => point.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = Math.max(max - min, 0.0001);
    return points
      .map((point, index) => {
        const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100;
        const y = 34 - ((point.value - min) / span) * 30;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <svg viewBox="0 0 100 38" className="h-10 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <line x1="0" y1="34" x2="100" y2="34" stroke="rgba(113,113,122,0.18)" strokeDasharray="3 3" />
      {path ? <path d={path} fill="none" stroke={positive ? "#34d399" : "#fb7185"} strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

function Leaderboard({ assets }: { assets: MarketBriefAsset[] }) {
  const max = Math.max(...assets.map((asset) => Math.abs(asset.returnPct ?? 0)), 1);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0f14]">
      <div className="border-b border-zinc-800 px-4 py-3">
        <SectionEyebrow>Leaderboard</SectionEyebrow>
        <div className="mt-1 text-sm text-zinc-400">Top tracked Hyperliquid perps for the period.</div>
      </div>
      <div className="divide-y divide-zinc-900">
        {assets.map((asset, index) => {
          const value = asset.returnPct ?? 0;
          return (
            <Link key={asset.symbol} href={asset.marketHref} className="grid grid-cols-[34px_92px_minmax(0,1fr)_76px] items-center gap-3 px-4 py-3 text-sm transition hover:bg-zinc-900/70">
              <div className="font-mono text-xs text-zinc-600">#{index + 1}</div>
              <div>
                <div className="font-mono font-semibold text-zinc-100">{asset.symbol}</div>
                <div className="truncate text-[11px] text-zinc-600">{asset.theme}</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-950">
                <div
                  className={cn("h-full rounded-full", value >= 0 ? "bg-emerald-400/70" : "bg-rose-400/70")}
                  style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
                />
              </div>
              <div className={cn("text-right font-mono", tone(value))}>{formatPct(value)}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ThemeCards({ report }: { report: FactorReport }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {report.themes.map((theme) => (
        <article key={theme.id} className="rounded-2xl border border-zinc-800 bg-[#10151b] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-teal-300/80">Theme</div>
          <h3 className="mt-2 text-base font-semibold text-zinc-100">{theme.name}</h3>
          <div className={cn("mt-3 font-mono text-xl font-semibold", tone(theme.averageReturnPct))}>{formatPct(theme.averageReturnPct)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {theme.leaders.map((leader) => (
              <Link key={leader} href={`/markets?asset=${leader}`} className="rounded-full border border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 transition hover:border-teal-500/50 hover:text-teal-100">
                {leader}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">{theme.note}</p>
        </article>
      ))}
    </div>
  );
}

function CatalystCards({ assets }: { assets: MarketBriefAsset[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {assets.map((asset) => (
        <article key={asset.symbol} className="rounded-2xl border border-zinc-800 bg-[#10151b] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={asset.marketHref} className="font-mono text-lg font-semibold text-zinc-100 transition hover:text-teal-200">
                  {asset.symbol}
                </Link>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400">{asset.moveType}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{asset.theme}</div>
            </div>
            <div className={cn("font-mono text-xl font-semibold", tone(asset.returnPct))}>{formatPct(asset.returnPct)}</div>
          </div>

          <div className="mt-3">
            <SparkLine points={asset.series} positive={(asset.returnPct ?? 0) >= 0} />
          </div>

          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
            <p><span className="text-zinc-500">Catalyst: </span>{asset.catalyst}</p>
            <p><span className="text-zinc-500">Why traders cared: </span>{asset.marketInterpretation}</p>
            <p><span className="text-zinc-500">Price-action read: </span>{asset.priceActionRead}</p>
          </div>

          <div className="mt-4 grid gap-2 border-t border-zinc-800 pt-3 text-xs md:grid-cols-3">
            <div>
              <div className="text-zinc-600">vs BTC</div>
              <div className={cn("font-mono", tone(asset.btcRelativePct))}>{formatPct(asset.btcRelativePct)}</div>
            </div>
            <div>
              <div className="text-zinc-600">vs basket</div>
              <div className={cn("font-mono", tone(asset.basketRelativePct))}>{formatPct(asset.basketRelativePct)}</div>
            </div>
            <div>
              <div className="text-zinc-600">Back half</div>
              <div className={cn("font-mono", tone(asset.weekTwoReturnPct))}>{formatPct(asset.weekTwoReturnPct)}</div>
            </div>
          </div>

          {asset.source ? (
            <a href={asset.source.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-teal-200">
              Source: {asset.source.title} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function TelegramPreview({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0f14] p-4">
      <SectionEyebrow>Telegram brief</SectionEyebrow>
      <div className="mt-3 space-y-2 font-mono text-xs leading-5 text-zinc-300">
        {lines.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
}

export default function FactorReportPage() {
  const [report, setReport] = useState<FactorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setError(null);
        const response = await fetch("/api/factors/report");
        if (!response.ok) throw new Error("Unable to load market brief");
        const payload = (await response.json()) as FactorReportResponse;
        if (mounted) setReport(payload.report);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load market brief");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 pb-20">
        <div className="h-56 rounded-2xl skeleton" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-80 rounded-2xl skeleton" />
          <div className="h-80 rounded-2xl skeleton" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back to docs
        </Link>
        <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-100">{error ?? "Market brief unavailable."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 pb-20">
      <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
        <ArrowLeft className="h-4 w-4" /> Back to docs
      </Link>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_30%),#10151b]">
        <div className="grid gap-px bg-zinc-800 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-transparent p-5 md:p-7">
            <SectionEyebrow className="text-teal-300">Biweekly market brief</SectionEyebrow>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
              What actually led on Hyperliquid.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              A compact desk note ranking the strongest tracked perps, grouping the move by theme, and adding source-linked catalyst color where the tape had a clear story.
            </p>
          </div>
          <div className="bg-[#10151b] p-5 md:p-7">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Period</div>
            <div className="mt-2 font-mono text-xl text-zinc-100">{report.periodLabel}</div>
            <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Coverage</div>
            <div className="mt-2 font-mono text-xl text-zinc-100">{report.coverage.trackedAssetCount} HL perps</div>
            <div className="mt-4 text-xs leading-5 text-zinc-500">
              Generated {formatEasternDateTime(report.generatedAt, true)}. {report.coverage.note}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-zinc-800 bg-[#10151b] p-5">
          <SectionEyebrow>Research read</SectionEyebrow>
          <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300">
            {report.summary.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">
            {report.riskNote}
          </div>
        </div>
        <Leaderboard assets={report.leaderboard} />
      </section>

      <ThemeCards report={report} />
      <CatalystCards assets={report.catalystNotes} />
      <TelegramPreview lines={report.telegramSummary} />
    </div>
  );
}
