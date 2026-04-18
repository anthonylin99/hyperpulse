"use client";

import { useMemo, useState } from "react";
import { useFactors } from "@/context/FactorContext";
import { formatPct, formatUSD } from "@/lib/format";
import { cn } from "@/lib/format";
import type {
  FactorConstituentPerformance,
  FactorContributor,
  FactorHolding,
  FactorPerformanceWindow,
  LiveFactorState,
} from "@/types";

function WindowPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm font-semibold",
          value == null ? "text-zinc-500" : value >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        {value == null ? "n/a" : formatPct(value)}
      </div>
    </div>
  );
}

function downgradeConfidence(
  confidence: LiveFactorState["confidence"],
  hasCachedWarning: boolean,
): LiveFactorState["confidence"] {
  if (!hasCachedWarning) return confidence;
  if (confidence === "high") return "medium";
  if (confidence === "medium") return "low";
  return confidence;
}

function confidenceClasses(confidence: LiveFactorState["confidence"]) {
  if (confidence === "high") {
    return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
  }
  if (confidence === "medium") {
    return "bg-amber-500/15 text-amber-300 border border-amber-500/20";
  }
  return "bg-zinc-800 text-zinc-400 border border-zinc-700";
}

export default function FactorsPage() {
  const { factors, loading, error, sourceMode, lastUpdated } = useFactors();
  const [selectedWindow, setSelectedWindow] = useState<1 | 7 | 30>(7);
  const [expandedFactors, setExpandedFactors] = useState<Record<string, boolean>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const getWindowSpread = (factor: LiveFactorState, days: 1 | 7 | 30) =>
    factor.windows.find((window) => window.days === days)?.spreadReturn ?? null;

  const toggleExpanded = (factorId: string) => {
    setExpandedTables((current) => ({
      ...current,
      [factorId]: !current[factorId],
    }));
  };

  const toggleFactorDetails = (factorId: string) => {
    setExpandedFactors((current) => ({
      ...current,
      [factorId]: !current[factorId],
    }));
  };

  const sortedFactors = useMemo(() => {
    return [...factors].sort((a, b) => {
      const aSpread = getWindowSpread(a, selectedWindow);
      const bSpread = getWindowSpread(b, selectedWindow);
      if (aSpread == null && bSpread == null) return 0;
      if (aSpread == null) return 1;
      if (bSpread == null) return -1;
      return bSpread - aSpread;
    });
  }, [factors, selectedWindow]);

  const factorSummary = useMemo(() => {
    if (factors.length === 0) return null;

    const spreads = factors
      .map((factor) => getWindowSpread(factor, selectedWindow))
      .filter((value): value is number => value != null);
    const leader = sortedFactors[0] ?? null;
    const laggard = sortedFactors[sortedFactors.length - 1] ?? null;
    const averageSpread =
      spreads.length > 0 ? spreads.reduce((sum, value) => sum + value, 0) / spreads.length : null;
    const advancing = spreads.filter((value) => value > 0).length;
    const weakening = spreads.filter((value) => value <= 0).length;
    const leaderSpread = leader ? getWindowSpread(leader, selectedWindow) : null;
    const laggardSpread = laggard ? getWindowSpread(laggard, selectedWindow) : null;

    return {
      averageSpread,
      advancing,
      weakening,
      leader,
      laggard,
      leaderSpread,
      laggardSpread,
    };
  }, [factors, selectedWindow, sortedFactors]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/20 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Factors</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
              Track which Artemis factors are actually leading right now.
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              HyperPulse treats Artemis as the canonical factor layer, then keeps a live scorecard of which baskets are outperforming, which are weakening, and which constituents are driving the move.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                Last Refresh
              </div>
              <div className="mt-2 text-sm font-medium text-zinc-100">
                {lastUpdated
                  ? lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                  : "--:--"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                Data Mode
              </div>
              <div className="mt-2 text-sm font-medium text-zinc-100">
                {sourceMode === "snapshot" ? "Artemis snapshot + live HL" : "Live Artemis + live HL"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {factorSummary && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
                Factor Takeaway
              </div>
              <h2 className="mt-2 text-xl font-semibold text-zinc-100">
                Rank every factor by the window that matters to you.
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Use this as the fast read, then expand any factor only when you want constituent detail.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { label: "1d", value: 1 },
                { label: "7d", value: 7 },
                { label: "30d", value: 30 },
              ] as const).map((window) => (
                <button
                  key={window.value}
                  onClick={() => setSelectedWindow(window.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm transition-colors",
                    selectedWindow === window.value
                      ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
                      : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  Rank by {window.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Best Performer
              </div>
              <div className="mt-2 text-base font-semibold text-zinc-100">
                {factorSummary.leader?.snapshot.name ?? "n/a"}
              </div>
              <div className="mt-1 text-sm text-emerald-400">
                {factorSummary.leaderSpread == null ? "n/a" : formatPct(factorSummary.leaderSpread)}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Weakest Performer
              </div>
              <div className="mt-2 text-base font-semibold text-zinc-100">
                {factorSummary.laggard?.snapshot.name ?? "n/a"}
              </div>
              <div className="mt-1 text-sm text-red-400">
                {factorSummary.laggardSpread == null ? "n/a" : formatPct(factorSummary.laggardSpread)}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Avg Spread
              </div>
              <div className={cn("mt-2 text-base font-semibold", factorSummary.averageSpread == null ? "text-zinc-500" : factorSummary.averageSpread >= 0 ? "text-emerald-400" : "text-red-400")}>
                {factorSummary.averageSpread == null ? "n/a" : formatPct(factorSummary.averageSpread)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{selectedWindow}d window</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Breadth
              </div>
              <div className="mt-2 text-base font-semibold text-zinc-100">
                {factorSummary.advancing} up / {factorSummary.weakening} down
              </div>
              <div className="mt-1 text-xs text-zinc-500">Across tracked factors</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedFactors.map((factor, index) => {
              const activeSpread = getWindowSpread(factor, selectedWindow);
              return (
                <div
                  key={`summary-${factor.snapshot.id}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      #{index + 1} · {factor.snapshot.shortLabel}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        activeSpread == null
                          ? "text-zinc-500"
                          : activeSpread >= 0
                            ? "text-emerald-400"
                            : "text-red-400",
                      )}
                    >
                      {activeSpread == null ? "n/a" : formatPct(activeSpread)}
                    </div>
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-100">
                    {factor.snapshot.name}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{selectedWindow}d spread</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading && factors.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-72 rounded-2xl border border-zinc-800 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedFactors.map((factor: LiveFactorState, index) => {
            const windows = Object.fromEntries(
              factor.windows.map((window: FactorPerformanceWindow) => [window.days, window]),
            ) as Record<number, FactorPerformanceWindow>;
            const displayConfidence = downgradeConfidence(
              factor.confidence,
              sourceMode === "snapshot",
            );
            const topContributor = factor.topContributors[0] ?? null;
            const topDetractor = factor.topDetractors[0] ?? null;
            const activeSpread = getWindowSpread(factor, selectedWindow);
            const isFactorExpanded = expandedFactors[factor.snapshot.id] ?? false;
            const isExpanded = expandedTables[factor.snapshot.id] ?? false;
            return (
              <article key={factor.snapshot.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                        #{index + 1}
                      </span>
                      <h2 className="text-xl font-semibold text-zinc-100">{factor.snapshot.name}</h2>
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                        {factor.snapshot.shortLabel}
                      </span>
                      <span
                        className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", confidenceClasses(displayConfidence))}
                      >
                        {displayConfidence} confidence
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{factor.snapshot.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-full sm:max-w-[260px] xl:w-[260px]">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Report Date</div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">{factor.snapshot.reportDate}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Snapshot Age</div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">{factor.stalenessDays}d old</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <WindowPill label="1d Spread" value={windows[1]?.spreadReturn ?? null} />
                  <WindowPill label="7d Spread" value={windows[7]?.spreadReturn ?? null} />
                  <WindowPill label="30d Spread" value={windows[30]?.spreadReturn ?? null} />
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Current Rank
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">
                        #{index + 1} by {selectedWindow}d spread
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Selected Window
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-sm font-medium",
                          activeSpread == null
                            ? "text-zinc-500"
                            : activeSpread >= 0
                              ? "text-emerald-400"
                              : "text-red-400",
                        )}
                      >
                        {activeSpread == null ? "n/a" : formatPct(activeSpread)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Quick Read
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">
                        {topContributor?.symbol ?? topDetractor?.symbol ?? "Waiting on constituent data"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFactorDetails(factor.snapshot.id)}
                    className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                  >
                    {isFactorExpanded ? "Hide Details" : "Expand Details"}
                  </button>
                </div>

                {!isFactorExpanded && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <PerformanceDriverCard
                      title="Strongest Contributor"
                      contributor={topContributor}
                      positive
                    />
                    <PerformanceDriverCard
                      title="Weakest Contributor"
                      contributor={topDetractor}
                      positive={false}
                    />
                  </div>
                )}

                {isFactorExpanded && (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          Canonical Basket
                        </div>
                        <div className="mt-2 text-sm text-zinc-300">{factor.snapshot.coverageNote}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {factor.snapshot.narrativeTags.map((tag: string) => (
                            <span
                              key={tag}
                              className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 text-xs text-zinc-500">
                          Basket coverage {(factor.basketCoverage * 100).toFixed(0)}% • HL coverage{" "}
                          {(factor.hyperliquidCoverage * 100).toFixed(0)}%
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          Hyperliquid-Mapped Names
                        </div>
                        <div className="mt-3 space-y-2">
                          {factor.tradeCandidates.length > 0 ? (
                            factor.tradeCandidates.map((candidate) => (
                              <div
                                key={candidate.symbol}
                                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2"
                              >
                                <div>
                                  <div className="text-sm font-medium text-zinc-100">{candidate.symbol}</div>
                                  <div className="text-xs text-zinc-500">
                                    {candidate.role === "long" ? "Long basket" : "Short basket"}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div
                                    className={cn(
                                      "text-sm font-semibold",
                                      candidate.liveChange24h == null
                                        ? "text-zinc-500"
                                        : candidate.liveChange24h >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400",
                                    )}
                                  >
                                    {candidate.liveChange24h == null
                                      ? "n/a"
                                      : formatPct(candidate.liveChange24h)}
                                  </div>
                                  <div className="text-[11px] text-zinc-500">
                                    {candidate.fundingAPR == null
                                      ? "Funding n/a"
                                      : `Funding ${formatPct(candidate.fundingAPR)}`}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-zinc-500">No Hyperliquid-mapped names yet.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <PerformanceDriverCard
                        title="Strongest Contributor"
                        contributor={topContributor}
                        positive
                      />
                      <PerformanceDriverCard
                        title="Weakest Contributor"
                        contributor={topDetractor}
                        positive={false}
                      />
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Longs</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {factor.snapshot.longs.map((holding: FactorHolding) => (
                            <span
                              key={holding.symbol}
                              className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"
                            >
                              {holding.symbol}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Shorts</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {factor.snapshot.shorts.length > 0 ? (
                            factor.snapshot.shorts.map((holding: FactorHolding) => (
                              <span
                                key={holding.symbol}
                                className="rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-300"
                              >
                                {holding.symbol}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-zinc-500">Long-only factor.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                      <a
                        href={factor.snapshot.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-300 hover:text-teal-200"
                      >
                        Source: {factor.snapshot.sourceTitle}
                      </a>
                      <div>
                        {factor.unmappedAssets.length > 0
                          ? `Unmapped: ${factor.unmappedAssets.join(", ")}`
                          : "All displayed names mapped or covered"}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium text-zinc-100">Asset Performance Table</div>
                          <div className="text-xs text-zinc-500">
                            Constituent-level performance stays hidden until you want the full breakdown.
                          </div>
                        </div>
                        <button
                          onClick={() => toggleExpanded(factor.snapshot.id)}
                          className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                        >
                          {isExpanded ? "Hide Asset Table" : "View Asset Table"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
                        <table className="w-full text-xs">
                          <thead className="bg-zinc-950/80 text-zinc-500">
                            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                              <th>Asset</th>
                              <th>Role</th>
                              <th>Latest</th>
                              <th>1d</th>
                              <th>7d</th>
                              <th>30d</th>
                              <th>Live 24h</th>
                              <th>Funding APR</th>
                              <th>Signal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {factor.constituents.map((row: FactorConstituentPerformance) => (
                              <tr
                                key={`${factor.snapshot.id}-${row.symbol}-${row.role}`}
                                className="border-t border-zinc-800 bg-zinc-950/40 [&>td]:px-3 [&>td]:py-2"
                              >
                                <td className="font-medium text-zinc-100">
                                  <div className="flex items-center gap-2">
                                    <span>{row.symbol}</span>
                                    {!row.mappedToHyperliquid && (
                                      <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">
                                        no HL
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px]",
                                      row.role === "long"
                                        ? "bg-emerald-500/10 text-emerald-300"
                                        : "bg-red-500/10 text-red-300",
                                    )}
                                  >
                                    {row.role}
                                  </span>
                                </td>
                                <td className="text-zinc-300">
                                  {row.latestPrice == null
                                    ? "n/a"
                                    : formatUSD(row.latestPrice, row.latestPrice < 1 ? 4 : 2)}
                                </td>
                                <td
                                  className={cn(
                                    row.return1d == null
                                      ? "text-zinc-500"
                                      : row.return1d >= 0
                                        ? "text-emerald-400"
                                        : "text-red-400",
                                  )}
                                >
                                  {row.return1d == null ? "n/a" : formatPct(row.return1d)}
                                </td>
                                <td
                                  className={cn(
                                    row.return7d == null
                                      ? "text-zinc-500"
                                      : row.return7d >= 0
                                        ? "text-emerald-400"
                                        : "text-red-400",
                                  )}
                                >
                                  {row.return7d == null ? "n/a" : formatPct(row.return7d)}
                                </td>
                                <td
                                  className={cn(
                                    row.return30d == null
                                      ? "text-zinc-500"
                                      : row.return30d >= 0
                                        ? "text-emerald-400"
                                        : "text-red-400",
                                  )}
                                >
                                  {row.return30d == null ? "n/a" : formatPct(row.return30d)}
                                </td>
                                <td
                                  className={cn(
                                    row.liveChange24h == null
                                      ? "text-zinc-500"
                                      : row.liveChange24h >= 0
                                        ? "text-emerald-400"
                                        : "text-red-400",
                                  )}
                                >
                                  {row.liveChange24h == null ? "n/a" : formatPct(row.liveChange24h)}
                                </td>
                                <td
                                  className={cn(
                                    row.fundingAPR == null
                                      ? "text-zinc-500"
                                      : row.fundingAPR >= 0
                                        ? "text-amber-300"
                                        : "text-sky-300",
                                  )}
                                >
                                  {row.fundingAPR == null ? "n/a" : formatPct(row.fundingAPR)}
                                </td>
                                <td className="text-zinc-400">{row.signalLabel ?? "n/a"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
	              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PerformanceDriverCard({
  title,
  contributor,
  positive,
}: {
  title: string;
  contributor: FactorContributor | null;
  positive: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      {contributor ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-zinc-100">{contributor.symbol}</div>
              <div className="text-xs text-zinc-500">
                {contributor.role === "long" ? "Long basket" : "Short basket"}
              </div>
            </div>
            <div
              className={cn(
                "text-sm font-semibold",
                positive ? "text-emerald-400" : "text-red-400",
              )}
            >
              {formatPct(contributor.returnPct)}
            </div>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Contribution: {formatPct(contributor.contributionPct)} •{" "}
            {contributor.liveChange24h == null
              ? "Live 24h n/a"
              : `Live 24h ${formatPct(contributor.liveChange24h)}`}
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-zinc-500">Not enough constituent data yet.</div>
      )}
    </div>
  );
}
