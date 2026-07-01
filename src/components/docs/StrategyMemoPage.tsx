"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, RefreshCw } from "lucide-react";
import { cn, formatChartPrice } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type { HighFundingReversalCandidate, HighFundingReversalReport } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type StrategyResponse = {
  report: HighFundingReversalReport;
};

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function statusLabel(status: HighFundingReversalCandidate["status"]) {
  if (status === "eligible") return "Shadow candidate";
  if (status === "funding_not_extreme") return "Funding not extreme";
  if (status === "funding_history_thin") return "Funding history thin";
  if (status === "price_not_extended") return "Price not extended";
  return "Market unavailable";
}

function statusClass(status: HighFundingReversalCandidate["status"]) {
  if (status === "eligible") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "funding_not_extreme") return "border-zinc-700 bg-zinc-900 text-zinc-400";
  if (status === "price_not_extended") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  return "border-zinc-800 bg-zinc-950 text-zinc-500";
}

function Metric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-2 font-mono text-2xl font-semibold",
          tone === "green" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : tone === "red" ? "text-rose-300" : "text-zinc-100",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-zinc-500">{helper}</div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: HighFundingReversalCandidate }) {
  return (
    <tr className="border-b border-zinc-800/80 last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-mono text-sm font-semibold text-zinc-100">{candidate.asset}</div>
        <div className="mt-1 text-[11px] text-zinc-600">{candidate.fundingSampleSize} funding samples</div>
      </td>
      <td className="px-4 py-3">
        <span className={cn("rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]", statusClass(candidate.status))}>
          {statusLabel(candidate.status)}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{candidate.markPx == null ? "n/a" : formatChartPrice(candidate.markPx)}</td>
      <td className={cn("px-4 py-3 font-mono text-xs", (candidate.return24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>
        {formatPct(candidate.return24hPct)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{formatPct(candidate.fundingApr)}</td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{candidate.fundingZ7d == null ? "n/a" : candidate.fundingZ7d.toFixed(2)}</td>
      <td className="px-4 py-3 text-xs leading-5 text-zinc-500">{candidate.reason}</td>
    </tr>
  );
}

export default function StrategyMemoPage() {
  const [report, setReport] = useState<HighFundingReversalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);
      const response = await fetch("/api/strategy/high-funding-reversal", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load strategy scan");
      const payload = (await response.json()) as StrategyResponse;
      setReport(payload.report);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load strategy scan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => report?.candidates ?? [], [report]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-20 md:px-6">
      <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-100">
        <ArrowLeft className="h-4 w-4" /> Back to docs
      </Link>

      <section className="mt-5 overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,224,173,0.14),transparent_30%),#0d1117]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border-b border-zinc-800 p-5 md:p-7 lg:border-b-0 lg:border-r">
            <SectionEyebrow className="text-teal-300">Strategy Lab</SectionEyebrow>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.04em] text-zinc-50 md:text-5xl">High-funding short reversal shadow pilot.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              The quant memo did not approve a live-capital strategy. It found one narrow setup worth forward-testing:
              fade assets that rallied while long funding became abnormally expensive. HyperPulse should use this as a
              frozen shadow pilot, not a trade instruction.
            </p>
          </div>
          <div className="grid gap-3 p-5">
            <Metric label="Status" value="Shadow only" helper="No live-capital approval from the memo." tone="amber" />
            <Metric label="Universe" value={report?.universe.length ? `${report.universe.length} assets` : "8 assets"} helper="BTC, ETH, SOL, HYPE, AAVE, BNB, TAO, ONDO." />
            <Metric label="Current candidates" value={String(report?.eligible.length ?? 0)} helper={report ? `Scanned ${report.candidates.length} symbols.` : "Waiting for scan."} tone={(report?.eligible.length ?? 0) > 0 ? "green" : "neutral"} />
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-[#10151b]">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <SectionEyebrow>Current scan</SectionEyebrow>
                <div className="mt-1 text-sm text-zinc-400">
                  {report ? `Generated ${formatEasternDateTime(report.generatedAt, true)}` : "Funding and price scan for the frozen universe."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 transition hover:border-teal-500/30 hover:text-teal-200"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "")} /> Refresh
              </button>
            </div>

            {error ? (
              <div className="m-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
            ) : loading && !report ? (
              <div className="m-4 h-64 rounded-2xl skeleton" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    <tr>
                      <th className="px-4 py-3">Asset</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Mark</th>
                      <th className="px-4 py-3">24h</th>
                      <th className="px-4 py-3">Funding APR</th>
                      <th className="px-4 py-3">7d z</th>
                      <th className="px-4 py-3">Why</th>
                    </tr>
                  </thead>
                  <tbody>{rows.map((candidate) => <CandidateRow key={candidate.asset} candidate={candidate} />)}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-[#10151b] p-5">
            <SectionEyebrow>Frozen rule</SectionEyebrow>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Metric label="Entry" value="Short only" helper={`Funding z > ${report?.rule.fundingZ7dMin ?? 1}, APR > ${report?.rule.fundingAprMin ?? 25}%, 24h return > ${report?.rule.return24hMin ?? 0.5}%.`} />
              <Metric label="Exit" value="0.8% / 2.0%" helper="Take-profit / stop-loss from entry. Time stop after 8h." />
              <Metric label="Cooldown" value="4h" helper="One open paper trade per asset; do not tune mid-pilot." />
            </div>
          </section>
        </main>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-3xl border border-zinc-800 bg-[#10151b] p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-teal-300" />
              <SectionEyebrow>Memo evidence</SectionEyebrow>
            </div>
            <div className="mt-4 grid gap-3">
              <Metric label="Full sample" value={`${report?.memoEvidence.fullSampleWinRatePct ?? 71.3}%`} helper="115 trades, +3.1 bps avg net, 1.07 PF." />
              <Metric label="Short slice" value={`${report?.memoEvidence.shortSideWinRatePct ?? 82.6}%`} helper="23 trades, +19.5 bps avg net, 1.53 PF." tone="green" />
              <Metric label="Decision" value="Watch forward" helper="Promising but fragile; not capital-ready." tone="amber" />
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-[#10151b] p-5">
            <SectionEyebrow>Pass gates</SectionEyebrow>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
              {(report?.passGates ?? []).map((gate) => (
                <div key={gate} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">{gate}</div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-[#10151b] p-5">
            <SectionEyebrow>Caveats</SectionEyebrow>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-500">
              {(report?.caveats ?? []).map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
