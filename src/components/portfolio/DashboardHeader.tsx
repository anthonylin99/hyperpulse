"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, RefreshCw, Wallet2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { usePrivy } from "@privy-io/react-auth";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn, formatUSD, truncateAddress } from "@/lib/format";
import toast from "react-hot-toast";
import {
  clearSavedWallets,
  getSavedWallets,
  removeWallet,
  renameWallet,
  saveWallet,
  touchWallet,
  type SavedWallet,
} from "@/lib/savedWallets";

export default function DashboardHeader() {
  const { address, isReadOnly, disconnect, connectReadOnly, accountState } =
    useWallet();
  const { logout, authenticated } = usePrivy();
  const { stats, lastUpdated, refresh, loading: portfolioLoading } =
    usePortfolio();
  const [refreshing, setRefreshing] = useState(false);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);

  const perpsValue = accountState?.isolatedAccountValue ?? 0;
  const spotWalletValue = accountState?.spotTotalValue ?? 0;
  const unrealizedPnl = accountState?.unrealizedPnl ?? 0;
  const totalPnl = stats?.totalPnl ?? 0;
  const lastRefreshLabel = lastUpdated
    ? `${Math.max(
        0,
        Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000)
      )}m ago`
    : "Waiting for first sync";

  useEffect(() => {
    if (address) {
      const updated = saveWallet(address);
      setSavedWallets(updated);
      touchWallet(address);
    }
  }, [address]);

  useEffect(() => {
    setSavedWallets(getSavedWallets());
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setShowSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentWallet = savedWallets.find(
    (wallet) => wallet.address.toLowerCase() === address?.toLowerCase()
  );
  const otherWallets = savedWallets.filter(
    (wallet) => wallet.address.toLowerCase() !== address?.toLowerCase()
  );

  const handleRename = () => {
    if (!address || !nicknameInput.trim()) return;
    const updated = renameWallet(address, nicknameInput.trim());
    setSavedWallets(updated);
    setEditing(false);
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Wallet address copied");
    } catch {
      toast.error("Failed to copy address");
    }
  };

  const handleSwitchWallet = async (wallet: SavedWallet) => {
    setShowSwitcher(false);
    if (wallet.address.toLowerCase() === address?.toLowerCase()) return;
    try {
      await connectReadOnly(wallet.address);
    } catch {
      // Wallet context already surfaces the error toast.
    }
  };

  const handleRemoveSaved = (walletAddress: string) => {
    const updated = removeWallet(walletAddress);
    setSavedWallets(updated);
    if (walletAddress.toLowerCase() === address?.toLowerCase()) {
      disconnect();
    }
  };

  const handleClearAll = () => {
    clearSavedWallets();
    setSavedWallets([]);
    disconnect();
  };

  const handleDisconnect = async () => {
    disconnect();
    if (authenticated) {
      try {
        await logout();
      } catch {
        // ignore logout errors
      }
    }
  };

  return (
    <section className="rounded-[22px] border border-emerald-900/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.05),transparent_18%),linear-gradient(180deg,rgba(8,14,12,0.98),rgba(6,10,9,0.98))] p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-400/75">
                Portfolio
              </div>
              {isReadOnly ? (
                <span className="rounded-full border border-emerald-900/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                  Read-only
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-[1.08rem] font-semibold tracking-tight text-zinc-50 sm:text-[1.18rem]">
              Portfolio review workspace
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
              Review positions, realized performance, and journal quality without enabling trading permissions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing || portfolioLoading}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                refreshing || portfolioLoading
                  ? "cursor-not-allowed border-zinc-800 text-zinc-600"
                  : "border-emerald-900/30 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/[0.14]"
              )}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (refreshing || portfolioLoading) && "animate-spin"
                )}
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={handleDisconnect}
              className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Disconnect
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_220px_320px]">
          <div
            className="relative rounded-2xl border border-zinc-800 bg-zinc-950/78 p-4"
            ref={switcherRef}
          >
            {address ? (
              <button
                onClick={() => setShowSwitcher((open) => !open)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/85 px-4 py-3 text-left transition-colors hover:border-emerald-900/30 hover:bg-zinc-950",
                  showSwitcher && "border-emerald-700/40"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    <Wallet2 className="h-3.5 w-3.5 text-emerald-300" />
                    Wallet identity
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">
                      {currentWallet?.nickname || "Unnamed wallet"}
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      {truncateAddress(address)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>
                    {otherWallets.length > 0
                      ? `${otherWallets.length} saved`
                      : "Saved"}
                  </span>
                  <span>▾</span>
                </div>
              </button>
            ) : null}

            {showSwitcher ? (
              <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30">
                <div className="border-b border-zinc-800 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Current Wallet
                  </div>
                  {editing ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={nicknameInput}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename()}
                        placeholder="Nickname..."
                        autoFocus
                        className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-700/40 focus:outline-none"
                      />
                      <button
                        onClick={handleRename}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100">
                          {currentWallet?.nickname || "Unnamed wallet"}
                        </div>
                        <div className="mt-1 text-xs font-mono text-zinc-500">
                          {address ? truncateAddress(address) : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyAddress}
                          className="text-xs text-zinc-500 transition-colors hover:text-emerald-300"
                        >
                          Copy
                        </button>
                        {address && currentWallet ? (
                          <button
                            onClick={() => handleRemoveSaved(address)}
                            className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                          >
                            Forget
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            setNicknameInput(currentWallet?.nickname || "");
                            setEditing(true);
                          }}
                          className="text-xs text-zinc-500 transition-colors hover:text-emerald-300"
                        >
                          Rename
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {otherWallets.length > 0 ? (
                  <div className="px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Switch Wallet
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {otherWallets.map((wallet) => (
                        <div
                          key={wallet.address}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
                        >
                          <button
                            onClick={() => handleSwitchWallet(wallet)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm text-zinc-200">
                              {wallet.nickname}
                            </div>
                            <div className="mt-1 text-xs font-mono text-zinc-500">
                              {truncateAddress(wallet.address)}
                            </div>
                          </button>
                          <button
                            onClick={() => handleRemoveSaved(wallet.address)}
                            className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                            title="Remove saved wallet"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleClearAll}
                      className="mt-3 rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-400"
                    >
                      Forget All Saved Wallets
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1">
                {address ?? "No wallet"}
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1">
                Perps + full spot wallet
              </span>
              <span
                className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1"
                title="Perps equity plus the full marked spot wallet. Staked HYPE not included."
              >
                Staked HYPE excluded
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/78 px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              <RefreshCw className="h-3.5 w-3.5 text-emerald-300" />
              Refresh
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-100">
              {lastRefreshLabel}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {refreshing || portfolioLoading
                ? "Fetching latest account data…"
                : "Loaded from Hyperliquid history"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/78 px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
              Snapshot
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
              <div>
                <div className="text-zinc-500">Perps</div>
                <div className="mt-1 font-medium text-zinc-100">
                  {formatUSD(perpsValue)}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Spot</div>
                <div className="mt-1 font-medium text-zinc-100">
                  {formatUSD(spotWalletValue)}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Realized</div>
                <div
                  className={cn(
                    "mt-1 font-medium",
                    totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {formatUSD(totalPnl)}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Unrealized</div>
                <div
                  className={cn(
                    "mt-1 font-medium",
                    unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {formatUSD(unrealizedPnl)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
