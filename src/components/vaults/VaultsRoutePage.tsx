"use client";

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

  const summary = useMemo(() => {
    const vaults = items ?? [];
    const top = vaults.length > 0
      ? [...vaults].sort((a, b) => b.metrics.score.score - a.metrics.score.score)[0]
      : null;
    const watch = vaults.filter((v) => v.metrics.score.decision === "watch").length;
    const totalTvl = vaults.reduce((sum, v) => sum + v.metrics.tvl, 0);
    return { top, watch, totalTvl };
  }, [items]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 pb-20">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0d10]">
        <header className="border-b border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-400/80">Vaults</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Hyperliquid vault directory</h1>
                <p className="text-xs text-zinc-500">Score, compare, then inspect operator risk before depositing.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-[460px]">
              <SummaryTile label="Tracked" value={items ? String(items.length) : "—"} />
              <SummaryTile label="Watch" value={items ? String(summary.watch) : "—"} tone="green" />
              <SummaryTile label="TVL" value={items ? formatCompact(summary.totalTvl) : "—"} />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 border-t border-zinc-900 pt-3 lg:flex-row lg:items-center lg:justify-between">
            <VaultFilters state={filters} onChange={setFilters} />
            <div className="text-xs text-zinc-500">
              Top score: {summary.top ? <span className="text-zinc-200">{summary.top.name} · {summary.top.metrics.score.score}/100</span> : "loading"}
            </div>
          </div>
        </header>

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
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={tone === "green" ? "mt-1 font-mono text-emerald-300" : "mt-1 font-mono text-zinc-100"}>{value}</div>
    </div>
  );
}

function VaultsSkeleton() {
  return (
    <div className="space-y-px p-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-md" />
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
