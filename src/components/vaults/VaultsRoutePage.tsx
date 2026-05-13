"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VaultFilters, DEFAULT_VAULT_FILTERS, type VaultFilterState } from "./VaultFilters";
import { VaultsTable } from "./VaultsTable";
import { formatCompact } from "@/lib/format";
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
  const [query, setQuery] = useState("");

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
    const needle = query.trim().toLowerCase();
    return items.filter((v) => {
      if (filters.minTvl && v.metrics.tvl < MIN_TVL_FILTER) return false;
      if (filters.minHistory && v.metrics.historyDays < MIN_HISTORY_DAYS) return false;
      if (filters.sharpePositive) {
        if (v.metrics.sharpe90d == null || v.metrics.sharpe90d < MIN_SHARPE) return false;
      }
      if (needle) {
        const haystack = `${v.name} ${v.vaultAddress} ${v.leader}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [items, filters, query]);

  const summary = useMemo(() => {
    const vaults = items ?? [];
    const totalTvl = vaults.reduce((sum, v) => sum + v.metrics.tvl, 0);
    const protocolTvl = vaults.filter(isProtocolVault).reduce((sum, v) => sum + v.metrics.tvl, 0);
    return { totalTvl, protocolTvl };
  }, [items]);

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 pb-20">
      <header className="relative overflow-hidden rounded-[28px] border border-emerald-500/10 bg-[radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.14),transparent_32%),linear-gradient(135deg,#061f19,#0a0c10_52%)] p-5 md:p-7">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Vaults</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              A compact Hyperliquid vault directory sorted by TVL by default. Use it to shortlist operators, then inspect risk before depositing.
            </p>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3 lg:min-w-[520px]">
            <SummaryTile label="Total value locked" value={items ? formatCompact(summary.totalTvl) : "—"} large />
            <SummaryTile label="Tracked" value={items ? String(items.length) : "—"} />
            <SummaryTile label="Protocol TVL" value={items ? formatCompact(summary.protocolTvl) : "—"} />
          </div>
        </div>
      </header>

      <section className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0d10]">
        <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/70 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-[520px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by vault address, name, or leader..."
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950/80 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/40"
            />
          </div>
          <VaultFilters state={filters} onChange={setFilters} />
        </div>

        {warnings.length > 0 ? (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-100/80">
            Partial refresh: {warnings.slice(0, 2).join(" ")}
          </div>
        ) : null}

        {error ? (
          <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : items === null ? (
          <VaultsSkeleton />
        ) : items.length === 0 ? (
          <EmptyVaultNotice />
        ) : (
          <VaultsTable items={filtered} />
        )}
      </section>
    </div>
  );
}

function isProtocolVault(vault: VaultListItem): boolean {
  const name = vault.name.toLowerCase();
  return name.includes("hyperliquidity provider") || name.includes("liquidator");
}

function SummaryTile({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div className={large ? "rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3 sm:col-span-1" : "rounded-xl border border-zinc-800/80 bg-zinc-950/55 px-4 py-3"}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={large ? "mt-1 font-mono text-2xl text-zinc-50" : "mt-1 font-mono text-zinc-100"}>{value}</div>
    </div>
  );
}

function VaultsSkeleton() {
  return (
    <div className="space-y-px p-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="skeleton h-11 rounded-md" />
      ))}
    </div>
  );
}

function EmptyVaultNotice() {
  return (
    <div className="m-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">
      <div className="font-medium text-zinc-100">No vaults match this view.</div>
      <div className="mt-2 max-w-2xl leading-6">
        Try relaxing filters, or review live vaults on{" "}
        <a
          href="https://app.hyperliquid.xyz/vaults"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-300 underline hover:text-emerald-200"
        >
          Hyperliquid
        </a>.
      </div>
    </div>
  );
}
