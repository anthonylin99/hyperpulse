"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatCompact, formatPct } from "@/lib/format";
import type { VaultListItem } from "@/types/vaults";

type SortKey = "name" | "leader" | "apr" | "tvl" | "return30d" | "drawdown" | "age" | "quality";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "name", label: "Vault", align: "left" },
  { key: "leader", label: "Leader", align: "left" },
  { key: "apr", label: "APR", align: "right" },
  { key: "tvl", label: "TVL", align: "right" },
  { key: "return30d", label: "30D P&L", align: "right" },
  { key: "drawdown", label: "DD", align: "right" },
  { key: "age", label: "Age", align: "right" },
  { key: "quality", label: "Quality", align: "right" },
];

function isProtocolVault(vault: VaultListItem): boolean {
  const name = vault.name.toLowerCase();
  return name.includes("hyperliquidity provider") || name.includes("liquidator");
}

function confidenceRank(item: VaultListItem): number {
  return item.metrics.score.confidence === "high" ? 3 : item.metrics.score.confidence === "medium" ? 2 : 1;
}

function sortValue(item: VaultListItem, key: SortKey): number | string {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "leader":
      return item.leader.toLowerCase();
    case "apr":
      return item.apr ?? Number.NEGATIVE_INFINITY;
    case "tvl":
      return item.metrics.tvl;
    case "return30d":
      return item.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
    case "drawdown":
      return item.metrics.maxDrawdownPct ?? Number.POSITIVE_INFINITY;
    case "age":
      return item.metrics.historyDays;
    case "quality":
      return confidenceRank(item) * 1000 + item.metrics.dailyReturnSamples;
  }
}

export function VaultsTable({ items }: { items: VaultListItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...items];
    out.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      if (sortKey === "drawdown") cmp = -cmp;
      if (cmp === 0) cmp = a.metrics.tvl - b.metrics.tvl;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [items, sortKey, sortDir]);

  const protocolVaults = sorted.filter(isProtocolVault);
  const userVaults = sorted.filter((item) => !isProtocolVault(item));

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "leader" || key === "drawdown" ? "asc" : "desc");
    }
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b border-zinc-800 bg-[#10141a]">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "cursor-pointer select-none px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1", col.align === "right" && "justify-end")}>
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Snapshot</th>
              <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Action</th>
            </tr>
          </thead>
          <tbody>
            <SectionRows title="Protocol vaults" items={protocolVaults} />
            <SectionRows title="User vaults" items={userVaults} />
            {sorted.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-zinc-500" colSpan={COLUMNS.length + 2}>No vaults match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-3 md:hidden">
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">No vaults match the current filters.</div>
        ) : (
          sorted.map((item) => <MobileVaultCard key={item.vaultAddress} item={item} />)
        )}
      </div>
    </>
  );
}

function SectionRows({ title, items }: { title: string; items: VaultListItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={10} className="border-y border-zinc-900 bg-black/25 px-4 py-3 text-xs font-semibold text-zinc-200">{title}</td>
      </tr>
      {items.map((item) => <VaultRow key={item.vaultAddress} item={item} />)}
    </>
  );
}

function VaultRow({ item }: { item: VaultListItem }) {
  return (
    <tr className="border-b border-zinc-900 bg-black/20 transition hover:bg-zinc-900/45">
      <td className="px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot item={item} />
            <Link href={`/vaults/${item.vaultAddress}`} className="truncate font-medium text-zinc-100 hover:text-emerald-300">{item.name}</Link>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="font-mono">{item.vaultAddress.slice(0, 6)}…{item.vaultAddress.slice(-4)}</span>
            <span>·</span>
            <span>{statusText(item)}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><CopyableAddress address={item.leader} /></td>
      <AprCell value={item.apr} />
      <td className="px-4 py-3 text-right font-mono text-zinc-100">{formatMoneyFull(item.metrics.tvl)}</td>
      <ReturnCell value={item.metrics.return30dPct} />
      <DrawdownCell value={item.metrics.maxDrawdownPct} />
      <td className="px-4 py-3 text-right font-mono text-zinc-300">{Math.round(item.metrics.historyDays)}</td>
      <QualityCell item={item} />
      <td className="px-4 py-3 text-right"><Sparkline values={item.sparkline} /></td>
      <td className="px-4 py-3 text-right">
        <Link href={`/vaults/${item.vaultAddress}`} className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-300">
          Details <ExternalLink className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function MobileVaultCard({ item }: { item: VaultListItem }) {
  return (
    <Link href={`/vaults/${item.vaultAddress}`} className="block rounded-lg border border-zinc-800 bg-black/25 p-3 transition hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot item={item} />
            <div className="truncate font-medium text-zinc-100">{item.name}</div>
          </div>
          <div className="mt-1 font-mono text-[11px] text-zinc-500">{item.vaultAddress.slice(0, 8)}…{item.vaultAddress.slice(-4)}</div>
        </div>
        <Sparkline values={item.sparkline} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <MobileStat label="TVL" value={item.metrics.tvl} kind="tvl" />
        <MobileStat label="APR" value={item.apr} kind="apr" />
        <MobileStat label="30D" value={item.metrics.return30dPct} kind="return" />
        <MobileStat label="Age" value={item.metrics.historyDays} kind="days" />
      </div>
    </Link>
  );
}

function StatusDot({ item }: { item: VaultListItem }) {
  const tone = item.isClosed ? "bg-red-400" : item.allowDeposits ? "bg-emerald-400" : "bg-amber-300";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", tone)} />;
}

function statusText(item: VaultListItem): string {
  if (item.isClosed) return "Closed";
  if (!item.allowDeposits) return "Deposits disabled";
  return "Deposits open";
}

function AprCell({ value }: { value: number | null }) {
  if (value == null) return <td className="px-4 py-3 text-right text-xs text-zinc-500">—</td>;
  const pct = value * 100;
  return <td className={cn("px-4 py-3 text-right font-mono", pct >= 0 ? "text-emerald-400" : "text-red-400")}>{pct.toFixed(2)}%</td>;
}

function ReturnCell({ value }: { value: number | null }) {
  if (value == null) return <td className="px-4 py-3 text-right text-xs text-zinc-500">—</td>;
  return <td className={cn("px-4 py-3 text-right font-mono", value >= 0 ? "text-emerald-400" : "text-red-400")}>{formatPct(value)}</td>;
}

function DrawdownCell({ value }: { value: number | null }) {
  if (value == null) return <td className="px-4 py-3 text-right text-xs text-zinc-500">—</td>;
  return <td className="px-4 py-3 text-right font-mono text-red-400">{(value * 100).toFixed(1)}%</td>;
}

function QualityCell({ item }: { item: VaultListItem }) {
  return (
    <td className="px-4 py-3 text-right">
      <div className="flex flex-col items-end gap-0.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", qualityTone(item.metrics.score.confidence))}>{item.metrics.score.confidence}</span>
        <span className="font-mono text-[11px] text-zinc-500">{item.metrics.dailyReturnSamples} samples</span>
      </div>
    </td>
  );
}

function qualityTone(confidence: VaultListItem["metrics"]["score"]["confidence"]): string {
  if (confidence === "high") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (confidence === "medium") return "border-sky-500/25 bg-sky-500/10 text-sky-300";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-zinc-600">—</span>;
  const width = 76;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 5) - 2.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ml-auto h-[30px] w-[76px] overflow-visible" aria-hidden="true">
      <polyline fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function formatMoneyFull(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return formatCompact(value);
}

function MobileStat({ label, value, kind }: { label: string; value: number | null; kind: "return" | "tvl" | "apr" | "days" }) {
  let display = "—";
  let tone = "text-zinc-200";
  if (value != null) {
    if (kind === "return") {
      display = formatPct(value);
      tone = value >= 0 ? "text-emerald-400" : "text-red-400";
    } else if (kind === "tvl") display = formatCompact(value);
    else if (kind === "apr") {
      const pct = value * 100;
      display = `${pct.toFixed(2)}%`;
      tone = pct >= 0 ? "text-emerald-400" : "text-red-400";
    } else display = String(Math.round(value));
  } else tone = "text-zinc-500";
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={cn("mt-1 font-mono", tone)}>{display}</div>
    </div>
  );
}
