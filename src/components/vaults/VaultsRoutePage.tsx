"use client";

import { useEffect, useMemo, useState } from "react";
import { VaultFilters, DEFAULT_VAULT_FILTERS, type VaultFilterState } from "./VaultFilters";
import { VaultsTable } from "./VaultsTable";
import { withNetworkParam } from "@/lib/hyperliquid";
import type { VaultListItem, VaultListResult } from "@/types/vaults";

const MIN_TVL_FILTER = 100_000;
const MIN_HISTORY_DAYS = 30;
const MIN_SHARPE = 1;

export default function VaultsRoutePage() {
  const [items, setItems] = useState<VaultListItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VaultFilterState>(DEFAULT_VAULT_FILTERS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(withNetworkParam("/api/vaults"));
        if (!res.ok) throw new Error(`Vaults request failed (${res.status})`);
        const data = (await res.json()) as VaultListResult;
        if (!cancelled) {
          setItems(data.vaults);
          setWarnings(data.warnings ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load vaults");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((v) => {
      if (filters.minTvl && v.metrics.tvl < MIN_TVL_FILTER) return false;
      if (filters.minHistory && v.metrics.historyDays < MIN_HISTORY_DAYS) return false;
      if (filters.sharpePositive) {
        if (v.metrics.sharpe90d == null || v.metrics.sharpe90d < MIN_SHARPE) return false;
      }
      return true;
    });
  }, [items, filters]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/30 p-6 md:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
            HyperPulse Vaults
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
            Rank Hyperliquid vaults by risk-adjusted return, not headline APY.
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-300">
            Every vault is scored on Sharpe, drawdown, and the operator&apos;s personal
            track record. Click a vault to inspect its equity curve, strategy
            fingerprint, and whether the manager is worth trusting with your capital.
          </p>
        </div>
      </header>

      <VaultFilters state={filters} onChange={setFilters} />

      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/80">
          Vault list is partially refreshed. {warnings.slice(0, 2).join(" ")}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : items === null ? (
        <VaultsSkeleton />
      ) : items.length === 0 ? (
        <EmptyVaultNotice />
      ) : (
        <VaultsTable items={filtered} />
      )}
    </div>
  );
}

function VaultsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-14 rounded-lg" />
      ))}
    </div>
  );
}

function EmptyVaultNotice() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">
      <div className="font-medium text-zinc-100">No vaults available in this preview yet.</div>
      <div className="mt-2 max-w-2xl leading-6">
        HyperPulse only shows vaults after they pass the curated preview list or
        Hyperliquid&apos;s recent vault summary feed. Check back shortly, or review
        live vaults on{" "}
        <a
          href="https://app.hyperliquid.xyz/vaults"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-300 underline hover:text-emerald-200"
        >
          Hyperliquid
        </a>{" "}
        while this feature is in private testing.
      </div>
    </div>
  );
}
