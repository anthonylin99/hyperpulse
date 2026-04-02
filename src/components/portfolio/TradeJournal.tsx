"use client";

import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, cn } from "@/lib/format";
import { getNotes, setNote } from "@/lib/tradeNotes";
import type { RoundTripTrade } from "@/types";

type SortKey = "time" | "pnl" | "pnlPct" | "duration" | "coin";
type SortDir = "asc" | "desc";
type FilterResult = "all" | "winners" | "losers";

function formatDuration(ms: number): string {
  const mins = ms / (1000 * 60);
  if (mins < 60) return `${mins.toFixed(0)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

function exportCSV(trades: RoundTripTrade[], notes: Record<string, string>) {
  const headers = [
    "Date", "Asset", "Direction", "Entry Price", "Exit Price",
    "Size (USD)", "P&L", "P&L %", "Duration (min)", "Fees", "Funding", "Notes"
  ];
  const rows = trades.map((t) => [
    new Date(t.exitTime).toISOString(),
    t.coin,
    t.direction,
    t.entryPx.toString(),
    t.exitPx.toString(),
    t.notional.toFixed(2),
    t.pnl.toFixed(2),
    t.pnlPct.toFixed(2),
    (t.duration / 60000).toFixed(1),
    t.fees.toFixed(4),
    t.fundingPaid.toFixed(4),
    `"${(notes[t.id] ?? "").replace(/"/g, '""')}"`,
  ]);

  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hyperpulse-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TradeJournal() {
  const { trades, loading } = usePortfolio();
  const { address } = useWallet();
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterResult, setFilterResult] = useState<FilterResult>("all");
  const [page, setPage] = useState(0);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pageSize = 25;

  // Load notes from localStorage when address changes
  useEffect(() => {
    if (address) {
      setNotes(getNotes(address));
    } else {
      setNotes({});
    }
  }, [address]);

  const handleNoteSave = useCallback(
    (tradeId: string, text: string) => {
      if (!address) return;
      const trimmed = text.trim();
      setNote(address, tradeId, trimmed);
      setNotes((prev) => {
        const next = { ...prev };
        if (trimmed === "") {
          delete next[tradeId];
        } else {
          next[tradeId] = trimmed;
        }
        return next;
      });
    },
    [address],
  );

  const coins = useMemo(() => {
    const set = new Set(trades.map((t) => t.coin));
    return ["all", ...Array.from(set).sort()];
  }, [trades]);

  const sorted = useMemo(() => {
    let filtered =
      filterCoin === "all"
        ? trades
        : trades.filter((t) => t.coin === filterCoin);

    if (filterResult === "winners") {
      filtered = filtered.filter((t) => t.pnl > 0);
    } else if (filterResult === "losers") {
      filtered = filtered.filter((t) => t.pnl <= 0);
    }

    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "time":
          cmp = a.exitTime - b.exitTime;
          break;
        case "pnl":
          cmp = a.pnl - b.pnl;
          break;
        case "pnlPct":
          cmp = a.pnlPct - b.pnlPct;
          break;
        case "duration":
          cmp = a.duration - b.duration;
          break;
        case "coin":
          cmp = a.coin.localeCompare(b.coin);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [trades, sortKey, sortDir, filterCoin, filterResult]);

  const summary = useMemo(() => {
    const totalPnl = sorted.reduce((s, t) => s + t.pnl, 0);
    const totalFees = sorted.reduce((s, t) => s + t.fees, 0);
    const totalVolume = sorted.reduce((s, t) => s + t.notional, 0);
    const count = sorted.length;
    const avgPnl = count > 0 ? totalPnl / count : 0;
    return { totalPnl, totalFees, totalVolume, count, avgPnl };
  }, [sorted]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="flex items-center gap-2">
            <div className="skeleton h-6 w-20 rounded" />
            <div className="skeleton h-6 w-24 rounded" />
          </div>
        </div>
        <div className="px-4 py-2">
          <div className="skeleton h-6 w-full rounded mb-2" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-8 w-full rounded mb-1.5" />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) return null;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="text-zinc-600 ml-0.5">
      {sortKey === k ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
    </span>
  );

  const COL_COUNT = 11; // 10 data columns + 1 note icon column

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300">
          Trade Journal ({sorted.length})
        </h3>
        <div className="flex items-center gap-2">
          {/* Win/Loss filter buttons */}
          <div className="flex items-center rounded overflow-hidden border border-zinc-700">
            {(
              [
                { key: "all", label: "All", color: "text-zinc-300" },
                { key: "winners", label: "W", color: "text-emerald-400" },
                { key: "losers", label: "L", color: "text-red-400" },
              ] as const
            ).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => {
                  setFilterResult(key);
                  setPage(0);
                }}
                className={cn(
                  "text-xs px-2 py-1 transition-colors",
                  filterResult === key
                    ? `bg-zinc-700 ${color} font-medium`
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCSV(sorted, notes)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded px-2.5 py-1 transition-colors"
          >
            Export CSV
          </button>
          <select
            value={filterCoin}
            onChange={(e) => {
              setFilterCoin(e.target.value);
              setPage(0);
            }}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1"
          >
            {coins.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Assets" : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th
                className="text-left px-4 py-2 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("time")}
              >
                Date
                <SortIcon k="time" />
              </th>
              <th
                className="text-left px-2 py-2 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("coin")}
              >
                Asset
                <SortIcon k="coin" />
              </th>
              <th className="text-left px-2 py-2">Dir</th>
              <th className="text-right px-2 py-2">Entry</th>
              <th className="text-right px-2 py-2">Exit</th>
              <th className="text-right px-2 py-2">Size</th>
              <th
                className="text-right px-2 py-2 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("pnl")}
              >
                P&L
                <SortIcon k="pnl" />
              </th>
              <th
                className="text-right px-2 py-2 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("pnlPct")}
              >
                P&L %
                <SortIcon k="pnlPct" />
              </th>
              <th
                className="text-right px-2 py-2 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("duration")}
              >
                Duration
                <SortIcon k="duration" />
              </th>
              <th className="text-right px-2 py-2">Fees</th>
              <th className="w-8 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {paged.map((trade) => {
              const hasNote = !!notes[trade.id];
              const isExpanded = expandedNote === trade.id;
              return (
                <Fragment key={trade.id}>
                  <tr
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">
                      {new Date(trade.exitTime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-2 py-2 text-zinc-200 font-medium">
                      {trade.coin}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          trade.direction === "long"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400",
                        )}
                      >
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-300 font-mono">
                      {trade.entryPx < 1
                        ? trade.entryPx.toPrecision(4)
                        : trade.entryPx.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-300 font-mono">
                      {trade.exitPx < 1
                        ? trade.exitPx.toPrecision(4)
                        : trade.exitPx.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-400 font-mono">
                      {formatUSD(trade.notional)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-mono font-medium",
                        trade.pnl >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {trade.pnl >= 0 ? "+" : ""}
                      {formatUSD(trade.pnl)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-mono",
                        trade.pnlPct >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {trade.pnlPct >= 0 ? "+" : ""}
                      {trade.pnlPct.toFixed(2)}%
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-400">
                      {formatDuration(trade.duration)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500 font-mono">
                      {formatUSD(trade.fees)}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <button
                        onClick={() =>
                          setExpandedNote((prev) =>
                            prev === trade.id ? null : trade.id,
                          )
                        }
                        className="relative text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                        title={hasNote ? "Edit note" : "Add note"}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="w-3.5 h-3.5"
                        >
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.447l-.783 2.938a.5.5 0 0 0 .612.612l2.938-.783a1 1 0 0 0 .447-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.474Z" />
                        </svg>
                        {hasNote && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-teal-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-zinc-800/50">
                      <td colSpan={COL_COUNT} className="px-4 py-2">
                        <textarea
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 resize-y min-h-[60px] focus:outline-none focus:border-teal-500/50"
                          placeholder="Add a note about this trade..."
                          defaultValue={notes[trade.id] ?? ""}
                          onBlur={(e) =>
                            handleNoteSave(trade.id, e.target.value)
                          }
                          autoFocus
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* Summary footer */}
          <tfoot>
            <tr className="border-t border-zinc-700 bg-zinc-800/60 text-zinc-300 font-medium sticky bottom-0">
              <td className="px-4 py-2 text-xs" colSpan={2}>
                {summary.count} trade{summary.count !== 1 ? "s" : ""}
              </td>
              <td colSpan={3} />
              <td className="px-2 py-2 text-right text-xs font-mono text-zinc-400">
                {formatUSD(summary.totalVolume)}
              </td>
              <td
                className={cn(
                  "px-2 py-2 text-right text-xs font-mono font-medium",
                  summary.totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {summary.totalPnl >= 0 ? "+" : ""}
                {formatUSD(summary.totalPnl)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-mono text-zinc-400">
                avg {summary.avgPnl >= 0 ? "+" : ""}
                {formatUSD(summary.avgPnl)}
              </td>
              <td />
              <td className="px-4 py-2 text-right text-xs font-mono text-zinc-500">
                {formatUSD(summary.totalFees)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
