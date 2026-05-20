"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { FactorReport, MarketBriefAsset } from "@/types";
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

function Leaderboard({ assets, title = "Top winners", description = "Strongest tracked Hyperliquid perps for the period." }: { assets: MarketBriefAsset[]; title?: string; description?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-[#0d1117]">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <SectionEyebrow>{title}</SectionEyebrow>
        <div className="mt-1 text-xs leading-5 text-zinc-500">{description}</div>
      </div>
      <div className="divide-y divide-zinc-800/70">
        {assets.length > 0 ? assets.map((asset, index) => {
          const value = asset.returnPct ?? 0;
          return (
            <Link key={asset.symbol} href={asset.marketHref} className="grid grid-cols-[28px_minmax(0,1fr)_72px] items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-zinc-900/70">
              <div className="font-mono text-xs text-zinc-600">#{index + 1}</div>
              <div>
                <div className="font-mono font-semibold text-zinc-100">{asset.symbol}</div>
                <div className="truncate text-[11px] text-zinc-600">{asset.theme}</div>
              </div>
              <div className={cn("text-right font-mono", tone(value))}>{formatPct(value)}</div>
            </Link>
          );
        }) : (
          <div className="px-4 py-5 text-sm text-zinc-500">No tracked liquid perp finished negative in this window.</div>
        )}
      </div>
    </div>
  );
}

function MoversSummary({ winners, losers }: { winners: MarketBriefAsset[]; losers: MarketBriefAsset[] }) {
  return (
    <div className="space-y-4">
      <Leaderboard assets={winners.slice(0, 5)} />
      <Leaderboard
        assets={losers.slice(0, 5)}
        title="Biggest losers"
        description="Weakest tracked perps; useful for rotation, short-bias, or avoid-list context."
      />
    </div>
  );
}

function ThemeCards({ report }: { report: FactorReport }) {
  return (
    <section className="border-b border-zinc-800/80 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionEyebrow>Theme performance</SectionEyebrow>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">What the tape rewarded</h2>
        </div>
      </div>
      <div className="mt-4 divide-y divide-zinc-800/70 border-y border-zinc-800/70">
      {report.themes.map((theme) => (
        <article key={theme.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_96px] md:items-center">
          <div>
            <div className="text-base font-semibold text-zinc-100">{theme.name}</div>
            <p className="mt-1 text-sm leading-6 text-zinc-500">{theme.note}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {theme.leaders.map((leader) => (
                <Link key={leader} href={`/markets?asset=${leader}`} className="font-mono text-xs text-zinc-400 transition hover:text-teal-200">
                  {leader}
                </Link>
              ))}
            </div>
          </div>
          <div className={cn("font-mono text-lg font-semibold md:text-right", tone(theme.averageReturnPct))}>{formatPct(theme.averageReturnPct)}</div>
        </article>
      ))}
      </div>
    </section>
  );
}

function CatalystCards({ assets }: { assets: MarketBriefAsset[] }) {
  return (
    <section className="border-b border-zinc-800/80 pb-8">
      <SectionEyebrow>Catalyst notes</SectionEyebrow>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Why the leaders moved</h2>
      <div className="mt-2 text-sm leading-6 text-zinc-500">Top winners only. Each note separates the catalyst from the price-action read.</div>
      <div className="mt-3 divide-y divide-zinc-800/70 border-y border-zinc-800/70">
      {assets.map((asset) => (
        <article key={asset.symbol} className="py-5">
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

          <div className="mt-4 space-y-2 text-[15px] leading-7 text-zinc-300">
            <p><span className="text-zinc-500">Catalyst: </span>{asset.catalyst}</p>
            <p><span className="text-zinc-500">Why traders cared: </span>{asset.marketInterpretation}</p>
            <p><span className="text-zinc-500">Price-action read: </span>{asset.priceActionRead}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
            <div>vs BTC <span className={cn("font-mono", tone(asset.btcRelativePct))}>{formatPct(asset.btcRelativePct)}</span></div>
            <div>vs basket <span className={cn("font-mono", tone(asset.basketRelativePct))}>{formatPct(asset.basketRelativePct)}</span></div>
            <div>Back half <span className={cn("font-mono", tone(asset.weekTwoReturnPct))}>{formatPct(asset.weekTwoReturnPct)}</span></div>
          </div>

          {asset.source ? (
            <a href={asset.source.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-teal-200">
              Source: {asset.source.title} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </article>
      ))}
      </div>
    </section>
  );
}

function TelegramPreview({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-[#0d1117] p-4">
      <SectionEyebrow>Telegram brief</SectionEyebrow>
      <div className="mt-3 space-y-2 font-mono text-xs leading-5 text-zinc-300">
        {lines.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
}

function ResearchRead({ summary, riskNote }: { summary: string[]; riskNote: string }) {
  return (
    <section className="border-b border-zinc-800/80 pb-8">
      <SectionEyebrow>Key takeaways</SectionEyebrow>
      <div className="mt-4 divide-y divide-zinc-800/70 border-y border-zinc-800/70">
        {summary.map((line) => {
          const [label, ...rest] = line.split(" — ");
          const body = rest.join(" — ") || line;
          return (
            <div key={line} className="grid gap-2 py-3 text-sm md:grid-cols-[108px_minmax(0,1fr)]">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">{rest.length ? label : "Read"}</div>
              <div className="text-[15px] leading-7 text-zinc-300">{body}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 border-l border-amber-400/40 pl-3 text-xs leading-5 text-amber-100/75">
        {riskNote}
      </div>
    </section>
  );
}

function ArticleHeader({ report }: { report: FactorReport }) {
  return (
    <section className="border-b border-zinc-800/80 pb-8">
      <SectionEyebrow className="text-teal-300">Biweekly market brief</SectionEyebrow>
      <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-zinc-50 md:text-5xl">
        What actually led on Hyperliquid.
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
        A concise desk note ranking the strongest and weakest tracked perps, grouping the move by theme, and adding source-linked catalyst color where the tape had a clear story.
      </p>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
        <span>{report.periodLabel}</span>
        <span>{report.coverage.trackedAssetCount} HL perps</span>
        <span>Generated {formatEasternDateTime(report.generatedAt, true)}</span>
      </div>
    </section>
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
    <div className="mx-auto max-w-6xl px-5 py-8 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back to docs
        </Link>
        <a
          href="/docs/factors/report-card"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1.5 text-xs font-medium text-teal-100 transition hover:border-teal-300/50 hover:bg-teal-400/15"
        >
          Open share card <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-8">
          <ArticleHeader report={report} />
          <ResearchRead summary={report.summary} riskNote={report.riskNote} />
          <ThemeCards report={report} />
          <CatalystCards assets={report.catalystNotes} />
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-zinc-800/80 bg-[#0d1117] p-4">
            <SectionEyebrow>Coverage</SectionEyebrow>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Period</div>
                <div className="mt-1 font-mono text-zinc-100">{report.periodLabel}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Universe</div>
                <div className="mt-1 font-mono text-zinc-100">{report.coverage.trackedAssetCount} perps</div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-zinc-500">{report.coverage.note}</p>
          </div>
          <MoversSummary winners={report.leaderboard} losers={report.losers ?? []} />
          <TelegramPreview lines={report.telegramSummary} />
        </aside>
      </div>
    </div>
  );
}
