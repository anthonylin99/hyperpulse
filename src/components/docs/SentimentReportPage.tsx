"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { SentimentAsset, SentimentReport } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type SentimentResponse = {
  report: SentimentReport;
};

function formatPct(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function compactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function confidenceClass(confidence: SentimentAsset["confidence"]) {
  if (confidence === "high") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (confidence === "medium") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-400";
}

function SentimentAssetRow({ asset }: { asset: SentimentAsset }) {
  const isLong = asset.side === "long";
  return (
    <Link
      href={asset.marketHref}
      className={cn(
        "group grid grid-cols-[minmax(0,1fr)_72px] gap-3 rounded-2xl border p-3 transition hover:bg-zinc-900/70",
        isLong ? "border-emerald-400/15 bg-emerald-400/[0.04] hover:border-emerald-300/30" : "border-rose-400/15 bg-rose-400/[0.04] hover:border-rose-300/30",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-semibold text-zinc-100 group-hover:text-teal-100">{asset.symbol}</span>
          <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]", confidenceClass(asset.confidence))}>{asset.confidence}</span>
          <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]", isLong ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>
            {isLong ? "Inferred long" : "Inferred short"}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">{asset.reason}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
          <span>OI {compactUsd(asset.openInterestUsd)}</span>
          <span>Flow {compactUsd(asset.netTakerFlowUsd)}</span>
          <span>Zone {compactUsd(asset.reactionZoneUsd)}</span>
        </div>
      </div>
      <div className={cn("text-right font-mono text-lg font-semibold", isLong ? "text-emerald-300" : "text-rose-300")}>{formatPct(asset.displayPct)}</div>
    </Link>
  );
}

function EmptySentimentState({ side }: { side: "long" | "short" }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-500">
      No clean inferred {side} cluster this week. HyperPulse still includes the aggregate tilt, but hides weak asset-level reads instead of forcing a noisy list.
    </div>
  );
}

export default function SentimentReportPage() {
  const [report, setReport] = useState<SentimentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setError(null);
        const response = await fetch("/api/sentiment/report");
        if (!response.ok) throw new Error("Unable to load sentiment report");
        const payload = (await response.json()) as SentimentResponse;
        if (mounted) setReport(payload.report);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load sentiment report");
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
    if (!report) return "/docs/sentiment/report-card";
    return `/docs/sentiment/report-card?v=${encodeURIComponent(report.id)}-${report.generatedAt}`;
  }, [report]);

  async function copyShareLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/docs/sentiment/report-card`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 pb-20">
        <div className="h-36 rounded-2xl skeleton" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-[720px] rounded-2xl skeleton" />
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
        <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-100">{error ?? "Sentiment report unavailable."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 pb-24 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back to docs
        </Link>
        <div className="flex flex-wrap items-center gap-2">
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
            download="hyperpulse-retail-sentiment.png"
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

      <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,224,173,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,113,133,0.10),transparent_26%),#0d1117]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border-b border-zinc-800 p-5 md:p-7 lg:border-b-0 lg:border-r">
            <SectionEyebrow className="text-teal-300">Weekly sentiment</SectionEyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-zinc-50 md:text-5xl">Hyperliquid public-flow sentiment.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 md:text-base">{report.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">{report.periodLabel}</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">{report.coverage.trackedAssetCount} HL perps</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 font-mono">Generated {formatEasternDateTime(report.generatedAt, true)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-zinc-800 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Total inferred long</div>
              <div className="mt-2 font-mono text-3xl text-emerald-300">{formatPct(report.totalLongPct)}</div>
            </div>
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Total inferred short</div>
              <div className="mt-2 font-mono text-3xl text-rose-300">{formatPct(report.totalShortPct)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 rounded-3xl border border-zinc-800 bg-[#090c11] p-3 md:p-4">
          <div className="mb-3 px-1">
            <SectionEyebrow>Share image</SectionEyebrow>
            <div className="mt-1 text-xs text-zinc-500">Designed for LinkedIn and X: one takeaway, three inferred longs, three inferred shorts.</div>
          </div>
          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-800 bg-black/30 p-2 md:p-4">
            <Image
              src={cardHref}
              alt={`HyperPulse sentiment index report card for ${report.periodLabel}`}
              width={1200}
              height={1200}
              unoptimized
              className="mx-auto block w-full max-w-[900px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40"
            />
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
            <SectionEyebrow>Inferred longs</SectionEyebrow>
            <div className="mt-3 space-y-2">
              {report.topLongs.length > 0 ? report.topLongs.map((asset) => <SentimentAssetRow key={`long-${asset.symbol}`} asset={asset} />) : <EmptySentimentState side="long" />}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
            <SectionEyebrow>Inferred shorts</SectionEyebrow>
            <div className="mt-3 space-y-2">
              {report.topShorts.length > 0 ? report.topShorts.map((asset) => <SentimentAssetRow key={`short-${asset.symbol}`} asset={asset} />) : <EmptySentimentState side="short" />}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4">
            <SectionEyebrow>Methodology</SectionEyebrow>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
              {report.methodology.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d1117] p-4 text-xs leading-5 text-zinc-500">
            <SectionEyebrow>Coverage</SectionEyebrow>
            <p className="mt-3">{report.coverage.note}</p>
            <p className="mt-3">
              Source: {report.coverage.source.replaceAll("_", " ")}
              {report.coverage.stale ? " · low freshness" : ""}
            </p>
            <p className="mt-3 text-zinc-600">Informational only. Not investment advice.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
