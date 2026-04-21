"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatPct, formatUSD } from "@/lib/format";
import type { RoundTripTrade } from "@/types";

type CandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  isPostExit: boolean;
};

type HorizonReview = {
  label: "1h" | "4h" | "24h";
  pctDelta: number | null;
  pnlDelta: number | null;
  close: number | null;
};

type Verdict = {
  label: "Good Exit" | "Could Have Held Longer" | "Mixed Exit";
  tone: "green" | "orange" | "gray";
  detail: string;
};

function formatDuration(ms: number): string {
  const mins = ms / (1000 * 60);
  if (mins < 60) return `${mins.toFixed(0)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

function formatPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (Math.abs(value) >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return value.toPrecision(4);
}

function holdingDelta(trade: RoundTripTrade, futurePrice: number): number {
  return trade.direction === "long"
    ? trade.size * (futurePrice - trade.exitPx)
    : trade.size * (trade.exitPx - futurePrice);
}

function holdingPct(trade: RoundTripTrade, futurePrice: number): number {
  return trade.direction === "long"
    ? ((futurePrice - trade.exitPx) / trade.exitPx) * 100
    : ((trade.exitPx - futurePrice) / trade.exitPx) * 100;
}

function findCloseAtOrAfter(candles: CandleBar[], target: number): number | null {
  for (const candle of candles) {
    if (candle.time >= target) return candle.close;
  }
  return null;
}

function getVerdict(
  trade: RoundTripTrade,
  favorablePct: number,
  adversePct: number,
  review24h: HorizonReview,
): Verdict {
  const outcome24h = review24h.pctDelta;

  if (
    outcome24h != null &&
    outcome24h >= 4 &&
    adversePct > -2.5
  ) {
    return {
      label: "Could Have Held Longer",
      tone: "orange",
      detail:
        trade.direction === "long"
          ? "Price kept trending higher after your exit without much pullback."
          : "Price kept trending lower after your cover without much squeeze.",
    };
  }

  if (
    (outcome24h != null && outcome24h <= -2) ||
    (favorablePct < 1.5 && adversePct <= -2.5)
  ) {
    return {
      label: "Good Exit",
      tone: "green",
      detail:
        trade.direction === "long"
          ? "The market did not reward holding materially longer after you sold."
          : "The market did not reward staying short materially longer after you covered.",
    };
  }

  return {
    label: "Mixed Exit",
    tone: "gray",
    detail:
      "There was some additional movement after exit, but enough two-way volatility that taking profit was still defensible.",
  };
}

interface TradeAnalyzerModalProps {
  trade: RoundTripTrade;
  onClose: () => void;
}

export default function TradeAnalyzerModal({
  trade,
  onClose,
}: TradeAnalyzerModalProps) {
  const marketType = useMemo<"perp" | "spot">(
    () =>
      trade.fills.some((fill) => fill.dir === "Buy" || fill.dir === "Sell")
        ? "spot"
        : "perp",
    [trade.fills],
  );

  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadCandles() {
      setLoading(true);
      setError(null);

      const now = Date.now();
      const preExitWindowMs = Math.min(
        Math.max(trade.duration, 6 * 60 * 60 * 1000),
        24 * 60 * 60 * 1000,
      );
      const postExitWindowMs = 24 * 60 * 60 * 1000;
      const startTime = Math.max(trade.exitTime - preExitWindowMs, trade.entryTime);
      const endTime = Math.min(trade.exitTime + postExitWindowMs, now);

      try {
        const res = await fetch(
          `/api/user/candles?coin=${encodeURIComponent(trade.coin)}&marketType=${marketType}&interval=15m&startTime=${startTime}&endTime=${endTime}`,
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to load candles for this trade.");
        }

        const payload: Array<Record<string, string | number>> = await res.json();
        if (cancelled) return;

        const nextCandles = payload
          .map((c) => {
            const time = Number(c.t ?? c.T ?? c.time);
            const open = Number(c.o ?? c.open);
            const high = Number(c.h ?? c.high);
            const low = Number(c.l ?? c.low);
            const close = Number(c.c ?? c.close);

            return {
              time,
              open,
              high,
              low,
              close,
              isPostExit: time >= trade.exitTime,
            } satisfies CandleBar;
          })
          .filter(
            (c) =>
              Number.isFinite(c.time) &&
              Number.isFinite(c.open) &&
              Number.isFinite(c.high) &&
              Number.isFinite(c.low) &&
              Number.isFinite(c.close),
          )
          .sort((a, b) => a.time - b.time);

        setCandles(nextCandles);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load candles for this trade.");
          setCandles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCandles();
    return () => {
      cancelled = true;
    };
  }, [marketType, trade]);

  const analysis = useMemo(() => {
    if (candles.length === 0) return null;

    const postExitCandles = candles.filter((c) => c.time >= trade.exitTime);
    if (postExitCandles.length === 0) return null;

    const maxHigh = Math.max(...postExitCandles.map((c) => c.high));
    const minLow = Math.min(...postExitCandles.map((c) => c.low));

    const favorablePrice = trade.direction === "long" ? maxHigh : minLow;
    const adversePrice = trade.direction === "long" ? minLow : maxHigh;

    const favorablePct = holdingPct(trade, favorablePrice);
    const adversePct = holdingPct(trade, adversePrice);
    const favorableUsd = holdingDelta(trade, favorablePrice);
    const adverseUsd = holdingDelta(trade, adversePrice);

    const horizons: HorizonReview[] = ([
      ["1h", 60 * 60 * 1000],
      ["4h", 4 * 60 * 60 * 1000],
      ["24h", 24 * 60 * 60 * 1000],
    ] as const).map(([label, offset]) => {
      const close = findCloseAtOrAfter(postExitCandles, trade.exitTime + offset);
      return {
        label,
        close,
        pctDelta: close == null ? null : holdingPct(trade, close),
        pnlDelta: close == null ? null : holdingDelta(trade, close),
      };
    });

    const review24h = horizons[2];
    const verdict = getVerdict(trade, favorablePct, adversePct, review24h);

    const chart = candles.map((c) => ({
      ...c,
      label: new Date(c.time).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    }));

    return {
      favorablePct,
      favorableUsd,
      adversePct,
      adverseUsd,
      horizons,
      verdict,
      chart,
    };
  }, [candles, trade]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-teal-400/80">
                Trade Analyzer
              </div>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-100">
                {trade.coin} {trade.direction === "long" ? "Long" : "Short"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Review whether this exit was well-timed or whether the market kept paying after you got out.
              </p>
              <div className="mt-3 inline-flex rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {marketType === "spot" ? "HIP-3 spot" : "Perp"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Realized P&L" value={formatUSD(trade.pnl)} tone={trade.pnl >= 0 ? "green" : "red"} />
            <MetricCard label="Entry" value={`$${formatPrice(trade.entryPx)}`} />
            <MetricCard label="Exit" value={`$${formatPrice(trade.exitPx)}`} />
            <MetricCard label="Size" value={trade.size.toLocaleString("en-US", { maximumFractionDigits: 4 })} />
            <MetricCard label="Notional" value={formatUSD(trade.notional)} />
            <MetricCard label="Hold Time" value={formatDuration(trade.duration)} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                    Post-Exit Price Path
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Shaded region marks candles after your exit.
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500">
                  Loading trade context...
                </div>
              ) : error ? (
                <div className="flex h-[320px] items-center justify-center text-sm text-red-400">
                  {error}
                </div>
              ) : !analysis ? (
                <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500">
                  Not enough candle data to analyze this trade yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={analysis.chart}>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      tickFormatter={(value) => `$${formatPrice(Number(value))}`}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#09090b",
                        border: "1px solid #27272a",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      labelFormatter={(value) =>
                        new Date(Number(value)).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      }
                      formatter={(value) => [`$${formatPrice(Number(value))}`, "Price"]}
                    />
                    <ReferenceArea
                      x1={trade.exitTime}
                      x2={analysis.chart[analysis.chart.length - 1]?.time}
                      fill="#14b8a6"
                      fillOpacity={0.08}
                    />
                    {trade.entryTime >= analysis.chart[0].time &&
                      trade.entryTime <= analysis.chart[analysis.chart.length - 1].time && (
                        <ReferenceLine
                          x={trade.entryTime}
                          stroke="#71717a"
                          strokeDasharray="4 4"
                          label={{ value: "Entry", position: "top", fill: "#a1a1aa", fontSize: 11 }}
                        />
                      )}
                    <ReferenceLine
                      x={trade.exitTime}
                      stroke="#14b8a6"
                      strokeDasharray="4 4"
                      label={{ value: "Exit", position: "top", fill: "#5eead4", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#e4e4e7"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#14b8a6" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  Exit Verdict
                </div>
                {analysis ? (
                  <>
                    <div
                      className={cn(
                        "mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium",
                        analysis.verdict.tone === "green" && "bg-emerald-500/10 text-emerald-300",
                        analysis.verdict.tone === "orange" && "bg-amber-500/10 text-amber-300",
                        analysis.verdict.tone === "gray" && "bg-zinc-800 text-zinc-300",
                      )}
                    >
                      {analysis.verdict.label}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {analysis.verdict.detail}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">
                    Waiting for candle data to score this exit.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  What Happened After Exit
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  {analysis?.horizons.map((review) => (
                    <HorizonCard key={review.label} review={review} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                Max Favorable Excursion After Exit
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">
                {analysis ? formatPct(analysis.favorablePct) : "n/a"}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                {analysis ? `${formatUSD(analysis.favorableUsd)} more if held to the best post-exit print.` : "Waiting for candle data."}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                Max Adverse Excursion After Exit
              </div>
              <div
                className={cn(
                  "mt-2 text-2xl font-semibold",
                  analysis && analysis.adversePct < 0 ? "text-red-300" : "text-zinc-200",
                )}
              >
                {analysis ? formatPct(analysis.adversePct) : "n/a"}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                {analysis
                  ? analysis.adverseUsd < 0
                    ? `${formatUSD(analysis.adverseUsd)} if you had held through the worst post-exit move.`
                    : `${formatUSD(analysis.adverseUsd)} even at the worst post-exit move.`
                  : "Waiting for candle data."}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-medium text-zinc-100",
          tone === "green" && "text-emerald-300",
          tone === "red" && "text-red-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function HorizonCard({ review }: { review: HorizonReview }) {
  const hasValue = review.pctDelta != null && review.pnlDelta != null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
        Held {review.label} Longer
      </div>
      {hasValue ? (
        <>
          <div
            className={cn(
              "mt-2 text-lg font-semibold",
              review.pctDelta! >= 0 ? "text-emerald-300" : "text-red-300",
            )}
          >
            {formatPct(review.pctDelta!)}
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            {formatUSD(review.pnlDelta!)} vs your actual exit
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-zinc-500">Not enough price data yet.</div>
      )}
    </div>
  );
}
