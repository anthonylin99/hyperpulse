"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
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

function stripSummaryLabel(line: string) {
  const parts = line.split(" — ");
  return parts.length > 1 ? parts.slice(1).join(" — ") : line;
}

function ReportAssetLink({ asset, rank, mode = "winner" }: { asset: MarketBriefAsset; rank: number; mode?: "winner" | "loser" }) {
  return (
    <Link
      href={asset.marketHref}
      className="group grid grid-cols-[28px_minmax(0,1fr)_70px] items-center gap-3 rounded-xl border border-zinc-800/75 bg-zinc-950/50 px-3 py-2 transition hover:border-teal-400/30 hover:bg-teal-400/5"
    >
      <div className="font-mono text-[11px] text-zinc-600">#{rank}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-zinc-100 group-hover:text-teal-100">{asset.symbol}</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", mode === "winner" ? "bg-emerald-300" : "bg-rose-300")} />
        </div>
        <div className="truncate text-[11px] text-zinc-600">{asset.theme}</div>
      </div>
      <div className={cn("text-right font-mono text-sm", tone(asset.returnPct))}>{formatPct(asset.returnPct)}</div>
    </Link>
  );
}

function MiniSummary({ report }: { report: FactorReport }) {
  const bullets = report.summary.slice(0, 3).map(stripSummaryLabel);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
      <SectionEyebrow>Desk read</SectionEyebrow>
      <div className="mt-3 space-y-3">
        {bullets.map((bullet, index) => (
          <div key={bullet} className="flex gap-3 text-sm leading-6 text-zinc-300">
            <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", index === 0 ? "bg-emerald-300" : "bg-cyan-300")} />
            <span>{bullet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FactorReportPage() {
  const [report, setReport] = useState<FactorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const cardHref = useMemo(() => {
    if (!report) return "/docs/factors/report-card";
    return `/docs/factors/report-card?v=${encodeURIComponent(report.id)}-${report.generatedAt}`;
  }, [report]);

  async function copyShareLink() {
    const absolute = `${window.location.origin}/docs/factors/report-card`;
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 pb-20">
        <div className="h-28 rounded-2xl skeleton" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[760px] rounded-2xl skeleton" />
          <div className="h-[420px] rounded-2xl skeleton" />
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

  const topTheme = report.themes[0];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 pb-24 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back to docs
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {expanded ? "Fit view" : "Full size"}
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy PNG link"}
          </button>
          <a
            href={cardHref}
            download="hyperpulse-market-pulse.png"
            className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1.5 text-xs font-medium text-teal-100 transition hover:border-teal-300/50 hover:bg-teal-400/15"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <a
            href={cardHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1.5 text-xs font-medium text-teal-100 transition hover:border-teal-300/50 hover:bg-teal-400/15"
          >
            Open PNG <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,224,173,0.12),transparent_28%),#0d1117]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border-b border-zinc-800 p-5 md:p-7 lg:border-b-0 lg:border-r">
            <SectionEyebrow className="text-teal-300">HyperPulse research</SectionEyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-zinc-50 md:text-5xl">Market Pulse share card</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 md:text-base">
              A share-ready snapshot of what actually led on Hyperliquid: winners, losers, themes, relative strength, and volume confirmation in one card.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">{report.periodLabel}</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">{report.coverage.trackedAssetCount} HL perps</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">Generated {formatEasternDateTime(report.generatedAt, true)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-zinc-800 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Leader</div>
              <div className="mt-2 font-mono text-2xl text-emerald-300">{report.leaderboard[0]?.symbol ?? "n/a"}</div>
              <div className="font-mono text-sm text-zinc-500">{formatPct(report.leaderboard[0]?.returnPct)}</div>
            </div>
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Top theme</div>
              <div className="mt-2 text-lg font-semibold text-cyan-200">{topTheme?.name ?? "n/a"}</div>
              <div className="font-mono text-sm text-zinc-500">{formatPct(topTheme?.averageReturnPct)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 rounded-3xl border border-zinc-800 bg-[#090c11] p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <SectionEyebrow>Share image</SectionEyebrow>
              <div className="mt-1 text-xs text-zinc-500">Scroll inside the frame or switch to full size for export QA.</div>
            </div>
            <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 font-mono text-[11px] text-zinc-500">1200 × 1800 PNG</div>
          </div>
          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-800 bg-black/30 p-2 md:p-4">
            <Image
              src={cardHref}
              alt={`HyperPulse Market Pulse report card for ${report.periodLabel}`}
              width={1200}
              height={1800}
              unoptimized
              className={cn(
                "mx-auto block rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 transition-all",
                expanded ? "w-[1200px] max-w-none" : "w-full max-w-[820px]",
              )}
            />
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <MiniSummary report={report} />
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
            <SectionEyebrow>Top winners</SectionEyebrow>
            <div className="mt-3 space-y-2">
              {report.leaderboard.slice(0, 5).map((asset, index) => (
                <ReportAssetLink key={asset.symbol} asset={asset} rank={index + 1} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
            <SectionEyebrow>Biggest losers</SectionEyebrow>
            <div className="mt-3 space-y-2">
              {report.losers.length > 0 ? report.losers.slice(0, 5).map((asset, index) => (
                <ReportAssetLink key={asset.symbol} asset={asset} rank={index + 1} mode="loser" />
              )) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-4 text-sm text-zinc-500">No tracked liquid perp finished negative in this window.</div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4 text-xs leading-5 text-zinc-500">
            <SectionEyebrow>Source note</SectionEyebrow>
            <p className="mt-3">{report.coverage.note}</p>
            <p className="mt-3 text-zinc-600">Informational only. Not investment advice.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
