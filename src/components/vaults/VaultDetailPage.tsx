"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { VaultMetricsRow } from "./VaultMetricsRow";
import { VaultEquityCurve } from "./VaultEquityCurve";
import { StrategyFingerprintPanel } from "./StrategyFingerprint";
import { OperatorTrackRecord } from "./OperatorTrackRecord";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
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
