"use client";

import { useWallet } from "@/context/WalletContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, formatPct, truncateAddress, cn } from "@/lib/format";

export default function DashboardHeader() {
  const { address, isReadOnly, disconnect } = useWallet();
  const { stats, trades } = usePortfolio();
  const { accountState } = useWallet();

  const accountValue = accountState?.accountValue ?? 0;
  const unrealizedPnl = accountState?.unrealizedPnl ?? 0;
  const totalPnl = stats?.totalPnl ?? 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-50">Portfolio</h1>
          {address && (
            <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
              {truncateAddress(address)}
              {isReadOnly && " (read-only)"}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-bold text-zinc-50">
            {formatUSD(accountValue)}
          </span>
          {trades.length > 0 && (
            <>
              <span
                className={cn(
                  "text-sm font-medium",
                  totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {totalPnl >= 0 ? "+" : ""}
                {formatUSD(totalPnl)} realized
              </span>
              {unrealizedPnl !== 0 && (
                <span
                  className={cn(
                    "text-sm",
                    unrealizedPnl >= 0
                      ? "text-emerald-400/70"
                      : "text-red-400/70",
                  )}
                >
                  {formatPct(
                    accountValue > 0
                      ? (unrealizedPnl / accountValue) * 100
                      : 0,
                  )}{" "}
                  unrealized
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <button
        onClick={disconnect}
        className="self-start text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded px-3 py-1.5 transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}
