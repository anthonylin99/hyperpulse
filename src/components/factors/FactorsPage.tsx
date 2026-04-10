"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFactors } from "@/context/FactorContext";
import { formatPct, formatUSD } from "@/lib/format";
import { cn } from "@/lib/format";
import type {
  FactorAiBrief,
  FactorConstituentPerformance,
  FactorHolding,
  FactorTradeCandidate,
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
  const [brief, setBrief] = useState<FactorAiBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const lastInsightFetchRef = useRef<{ key: string; at: number } | null>(null);

  const insightPayload = useMemo(
    () => ({
      sourceMode,
      factors: factors.slice(0, 5).map((factor) => ({
        name: factor.snapshot.name,
        shortLabel: factor.snapshot.shortLabel,
        reportDate: factor.snapshot.reportDate,
        confidence: factor.confidence,
        stalenessDays: factor.stalenessDays,
        basketCoverage: factor.basketCoverage,
        hyperliquidCoverage: factor.hyperliquidCoverage,
        spread7d: factor.windows.find((window) => window.days === 7)?.spreadReturn ?? null,
        spread30d: factor.windows.find((window) => window.days === 30)?.spreadReturn ?? null,
        narrativeTags: factor.snapshot.narrativeTags,
        tradeCandidates: factor.tradeCandidates.slice(0, 4).map((candidate) => ({
          symbol: candidate.symbol,
          role: candidate.role,
          liveChange24h: candidate.liveChange24h,
          fundingAPR: candidate.fundingAPR,
          signalLabel: candidate.signalLabel,
          trendStatus: candidate.trendStatus,
        })),
      })),
    }),
    [factors, sourceMode],
  );

  const insightPayloadKey = useMemo(
    () =>
      JSON.stringify({
        sourceMode,
        factors: insightPayload.factors.map((factor) => ({
          name: factor.name,
          confidence: factor.confidence,
          spread7d: factor.spread7d == null ? null : Number(factor.spread7d.toFixed(2)),
          spread30d: factor.spread30d == null ? null : Number(factor.spread30d.toFixed(2)),
          tradeCandidates: factor.tradeCandidates.map((candidate) => ({
            symbol: candidate.symbol,
            liveChange24h:
              candidate.liveChange24h == null ? null : Number(candidate.liveChange24h.toFixed(2)),
            fundingAPR:
              candidate.fundingAPR == null ? null : Number(candidate.fundingAPR.toFixed(2)),
          })),
        })),
      }),
    [insightPayload, sourceMode],
  );

  useEffect(() => {
    if (insightPayload.factors.length === 0) {
      setBrief(null);
      setBriefError(null);
      setBriefLoading(false);
      return;
    }

    const now = Date.now();
    const lastFetch = lastInsightFetchRef.current;
    if (lastFetch && lastFetch.key === insightPayloadKey && now - lastFetch.at < 5 * 60 * 1000) {
      return;
    }

    const controller = new AbortController();
    setBriefLoading(true);
    setBriefError(null);
    lastInsightFetchRef.current = { key: insightPayloadKey, at: now };

    void fetch("/api/factors/insights", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(insightPayload),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Unable to load AI factor brief.",
          );
        }
        return body as FactorAiBrief;
      })
      .then((body) => {
        setBrief(body);
        setBriefError(null);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setBriefError(err instanceof Error ? err.message : "Unable to load AI factor brief.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBriefLoading(false);
        }
      });

    return () => controller.abort();
  }, [insightPayload, insightPayloadKey]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/20 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Factors</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
              Artemis factor regimes, translated into Hyperliquid trade context.
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              HyperPulse uses Artemis as the canonical factor research layer, then overlays live Hyperliquid market state so you can see which narratives are working and which names are tradable right now.
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

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {(briefLoading || brief || briefError) && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
                OpenAI Factor Brief
              </div>
              <h2 className="mt-2 text-xl font-semibold text-zinc-100">
                {brief?.headline ?? "Generating a trader-facing factor read..."}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                {brief?.summary ??
                  "This narrative layer translates the deterministic factor rankings into a quick morning brief. The rankings themselves still come from Artemis snapshots plus live Hyperliquid data."}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-500">
              <div>Model</div>
              <div className="mt-1 font-mono text-zinc-200">OpenAI</div>
            </div>
          </div>

          {briefError ? (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {briefError}
            </div>
          ) : briefLoading && !brief ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-28 rounded-xl border border-zinc-800 skeleton" />
              ))}
            </div>
          ) : brief ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {brief.insights.map((insight) => (
                <article
                  key={`${insight.title}-${insight.tickers.join("-")}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                        insight.tone === "bullish"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : insight.tone === "cautious"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-zinc-800 text-zinc-400",
                      )}
                    >
                      {insight.tone}
                    </span>
                    {insight.tickers.length > 0 && (
                      <span className="text-[11px] text-zinc-500">{insight.tickers.join(" • ")}</span>
                    )}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-zinc-100">{insight.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{insight.body}</p>
                </article>
              ))}
            </div>
          ) : null}

          {brief?.disclaimer && (
            <div className="mt-4 text-xs text-zinc-500">{brief.disclaimer}</div>
          )}
        </section>
      )}

      {loading && factors.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-72 rounded-2xl border border-zinc-800 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {factors.map((factor: LiveFactorState) => {
            const windows = Object.fromEntries(
              factor.windows.map((window: FactorPerformanceWindow) => [window.days, window]),
            ) as Record<number, FactorPerformanceWindow>;
            const displayConfidence = downgradeConfidence(
              factor.confidence,
              sourceMode === "snapshot",
            );
            return (
              <article key={factor.snapshot.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Canonical Basket</div>
                    <div className="mt-2 text-sm text-zinc-300">{factor.snapshot.coverageNote}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {factor.snapshot.narrativeTags.map((tag: string) => (
                        <span key={tag} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">
                      Basket coverage {(factor.basketCoverage * 100).toFixed(0)}% • HL coverage {(factor.hyperliquidCoverage * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Hyperliquid-Mapped Names
                    </div>
                    <div className="mt-3 space-y-2">
                      {factor.tradeCandidates.length > 0 ? factor.tradeCandidates.map((candidate: FactorTradeCandidate) => (
                        <div key={candidate.symbol} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2">
                          <div>
                            <div className="text-sm font-medium text-zinc-100">{candidate.symbol}</div>
                            <div className="text-xs text-zinc-500">
                              {candidate.role === "long" ? "Long basket" : "Short basket"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-semibold", (candidate.liveChange24h ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {candidate.liveChange24h == null ? "n/a" : formatPct(candidate.liveChange24h)}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {candidate.signalLabel ?? "Neutral"}
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="text-sm text-zinc-500">No Hyperliquid-mapped names yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Longs</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {factor.snapshot.longs.map((holding: FactorHolding) => (
                        <span key={holding.symbol} className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                          {holding.symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Shorts</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {factor.snapshot.shorts.length > 0 ? factor.snapshot.shorts.map((holding: FactorHolding) => (
                        <span key={holding.symbol} className="rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-300">
                          {holding.symbol}
                        </span>
                      )) : <span className="text-sm text-zinc-500">Long-only factor.</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <a href={factor.snapshot.sourceUrl} target="_blank" rel="noreferrer" className="text-teal-300 hover:text-teal-200">
                    Source: {factor.snapshot.sourceTitle}
                  </a>
                  <div>{factor.unmappedAssets.length > 0 ? `Unmapped: ${factor.unmappedAssets.join(", ")}` : "All displayed names mapped or covered"}</div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                  <div className="text-sm font-medium text-zinc-100">Asset Performance Overlay</div>
                  <div className="text-xs text-zinc-500">
                    Live constituent table showing recent factor performance alongside Hyperliquid context.
                  </div>
                </div>

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
                            {row.latestPrice == null ? "n/a" : formatUSD(row.latestPrice, row.latestPrice < 1 ? 4 : 2)}
                          </td>
                          <td className={cn(row.return1d == null ? "text-zinc-500" : row.return1d >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {row.return1d == null ? "n/a" : formatPct(row.return1d)}
                          </td>
                          <td className={cn(row.return7d == null ? "text-zinc-500" : row.return7d >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {row.return7d == null ? "n/a" : formatPct(row.return7d)}
                          </td>
                          <td className={cn(row.return30d == null ? "text-zinc-500" : row.return30d >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {row.return30d == null ? "n/a" : formatPct(row.return30d)}
                          </td>
                          <td className={cn(row.liveChange24h == null ? "text-zinc-500" : row.liveChange24h >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {row.liveChange24h == null ? "n/a" : formatPct(row.liveChange24h)}
                          </td>
                          <td className={cn(row.fundingAPR == null ? "text-zinc-500" : row.fundingAPR >= 0 ? "text-amber-300" : "text-sky-300")}>
                            {row.fundingAPR == null ? "n/a" : formatPct(row.fundingAPR)}
                          </td>
                          <td className="text-zinc-400">{row.signalLabel ?? "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
