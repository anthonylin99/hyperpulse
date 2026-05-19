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
  AgentExecutionIntent,
  AgentIntentResponse,
} from "@/types/agent";

function formatPct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function targetMovePct(intent: AgentExecutionIntent) {
  if (intent.targetPrice == null || intent.entryPrice <= 0) return null;
  const raw = intent.side === "long"
    ? (intent.targetPrice - intent.entryPrice) / intent.entryPrice
    : (intent.entryPrice - intent.targetPrice) / intent.entryPrice;
  return raw * 100;
}

function stopMovePct(intent: AgentExecutionIntent) {
  if (intent.stopPrice == null || intent.entryPrice <= 0) return null;
  const raw = intent.side === "long"
    ? (intent.stopPrice - intent.entryPrice) / intent.entryPrice
    : (intent.entryPrice - intent.stopPrice) / intent.entryPrice;
  return raw * 100;
}

function blockedReason(intent: AgentExecutionIntent) {
  return intent.checks.find((item) => item.status === "block") ?? null;
}

function statusLabel(intent: AgentExecutionIntent) {
  if (intent.status === "paper_open") return "Paper open";
  if (intent.status === "pending_approval") return "Ready";
  if (intent.status === "risk_blocked") return "Blocked";
  if (intent.status === "rejected") return "Rejected";
  if (intent.status === "paper_closed") return "Closed";
  return intent.status;
}

export default function AgentDevPage() {
  const [data, setData] = useState<AgentIntentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
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
      const url = `/api/agent/intents${params.size ? `?${params}` : ""}`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load agent paper intents");
      }
      setData(payload as AgentIntentResponse);
    } catch (loadError) {
      setError(loadError instanceof Error && loadError.name === "AbortError"
        ? "Agent paper intents timed out. Try refresh."
        : loadError instanceof Error ? loadError.message : "Unable to load agent paper intents");
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
    () => data?.intents.filter((item) => item.status === "pending_approval").length ?? 0,
    [data?.intents],
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
              <span className="inline-flex items-center bg-emerald-500/10 px-3 font-medium text-emerald-200">Paper intents</span>
              <span title="Testnet/live execution still requires the private executor worker." className="inline-flex items-center border-l border-zinc-800 px-3 text-zinc-500">
                Live locked
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
          <PolicyMetric label="Ready" value={`${eligibleCount}/${data?.intents.length ?? 0}`} />
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
          <div className="text-xs font-medium text-zinc-200">Paper execution queue</div>
          <div className="text-[11px] text-zinc-500">
            {data?.generatedAt ? formatEasternDateTime(data.generatedAt, true) : "--"}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            <div className="h-16 rounded-lg skeleton" />
            <div className="h-16 rounded-lg skeleton" />
          </div>
        ) : data && data.intents.length > 0 ? (
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
                  <th className="px-2.5 py-1.5 text-right">Status</th>
                  <th className="px-2.5 py-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.intents.map((intent, index) => (
                  <IntentRow
                    key={intent.id}
                    intent={intent}
                    index={index}
                    busy={actionBusy === intent.id}
                    onBusy={setActionBusy}
                    onRefresh={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            {data?.storageConfigured === false
              ? "Agent storage is not configured, so paper intents cannot be persisted yet."
              : "No alerts ready."}
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
  data: AgentIntentResponse;
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

function IntentRow({
  intent,
  index,
  busy,
  onBusy,
  onRefresh,
}: {
  intent: AgentExecutionIntent;
  index: number;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const { addTrade, trades } = useShadowBook();
  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
  const blocked = blockedReason(intent);
  const approved = trades.some(
    (trade) =>
      trade.status === "open" &&
      trade.source === "momentum_alert" &&
      trade.sourceId === intent.sourceId,
  );
  const paperOpen = intent.status === "paper_open" || approved;
  const actionTitle = approved
    ? "Already approved in Shadow Book."
    : blocked?.detail;
  const canApprove =
    intent.status === "pending_approval" &&
    intent.marginUsd != null &&
    intent.leverage != null &&
    intent.stopPrice != null &&
    intent.targetPrice != null &&
    !approved;

  const approve = async () => {
    if (!canApprove) return;
    onBusy(intent.id);
    try {
      const response = await fetch(`/api/agent/intents/${encodeURIComponent(intent.id)}/approve`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Unable to approve paper intent");
      addTrade({
        asset: intent.asset,
        side: intent.side,
        entryPrice: intent.entryPrice,
        marginUsd: intent.marginUsd ?? 100,
        leverage: intent.leverage ?? 3,
        stopPrice: intent.stopPrice,
        targetPrice: intent.targetPrice,
        source: "momentum_alert",
        sourceId: intent.sourceId,
      });
      await onRefresh();
    } finally {
      onBusy(null);
    }
  };

  const reject = async () => {
    if (intent.status !== "pending_approval" && intent.status !== "risk_blocked") return;
    onBusy(intent.id);
    try {
      await fetch(`/api/agent/intents/${encodeURIComponent(intent.id)}/reject`, {
        method: "POST",
      });
      await onRefresh();
    } finally {
      onBusy(null);
    }
  };

  return (
    <tr className={cn("h-8 border-b border-zinc-800/50 text-xs font-mono", rowBg)}>
      <td className="whitespace-nowrap px-2.5 py-0.5">
        <span className="font-medium text-zinc-50">{intent.asset}</span>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2.5 py-0.5 uppercase",
          intent.side === "long" ? "text-emerald-400" : "text-rose-400",
        )}
      >
        {intent.side}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-200">
        {formatChartPrice(intent.entryPrice)}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-emerald-400">
        {formatSignedPct(targetMovePct(intent))}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-rose-400">
        {formatSignedPct(stopMovePct(intent))}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-200">
        {intent.notionalUsd != null ? `$${intent.notionalUsd.toFixed(0)}` : "-"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right text-zinc-300">
        {intent.leverage ? `${intent.leverage}x` : "-"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-sans text-[10px]",
            paperOpen
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : intent.status === "pending_approval"
                ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
                : intent.status === "risk_blocked"
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400",
          )}
        >
          {statusLabel(intent)}
        </span>
      </td>
      <td className="whitespace-nowrap px-2.5 py-0.5 text-right">
        <div className="flex justify-end gap-1">
        <button
          title={actionTitle}
          onClick={() => void approve()}
          disabled={!canApprove || busy}
          className={cn(
            "rounded px-2 py-0.5 font-sans text-[10px] font-medium transition",
            paperOpen
              ? "bg-zinc-800 text-zinc-400"
              : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600",
          )}
        >
          {paperOpen ? "Approved" : intent.status === "pending_approval" ? "Approve" : "Blocked"}
        </button>
        {(intent.status === "pending_approval" || intent.status === "risk_blocked") ? (
          <button
            onClick={() => void reject()}
            disabled={busy}
            className="rounded bg-zinc-900 px-2 py-0.5 font-sans text-[10px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
          >
            Reject
          </button>
        ) : null}
        </div>
      </td>
    </tr>
  );
}
