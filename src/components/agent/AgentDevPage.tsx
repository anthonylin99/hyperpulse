"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useShadowBook } from "@/context/ShadowBookContext";
import { cn, formatChartPrice } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";
import type {
  AgentRecommendation,
  AgentRecommendationsResponse,
} from "@/types/agent";

function formatPct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function targetMovePct(recommendation: AgentRecommendation) {
  const { signal } = recommendation;
  if (signal.targetPrice == null || signal.entryPrice <= 0) return null;
  const raw = signal.side === "long"
    ? (signal.targetPrice - signal.entryPrice) / signal.entryPrice
    : (signal.entryPrice - signal.targetPrice) / signal.entryPrice;
  return raw * 100;
}

function stopMovePct(recommendation: AgentRecommendation) {
  const { signal } = recommendation;
  if (signal.stopPrice == null || signal.entryPrice <= 0) return null;
  const raw = signal.side === "long"
    ? (signal.stopPrice - signal.entryPrice) / signal.entryPrice
    : (signal.entryPrice - signal.stopPrice) / signal.entryPrice;
  return raw * 100;
}

function blockedReason(recommendation: AgentRecommendation) {
  return recommendation.checks.find((item) => item.status === "block") ?? null;
}

export default function AgentDevPage() {
  const [data, setData] = useState<AgentRecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUniverse, setExpandedUniverse] = useState(false);

  const load = async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      setError(null);
      const params = new URLSearchParams();
      if (expandedUniverse) params.set("allowAllAssets", "true");
      const url = `/api/agent/dev/recommendations${params.size ? `?${params}` : ""}`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load agent recommendations");
      }
      setData(payload as AgentRecommendationsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error && loadError.name === "AbortError"
        ? "Agent recommendations timed out. Try refresh."
        : loadError instanceof Error ? loadError.message : "Unable to load agent recommendations");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedUniverse]);

  const eligibleCount = useMemo(
    () => data?.recommendations.filter((item) => item.eligible).length ?? 0,
    [data?.recommendations],
  );

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1217]">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Agent
            </div>
            <span className="rounded-md border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">dev</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-8 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 text-xs">
              <span className="inline-flex items-center bg-emerald-500/10 px-3 font-medium text-emerald-200">Approve</span>
              <span title="Auto execution needs the testnet/live execution worker." className="inline-flex items-center border-l border-zinc-800 px-3 text-zinc-500">
                Auto locked
              </span>
            </div>
            <label className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={expandedUniverse}
                onChange={(event) => setExpandedUniverse(event.target.checked)}
                className="accent-teal-400"
              />
              All assets
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 text-xs text-zinc-300 transition hover:border-teal-500/30 hover:text-teal-100 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-800 md:grid-cols-4">
          <PolicyMetric label="Ready" value={`${eligibleCount}/${data?.recommendations.length ?? 0}`} />
          <PolicyMetric label="Alloc" value={data ? formatPct(data.policy.maxPositionNotionalPctEquity) : "5.00%"} />
          <PolicyMetric label="Max lev" value={`${data?.policy.maxLeverage ?? 3}x`} />
          <PolicyMetric label="Daily stop" value={data ? formatPct(data.policy.dailyLossLimitPctEquity) : "2.00%"} />
        </div>
      </section>

      {data ? <RiskPolicyPanel data={data} expandedUniverse={expandedUniverse} /> : null}

      {error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0b0f14]">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-200">Trade queue</div>
          <div className="text-[11px] text-zinc-500">
            {data?.generatedAt ? formatEasternDateTime(data.generatedAt, true) : "--"}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            <div className="h-16 rounded-lg skeleton" />
            <div className="h-16 rounded-lg skeleton" />
          </div>
        ) : data && data.recommendations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="bg-zinc-950">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-2.5 py-1.5 text-left">Asset</th>
                  <th className="px-2.5 py-1.5 text-left">Side</th>
                  <th className="px-2.5 py-1.5 text-right">Entry</th>
                  <th className="px-2.5 py-1.5 text-right">TP</th>
                  <th className="px-2.5 py-1.5 text-right">SL</th>
                  <th className="px-2.5 py-1.5 text-right">Alloc</th>
                  <th className="px-2.5 py-1.5 text-right">Lev</th>
                  <th className="px-2.5 py-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recommendations.map((recommendation, index) => (
                  <RecommendationRow
                    key={recommendation.id}
                    recommendation={recommendation}
                    index={index}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            No alerts ready.
          </div>
        )}
      </section>
    </div>
  );
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#10151b] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-zinc-50">{value}</div>
    </div>
  );
}

function RiskPolicyPanel({
  data,
  expandedUniverse,
}: {
  data: AgentRecommendationsResponse;
  expandedUniverse: boolean;
}) {
  const policy = data.policy;
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Allocation {formatPct(policy.maxPositionNotionalPctEquity)} each</span>
        <span>Cooldown {policy.tradeCooldownMinutes}m</span>
        <span>{policy.maxTradesPerDay}/day</span>
        <span>{expandedUniverse ? `${policy.allowedAssets.length} assets` : policy.allowedAssets.join(", ")}</span>
      </div>
    </section>
  );
}

function RecommendationRow({
  recommendation,
  index,
}: {
  recommendation: AgentRecommendation;
  index: number;
}) {
  const { addTrade, trades } = useShadowBook();
  const order = recommendation.proposedOrder;
  const signal = recommendation.signal;
  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
  const blocked = blockedReason(recommendation);
  const approved = trades.some(
    (trade) =>
      trade.status === "open" &&
      trade.source === "momentum_alert" &&
      trade.sourceId === signal.sourceId,
  );
  const actionTitle = approved
    ? "Already approved in Shadow Book."
    : blocked?.detail;
  const canApprove = order != null && recommendation.eligible && !approved;

  return (
    <tr className={cn("h-8 border-b border-zinc-800/50 text-xs font-mono", rowBg)}>
      <td className="whitespace-nowrap px-2.5 py-0.5">
        <span className="font-medium text-zinc-50">{signal.asset}</span>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2.5 py-0.5 uppercase",
          signal.side === "long" ? "text-emerald-400" : "text-rose-400",
        )}
      >
        {signal.side}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-200">
        {formatChartPrice(signal.entryPrice)}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-emerald-400">
        {formatSignedPct(targetMovePct(recommendation))}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-rose-400">
        {formatSignedPct(stopMovePct(recommendation))}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-200">
        {formatPct(recommendation.policySnapshot.maxPositionNotionalPctEquity)}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-300">
        {order ? `${order.leverage}x` : "-"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right">
        <button
          title={actionTitle}
          onClick={() => {
            if (!canApprove || !order) return;
            addTrade({
              asset: order.asset,
              side: order.side,
              entryPrice: order.entryPrice,
              marginUsd: order.marginUsd,
              leverage: order.leverage,
              stopPrice: order.stopPrice,
              targetPrice: order.targetPrice,
              source: "momentum_alert",
              sourceId: signal.sourceId,
            });
          }}
          disabled={!canApprove}
          className={cn(
            "rounded px-2 py-0.5 font-sans text-[10px] font-medium transition",
            approved
              ? "bg-zinc-800 text-zinc-400"
              : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600",
          )}
        >
          {approved ? "Approved" : recommendation.eligible ? "Approve" : "Blocked"}
        </button>
      </td>
    </tr>
  );
}
