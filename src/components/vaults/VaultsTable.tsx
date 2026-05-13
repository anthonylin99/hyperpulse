"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatCompact, formatPct } from "@/lib/format";
import type { VaultDecision, VaultListItem } from "@/types/vaults";

type SortKey =
  | "name"
  | "score"
  | "tvl"
  | "return30d"
  | "maxDrawdown"
  | "sharpe"
  | "tvlChange7d"
  | "followers";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "score", label: "Decision", align: "left" },
  { key: "name", label: "Vault", align: "left" },
  { key: "tvl", label: "Equity / TVL", align: "right" },
  { key: "return30d", label: "30d", align: "right" },
  { key: "maxDrawdown", label: "Max DD", align: "right" },
  { key: "sharpe", label: "Sharpe", align: "right" },
  { key: "tvlChange7d", label: "Flow 7d", align: "right" },
  { key: "followers", label: "Followers", align: "right" },
];

function getSortValue(item: VaultListItem, key: SortKey): number | string {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "score":
      return item.metrics.score.score;
    case "tvl":
      return item.metrics.tvl;
    case "return30d":
      return item.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
    case "maxDrawdown":
      return item.metrics.maxDrawdownPct ?? Number.POSITIVE_INFINITY;
    case "sharpe":
      return item.metrics.sharpe90d ?? Number.NEGATIVE_INFINITY;
    case "tvlChange7d":
      return item.metrics.tvlChange7dPct ?? Number.NEGATIVE_INFINITY;
    case "followers":
      return item.metrics.followerCount;
  }
}

export function VaultsTable({ items }: { items: VaultListItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
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
      if (sortKey === "maxDrawdown") cmp = -cmp;
      if (cmp === 0 && sortKey !== "return30d") {
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
      setSortDir(key === "name" || key === "maxDrawdown" ? "asc" : "desc");
    }
  }

  return (
    <>
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
                <td className="px-4 py-3 align-top">
                  <DecisionBadge decision={item.metrics.score.decision} label={item.metrics.score.label} />
                  <div className="mt-1 font-mono text-xs text-zinc-300">
                    {item.metrics.score.score}/100
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/vaults/${item.vaultAddress}`}
                    className="font-medium text-zinc-100 hover:text-teal-300"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-1 max-w-[360px] text-xs leading-5 text-zinc-500">
                    {item.metrics.score.reason}
                  </div>
                  <div className="mt-2 flex max-w-[420px] flex-wrap gap-1.5">
                    {item.metrics.score.flags.map((flag) => (
                      <span key={flag} className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-400">
                        {flag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 align-top">
                  {formatCompact(item.metrics.tvl)}
                </td>
                <ReturnCell value={item.metrics.return30dPct} />
                <DrawdownCell value={item.metrics.maxDrawdownPct} />
                <SharpeCell value={item.metrics.sharpe90d} samples={item.metrics.dailyReturnSamples} />
                <ReturnCell value={item.metrics.tvlChange7dPct} />
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300 align-top">
                  {item.metrics.followerCount}
                </td>
                <td className="px-4 py-3 align-top">
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
                  <DecisionBadge decision={item.metrics.score.decision} label={item.metrics.score.label} />
                  <div className="mt-2 font-medium text-zinc-100">{item.name}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{item.metrics.score.reason}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-zinc-500">Score</div>
                  <div className="font-mono text-sm text-zinc-100">{item.metrics.score.score}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MobileStat label="30d" value={item.metrics.return30dPct} kind="return" />
                <MobileStat label="Max DD" value={item.metrics.maxDrawdownPct} kind="drawdown" />
                <MobileStat label="TVL" value={item.metrics.tvl} kind="tvl" />
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function DecisionBadge({ decision, label }: { decision: VaultDecision; label: string }) {
  const tone = decision === "watch"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : decision === "avoid"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", tone)}>
      {label}
    </span>
  );
}

function ReturnCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="px-4 py-3 text-right text-xs text-zinc-500 align-top">—</td>;
  }
  const tone = value >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <td className={cn("px-4 py-3 text-right tabular-nums align-top", tone)}>{formatPct(value)}</td>
  );
}

function DrawdownCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="px-4 py-3 text-right text-xs text-zinc-500 align-top">—</td>;
  }
  return (
    <td className="px-4 py-3 text-right tabular-nums text-red-400 align-top">
      {(value * 100).toFixed(1)}%
    </td>
  );
}

function SharpeCell({ value, samples }: { value: number | null; samples: number }) {
  if (value == null || samples < 30) {
    return (
      <td className="px-4 py-3 text-right text-xs text-zinc-500 align-top">Thin sample</td>
    );
  }
  const tone = value >= 1 ? "text-emerald-400" : value >= 0 ? "text-zinc-200" : "text-red-400";
  return (
    <td className={cn("px-4 py-3 text-right tabular-nums align-top", tone)}>{value.toFixed(2)}</td>
  );
}

function MobileStat({
  label,
  value,
  kind,
}: {
  label: string;
  value: number | null;
  kind: "return" | "drawdown" | "tvl";
}) {
  let display: string;
  let tone = "text-zinc-200";
  if (value == null) {
    display = "—";
    tone = "text-zinc-500";
  } else if (kind === "return") {
    display = formatPct(value);
    tone = value >= 0 ? "text-emerald-400" : "text-red-400";
  } else if (kind === "drawdown") {
    display = `${(value * 100).toFixed(1)}%`;
    tone = "text-red-400";
  } else {
    display = formatCompact(value);
  }
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={cn("mt-1 font-mono", tone)}>{display}</div>
    </div>
  );
}
