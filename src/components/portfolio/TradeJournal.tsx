"use client";

import { useState, useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

type SortKey = "time" | "pnl" | "pnlPct" | "duration" | "coin";
type SortDir = "asc" | "desc";

function formatDuration(ms: number): string {
  const mins = ms / (1000 * 60);
  if (mins < 60) return `${mins.toFixed(0)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

export default function TradeJournal() {
  const { trades } = usePortfolio();
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const coins = useMemo(() => {
    const set = new Set(trades.map((t) => t.coin));
    return ["all", ...Array.from(set).sort()];
  }, [trades]);

  const sorted = useMemo(() => {
    let filtered =
      filterCoin === "all"
        ? trades
        : trades.filter((t) => t.coin === filterCoin);

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
  }, [trades, sortKey, sortDir, filterCoin]);

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

  if (trades.length === 0) return null;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="text-zinc-600 ml-0.5">
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </span>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300">
          Trade Journal ({sorted.length})
        </h3>
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
              <th className="text-right px-4 py-2">Fees</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((trade) => (
              <tr
                key={trade.id}
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
              </tr>
            ))}
          </tbody>
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
