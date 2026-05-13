"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatCompact, formatPct } from "@/lib/format";
import type { VaultListItem } from "@/types/vaults";

type SortKey =
  | "name"
  | "tvl"
  | "return30d"
  | "maxDrawdown"
  | "sharpe"
  | "tvlChange7d"
  | "followers";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "name", label: "Vault", align: "left" },
  { key: "tvl", label: "Equity / TVL", align: "right" },
  { key: "return30d", label: "30d return", align: "right" },
  { key: "maxDrawdown", label: "Max DD (90d)", align: "right" },
  { key: "sharpe", label: "Sharpe (90d)", align: "right" },
  { key: "tvlChange7d", label: "TVL Δ 7d", align: "right" },
  { key: "followers", label: "Followers", align: "right" },
];

function getSortValue(item: VaultListItem, key: SortKey): number | string {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "tvl":
      return item.metrics.tvl;
    case "return30d":
      return item.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
    case "maxDrawdown":
      return item.metrics.maxDrawdownPct ?? Number.NEGATIVE_INFINITY;
    case "sharpe":
      return item.metrics.sharpe90d ?? Number.NEGATIVE_INFINITY;
    case "tvlChange7d":
      return item.metrics.tvlChange7dPct ?? Number.NEGATIVE_INFINITY;
    case "followers":
      return item.metrics.followerCount;
  }
}

export function VaultsTable({ items }: { items: VaultListItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("sharpe");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...items];
    out.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      if (cmp === 0 && sortKey !== "return30d") {
        // Tiebreaker per spec §4.1: 30d return descending.
        const ar = a.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
        const br = b.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
        cmp = ar - br;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [items, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950/60">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "label px-4 py-3 cursor-pointer select-none",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === "asc"
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
              <th className="label px-4 py-3 text-left text-zinc-400">Operator</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={item.vaultAddress}
                className="border-t border-zinc-800 transition hover:bg-zinc-900/60"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/vaults/${item.vaultAddress}`}
                    className="font-medium text-zinc-100 hover:text-teal-300"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                    {item.vaultAddress.slice(0, 10)}…
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200">
                  {formatCompact(item.metrics.tvl)}
                </td>
                <ReturnCell value={item.metrics.return30dPct} />
                <DrawdownCell value={item.metrics.maxDrawdownPct} />
                <SharpeCell value={item.metrics.sharpe90d} samples={item.metrics.dailyReturnSamples} />
                <ReturnCell value={item.metrics.tvlChange7dPct} />
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                  {item.metrics.followerCount}
                </td>
                <td className="px-4 py-3">
                  <CopyableAddress address={item.leader} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-zinc-500" colSpan={COLUMNS.length + 1}>
                  No vaults match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">
            No vaults match the current filters.
          </div>
        ) : (
          sorted.map((item) => (
            <Link
              key={item.vaultAddress}
              href={`/vaults/${item.vaultAddress}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-100">{item.name}</div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">
                    {item.vaultAddress.slice(0, 10)}…
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-zinc-500">TVL</div>
                  <div className="font-mono text-sm text-zinc-100">{formatCompact(item.metrics.tvl)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MobileStat label="30d" value={item.metrics.return30dPct} kind="return" />
                <MobileStat label="Max DD" value={item.metrics.maxDrawdownPct} kind="drawdown" />
                <MobileStat
                  label="Sharpe"
                  value={item.metrics.sharpe90d}
                  kind="sharpe"
                  samples={item.metrics.dailyReturnSamples}
                />
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function ReturnCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="px-4 py-3 text-right text-xs text-zinc-500">—</td>;
  }
  const tone = value >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <td className={cn("px-4 py-3 text-right tabular-nums", tone)}>{formatPct(value)}</td>
  );
}

function DrawdownCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="px-4 py-3 text-right text-xs text-zinc-500">—</td>;
  }
  // Drawdown stored as positive fraction; display as positive % per spec §5.2.
  return (
    <td className="px-4 py-3 text-right tabular-nums text-red-400">
      {(value * 100).toFixed(1)}%
    </td>
  );
}

function SharpeCell({ value, samples }: { value: number | null; samples: number }) {
  if (value == null || samples < 30) {
    return (
      <td className="px-4 py-3 text-right text-xs text-zinc-500">Insufficient history</td>
    );
  }
  const tone = value >= 1 ? "text-emerald-400" : value >= 0 ? "text-zinc-200" : "text-red-400";
  return (
    <td className={cn("px-4 py-3 text-right tabular-nums", tone)}>{value.toFixed(2)}</td>
  );
}

function MobileStat({
  label,
  value,
  kind,
  samples,
}: {
  label: string;
  value: number | null;
  kind: "return" | "drawdown" | "sharpe";
  samples?: number;
}) {
  let display: string;
  let tone = "text-zinc-200";
  if (value == null || (kind === "sharpe" && (samples ?? 0) < 30)) {
    display = "—";
    tone = "text-zinc-500";
  } else if (kind === "return") {
    display = formatPct(value);
    tone = value >= 0 ? "text-emerald-400" : "text-red-400";
  } else if (kind === "drawdown") {
    display = `${(value * 100).toFixed(1)}%`;
    tone = "text-red-400";
  } else {
    display = value.toFixed(2);
    tone = value >= 1 ? "text-emerald-400" : value >= 0 ? "text-zinc-200" : "text-red-400";
  }
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={cn("mt-0.5 font-mono tabular-nums", tone)}>{display}</div>
    </div>
  );
}
