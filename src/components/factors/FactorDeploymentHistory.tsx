"use client";

import { useEffect, useMemo, useState } from "react";
import { clearDeployments, listDeployments } from "@/lib/factorDeployments";
import { cn, formatUSD, truncateAddress } from "@/lib/format";
import { getStoredNetwork } from "@/lib/hyperliquid";
import type { FactorDeploymentRecord } from "@/types";

interface FactorDeploymentHistoryProps {
  address: string | null;
  refreshKey?: number;
}

function legTone(status: FactorDeploymentRecord["legs"][number]["status"]) {
  if (status === "filled") return "text-emerald-300";
  if (status === "error") return "text-red-300";
  if (status === "resting" || status === "waiting") return "text-amber-300";
  return "text-zinc-500";
}

export default function FactorDeploymentHistory({
  address,
  refreshKey = 0,
}: FactorDeploymentHistoryProps) {
  const [records, setRecords] = useState<FactorDeploymentRecord[]>([]);

  useEffect(() => {
    if (!address) {
      setRecords([]);
      return;
    }
    setRecords(listDeployments(address));
  }, [address, refreshKey]);

  const activeNetwork = getStoredNetwork();

  const visibleRecords = useMemo(
    () =>
      records.filter((record) =>
        activeNetwork === "testnet" ? !record.mainnet : record.mainnet,
      ),
    [activeNetwork, records],
  );

  const handleClear = () => {
    if (!address) return;
    const confirmed = window.confirm(
      "Clear saved factor deployment history for this wallet?",
    );
    if (!confirmed) return;
    clearDeployments(address);
    setRecords([]);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Deployment History
          </div>
          <div className="mt-2 text-lg font-semibold text-zinc-100">
            Recent factor executions for {address ? truncateAddress(address) : "this wallet"}
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            Saved locally per wallet. Showing {activeNetwork} receipts only.
          </div>
        </div>
        {address && records.length > 0 && (
          <button
            onClick={handleClear}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            Clear History
          </button>
        )}
      </div>

      {!address ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-6 text-sm text-zinc-500">
          Connect a wallet to track and review factor deployment receipts.
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-6 text-sm text-zinc-500">
          No saved deployments yet for this {activeNetwork} wallet session.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleRecords.map((record) => {
            const filled = record.legs.filter((leg) => leg.status === "filled").length;
            const failed = record.legs.filter((leg) => leg.status === "error").length;
            const pending = record.legs.filter(
              (leg) => leg.status === "resting" || leg.status === "waiting",
            ).length;
            const totalNotional = record.legs.reduce((sum, leg) => {
              const qty = Number(leg.executedQty ?? leg.targetSize);
              const px = leg.avgPx ?? 0;
              return sum + (Number.isFinite(qty) && Number.isFinite(px) ? Math.abs(qty * px) : 0);
            }, 0);

            return (
              <details
                key={record.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">
                        {record.factorName}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {new Date(record.timestamp).toLocaleString()} ·{" "}
                        {record.mainnet ? "mainnet" : "testnet"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">
                        {filled} filled
                      </span>
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">
                        {pending} pending
                      </span>
                      <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-300">
                        {failed} failed
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-300">
                        {formatUSD(totalNotional)}
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="pb-2 pr-4 font-medium">Leg</th>
                        <th className="pb-2 pr-4 font-medium">Phase</th>
                        <th className="pb-2 pr-4 font-medium">Target</th>
                        <th className="pb-2 pr-4 font-medium">Executed</th>
                        <th className="pb-2 pr-4 font-medium">Avg Px</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.legs.map((leg, index) => (
                        <tr key={`${record.id}-${leg.symbol}-${index}`} className="border-t border-zinc-800">
                          <td className="py-2 pr-4 text-zinc-200">
                            {leg.symbol}{" "}
                            <span className="text-zinc-500">
                              {leg.side === "buy" ? "buy" : "sell"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-zinc-400">{leg.phase}</td>
                          <td className="py-2 pr-4 font-mono text-zinc-300">{leg.targetSize}</td>
                          <td className="py-2 pr-4 font-mono text-zinc-300">
                            {leg.executedQty == null ? "—" : leg.executedQty}
                          </td>
                          <td className="py-2 pr-4 font-mono text-zinc-300">
                            {leg.avgPx == null ? "—" : leg.avgPx.toFixed(4)}
                          </td>
                          <td className={cn("py-2 pr-4", legTone(leg.status))}>
                            {leg.status}
                            {leg.error && (
                              <div className="mt-1 text-[11px] text-red-400">
                                {leg.error}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
