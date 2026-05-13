"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { VaultMetricsRow } from "./VaultMetricsRow";
import { VaultEquityCurve } from "./VaultEquityCurve";
import { StrategyFingerprintPanel } from "./StrategyFingerprint";
import { OperatorTrackRecord } from "./OperatorTrackRecord";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatCompact, formatPct } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import type {
  StrategyFingerprint,
  VaultDetails,
  VaultMetrics,
} from "@/types/vaults";
import type { PortfolioStats } from "@/types";

type DetailResponse = {
  vault: VaultDetails;
  metrics: VaultMetrics;
  fingerprint: StrategyFingerprint;
  operator: {
    address: string;
    lookbackDays: number;
    fundingEntryCount: number;
    stats: PortfolioStats;
  };
};

export default function VaultDetailPage({ address }: { address: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(withNetworkParam(`/api/vaults/${address}`));
        if (res.status === 404) {
          if (!cancelledRef?.current) setError("Vault not found.");
          return;
        }
        if (!res.ok) throw new Error(`Vault request failed (${res.status})`);
        const payload = (await res.json()) as DetailResponse;
        if (!cancelledRef?.current) {
          setData(payload);
          setError(null);
        }
      } catch (e) {
        if (!cancelledRef?.current) setError(e instanceof Error ? e.message : "Failed to load vault");
      } finally {
        if (!cancelledRef?.current) setLoading(false);
      }
    },
    [address],
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const handleRefresh = () => {
    load();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-5">
      <Link
        href="/vaults"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to vaults
      </Link>

      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-50"
        >
          <RefreshCcw className="h-3 w-3" />
          {loading ? "Refreshing..." : "Refresh vault"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : !data ? (
        <DetailSkeleton />
      ) : (
        <>
          <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
                  Hyperliquid vault
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
                  {data.vault.name}
                </h1>
                {data.vault.description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    {data.vault.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    Vault <CopyableAddress address={data.vault.vaultAddress} />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Operator <CopyableAddress address={data.vault.leader} />
                  </span>
                  <span>{data.metrics.followerCount} followers</span>
                  {data.vault.isClosed ? <span className="text-amber-400">Closed</span> : null}
                </div>
              </div>
            </div>
          </header>

          <VaultScreeningPanel vault={data.vault} metrics={data.metrics} />

          <VaultMetricsRow metrics={data.metrics} />

          <VaultEquityCurve portfolio={data.vault.portfolio} />

          <StrategyFingerprintPanel fingerprint={data.fingerprint} />

          <OperatorTrackRecord
            address={data.operator.address}
            stats={data.operator.stats}
            lookbackDays={data.operator.lookbackDays}
            fundingEntryCount={data.operator.fundingEntryCount}
          />
        </>
      )}
    </div>
  );
}

function VaultScreeningPanel({ vault, metrics }: { vault: VaultDetails; metrics: VaultMetrics }) {
  const status = vault.isClosed ? "Closed" : vault.allowDeposits ? "Deposits open" : "Deposits disabled";
  const decisionTone = metrics.score.decision === "watch"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : metrics.score.decision === "avoid"
      ? "border-red-500/25 bg-red-500/10 text-red-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-200";
  const confidenceTone = metrics.score.confidence === "high"
    ? "text-emerald-300"
    : metrics.score.confidence === "medium"
      ? "text-sky-300"
      : "text-amber-200";

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/80">Vault screen</div>
          <div className="mt-1 text-sm text-zinc-400">{metrics.score.reason}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em]", decisionTone)}>
            {metrics.score.label} · {metrics.score.score}/100
          </span>
          <span className={cn("font-mono text-xs uppercase", confidenceTone)}>{metrics.score.confidence} confidence</span>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <DueDiligenceTile label="Deposit status" value={status} sub={`${metrics.followerCount} followers`} />
        <DueDiligenceTile label="7D equity Δ" value={metrics.tvlChange7dPct != null ? formatPct(metrics.tvlChange7dPct) : "—"} sub="Includes P&L + capital movement" />
        <DueDiligenceTile label="Risk sample" value={`${metrics.dailyReturnSamples} daily points`} sub={`History ${Math.round(metrics.historyDays)}d`} />
        <DueDiligenceTile label="TVL source" value={formatCompact(metrics.tvl)} sub={tvlSourceCopy(metrics.tvlSource)} />
      </div>
      {metrics.score.flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {metrics.score.flags.map((flag) => (
            <span key={flag} className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DueDiligenceTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/25 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>
    </div>
  );
}

function tvlSourceCopy(source: VaultMetrics["tvlSource"]): string {
  if (source === "account_value") return "Latest account value";
  if (source === "summary_tvl") return "Vault summary fallback";
  if (source === "followers_sum") return "Follower equity fallback";
  return "Unavailable";
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-32 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-[380px] rounded-lg" />
      <div className="skeleton h-48 rounded-lg" />
      <div className="skeleton h-32 rounded-lg" />
    </div>
  );
}
