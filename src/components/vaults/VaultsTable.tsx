"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatCompact, formatPct } from "@/lib/format";
import type { VaultDecision, VaultListItem } from "@/types/vaults";

type SortKey =
  | "name"
  | "screen"
  | "tvl"
  | "return30d"
  | "maxDrawdown"
  | "quality"
  | "tvlChange7d"
  | "followers"
  | "status";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "name", label: "Vault", align: "left" },
  { key: "screen", label: "Screen", align: "right" },
  { key: "tvl", label: "TVL", align: "right" },
  { key: "return30d", label: "30D P&L", align: "right" },
  { key: "maxDrawdown", label: "DD", align: "right" },
  { key: "quality", label: "Quality", align: "right" },
  { key: "tvlChange7d", label: "7D Equity Δ", align: "right" },
  { key: "followers", label: "Users", align: "right" },
  { key: "status", label: "Status", align: "right" },
];

function qualityRank(item: VaultListItem): number {
  const confidence = item.metrics.score.confidence === "high" ? 3 : item.metrics.score.confidence === "medium" ? 2 : 1;
  return confidence * 1000 + item.metrics.dailyReturnSamples;
}

function statusRank(item: VaultListItem): number {
  if (item.isClosed) return 0;
  if (!item.allowDeposits) return 1;
  return 2;
}

function getSortValue(item: VaultListItem, key: SortKey): number | string {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "screen":
      return item.metrics.score.score;
    case "tvl":
      return item.metrics.tvl;
    case "return30d":
      return item.metrics.return30dPct ?? Number.NEGATIVE_INFINITY;
    case "maxDrawdown":
      return item.metrics.maxDrawdownPct ?? Number.POSITIVE_INFINITY;
    case "quality":
      return qualityRank(item);
    case "tvlChange7d":
      return item.metrics.tvlChange7dPct ?? Number.NEGATIVE_INFINITY;
    case "followers":
      return item.metrics.followerCount;
    case "status":
      return statusRank(item);
  }
}

export function VaultsTable({ items }: { items: VaultListItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("screen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...items];
    out.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
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
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "maxDrawdown" ? "asc" : "desc");
    }
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b border-zinc-800 bg-[#0d1015]">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "cursor-pointer select-none px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  <span className={cn("inline-flex items-center gap-1", col.align === "right" && "justify-end")}>
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Operator</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.vaultAddress} className="border-b border-zinc-900 bg-black/20 transition hover:bg-zinc-900/45">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <DecisionDot decision={item.metrics.score.decision} />
                    <div className="min-w-0">
                      <Link href={`/vaults/${item.vaultAddress}`} className="block truncate font-medium text-zinc-100 hover:text-emerald-300">
                        {item.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-mono">{item.vaultAddress.slice(0, 6)}…{item.vaultAddress.slice(-4)}</span>
                        <span>·</span>
                        <span className="truncate">{primaryFlag(item)}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <DecisionBadge decision={item.metrics.score.decision} label={shortDecisionLabel(item.metrics.score.decision)} />
                    <span className="font-mono text-zinc-100">{item.metrics.score.score}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{formatCompact(item.metrics.tvl)}</td>
                <ReturnCell value={item.metrics.return30dPct} />
                <DrawdownCell value={item.metrics.maxDrawdownPct} />
                <QualityCell item={item} />
                <ReturnCell value={item.metrics.tvlChange7dPct} mutedNote />
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{item.metrics.followerCount}</td>
                <td className="px-3 py-2.5 text-right"><StatusBadge item={item} /></td>
                <td className="px-3 py-2.5"><CopyableAddress address={item.leader} /></td>
                <td className="px-3 py-2.5 text-right">
                  <Link href={`/vaults/${item.vaultAddress}`} className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-300">
                    Details <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-zinc-500" colSpan={COLUMNS.length + 2}>
                  No vaults match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-3 md:hidden">
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">
            No vaults match the current filters.
          </div>
        ) : (
          sorted.map((item) => (
            <Link key={item.vaultAddress} href={`/vaults/${item.vaultAddress}`} className="block rounded-lg border border-zinc-800 bg-black/25 p-3 transition hover:border-zinc-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <DecisionDot decision={item.metrics.score.decision} />
                    <div className="truncate font-medium text-zinc-100">{item.name}</div>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">{item.vaultAddress.slice(0, 8)}…{item.vaultAddress.slice(-4)}</div>
                </div>
                <div className="text-right">
                  <DecisionBadge decision={item.metrics.score.decision} label={shortDecisionLabel(item.metrics.score.decision)} />
                  <div className="mt-1 font-mono text-xs text-zinc-100">{item.metrics.score.score}/100</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <MobileStat label="TVL" value={item.metrics.tvl} kind="tvl" />
                <MobileStat label="30D" value={item.metrics.return30dPct} kind="return" />
                <MobileStat label="DD" value={item.metrics.maxDrawdownPct} kind="drawdown" />
                <MobileStat label="Quality" value={item.metrics.dailyReturnSamples} kind="samples" confidence={item.metrics.score.confidence} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>{primaryFlag(item)}</span>
                <StatusBadge item={item} />
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function primaryFlag(item: VaultListItem): string {
  const firstNonCap = item.metrics.score.flags.find((flag) => !flag.toLowerCase().includes("capped"));
  return firstNonCap ?? item.metrics.score.label;
}

function shortDecisionLabel(decision: VaultDecision) {
  if (decision === "watch") return "Candidate";
  if (decision === "avoid") return "High risk";
  return "Review";
}

function DecisionDot({ decision }: { decision: VaultDecision }) {
  const tone = decision === "watch" ? "bg-emerald-400" : decision === "avoid" ? "bg-red-400" : "bg-amber-300";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", tone)} />;
}

function DecisionBadge({ decision, label }: { decision: VaultDecision; label: string }) {
  const tone = decision === "watch"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : decision === "avoid"
      ? "border-red-500/25 bg-red-500/10 text-red-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", tone)}>{label}</span>;
}

function ReturnCell({ value, mutedNote = false }: { value: number | null; mutedNote?: boolean }) {
  if (value == null) return <td className="px-3 py-2.5 text-right text-xs text-zinc-500">—</td>;
  return (
    <td className={cn("px-3 py-2.5 text-right font-mono", value >= 0 ? "text-emerald-400" : "text-red-400", mutedNote && "text-opacity-90")}>
      {formatPct(value)}
    </td>
  );
}

function DrawdownCell({ value }: { value: number | null }) {
  if (value == null) return <td className="px-3 py-2.5 text-right text-xs text-zinc-500">—</td>;
  return <td className="px-3 py-2.5 text-right font-mono text-red-400">{(value * 100).toFixed(1)}%</td>;
}

function QualityCell({ item }: { item: VaultListItem }) {
  const confidence = item.metrics.score.confidence;
  const tone = confidence === "high"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : confidence === "medium"
      ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return (
    <td className="px-3 py-2.5 text-right">
      <div className="flex flex-col items-end gap-0.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", tone)}>{confidence}</span>
        <span className="font-mono text-[11px] text-zinc-500">{item.metrics.dailyReturnSamples} samples</span>
      </div>
    </td>
  );
}

function StatusBadge({ item }: { item: VaultListItem }) {
  const label = item.isClosed ? "Closed" : item.allowDeposits ? "Open" : "No deposits";
  const tone = item.isClosed
    ? "border-red-500/25 bg-red-500/10 text-red-300"
    : item.allowDeposits
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", tone)}>{label}</span>;
}

function MobileStat({ label, value, kind, confidence }: { label: string; value: number | null; kind: "return" | "drawdown" | "tvl" | "count" | "samples"; confidence?: string }) {
  let display = "—";
  let tone = "text-zinc-200";
  if (value != null) {
    if (kind === "return") {
      display = formatPct(value);
      tone = value >= 0 ? "text-emerald-400" : "text-red-400";
    } else if (kind === "drawdown") {
      display = `${(value * 100).toFixed(1)}%`;
      tone = "text-red-400";
    } else if (kind === "tvl") display = formatCompact(value);
    else if (kind === "samples") {
      display = `${confidence ?? "n/a"}`;
      tone = confidence === "high" ? "text-emerald-300" : confidence === "medium" ? "text-sky-300" : "text-amber-200";
    } else display = String(value);
  } else tone = "text-zinc-500";
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={cn("mt-1 font-mono", tone)}>{display}</div>
    </div>
  );
}
