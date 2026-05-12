"use client";

import { useEffect, useMemo, useState } from "react";
import { VaultFilters, DEFAULT_VAULT_FILTERS, type VaultFilterState } from "./VaultFilters";
import { VaultsTable } from "./VaultsTable";
import { withNetworkParam } from "@/lib/hyperliquid";
import type { VaultListItem } from "@/types/vaults";

const MIN_TVL_FILTER = 100_000;
const MIN_HISTORY_DAYS = 30;
const MIN_SHARPE = 1;

export default function VaultsRoutePage() {
  const [items, setItems] = useState<VaultListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VaultFilterState>(DEFAULT_VAULT_FILTERS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(withNetworkParam("/api/vaults"), { cache: "no-store" });
        if (!res.ok) throw new Error(`Vaults request failed (${res.status})`);
        const data = (await res.json()) as { vaults: VaultListItem[] };
        if (!cancelled) setItems(data.vaults);
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

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : items === null ? (
        <VaultsSkeleton />
      ) : items.length === 0 ? (
        <EmptySeedNotice />
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

function EmptySeedNotice() {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-5 py-6 text-sm text-amber-100/90">
      <div className="font-medium text-amber-200">No vault addresses configured</div>
      <div className="mt-2 text-amber-100/80">
        Hyperliquid does not expose a public &ldquo;list all vaults&rdquo; endpoint, so
        HyperPulse uses a seed list to discover them. Populate{" "}
        <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-xs text-amber-200">
          src/lib/vaultSeed.ts
        </code>{" "}
        with vault addresses from{" "}
        <a
          href="https://app.hyperliquid.xyz/vaults"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-amber-200"
        >
          app.hyperliquid.xyz/vaults
        </a>{" "}
        to populate this table.
      </div>
    </div>
  );
}
