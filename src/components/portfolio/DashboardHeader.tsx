"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, truncateAddress, cn } from "@/lib/format";
import toast from "react-hot-toast";
import {
  getSavedWallets,
  saveWallet,
  renameWallet,
  touchWallet,
  type SavedWallet,
} from "@/lib/savedWallets";

export default function DashboardHeader() {
  const { address, isReadOnly, disconnect, connectReadOnly } = useWallet();
  const { stats, trades, lastUpdated, refresh, loading: portfolioLoading } = usePortfolio();
  const { accountState } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);

  const accountValue = accountState?.accountValue ?? 0;
  const perpsValue = accountState?.isolatedAccountValue ?? 0;
  const spotUsdc = accountState?.spotUsdcTotal ?? 0;
  const unrealizedPnl = accountState?.unrealizedPnl ?? 0;
  const totalPnl = stats?.totalPnl ?? 0;

  // Auto-save wallet on connect
  useEffect(() => {
    if (address) {
      const updated = saveWallet(address);
      setSavedWallets(updated);
      touchWallet(address);
    }
  }, [address]);

  // Load saved wallets
  useEffect(() => {
    setSavedWallets(getSavedWallets());
  }, []);

  // Close switcher on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentWallet = savedWallets.find(
    (w) => w.address.toLowerCase() === address?.toLowerCase()
  );

  const handleRename = () => {
    if (address && nicknameInput.trim()) {
      const updated = renameWallet(address, nicknameInput.trim());
      setSavedWallets(updated);
      setEditing(false);
    }
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
      // error handled by WalletContext
    }
  };

  const otherWallets = savedWallets.filter(
    (w) => w.address.toLowerCase() !== address?.toLowerCase()
  );

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 relative" ref={switcherRef}>
          <h1 className="text-2xl font-bold text-zinc-50">Portfolio</h1>

          {/* Wallet badge — click to open switcher */}
          {address && (
            <button
              onClick={() => setShowSwitcher(!showSwitcher)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-mono bg-zinc-800 px-2.5 py-1 rounded transition-colors",
                "hover:bg-zinc-700 hover:border-teal-600/30 border border-zinc-700",
                showSwitcher && "border-teal-600/50",
              )}
            >
              <span className="text-zinc-400">
                {currentWallet?.nickname || truncateAddress(address)}
              </span>
              {isReadOnly && (
                <span className="text-zinc-600">(read-only)</span>
              )}
              {otherWallets.length > 0 && (
                <span className="text-zinc-600 ml-0.5">▾</span>
              )}
            </button>
          )}

          {/* Wallet switcher dropdown */}
          {showSwitcher && (
            <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
              {/* Current wallet */}
              <div className="px-3 py-2.5 border-b border-zinc-800">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                  Current
                </div>
                {editing ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRename()}
                      placeholder="Nickname..."
                      autoFocus
                      className="flex-1 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-600"
                    />
                    <button
                      onClick={handleRename}
                      className="px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-500"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-zinc-200 font-medium">
                        {currentWallet?.nickname || "Unnamed"}
                      </div>
                      <div className="text-xs font-mono text-zinc-500">
                        {address ? truncateAddress(address) : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyAddress}
                        className="text-xs text-zinc-500 hover:text-teal-400 transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          setNicknameInput(currentWallet?.nickname || "");
                          setEditing(true);
                        }}
                        className="text-xs text-zinc-500 hover:text-teal-400 transition-colors"
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Other saved wallets */}
              {otherWallets.length > 0 && (
                <div className="px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                    Switch to
                  </div>
                  {otherWallets.map((wallet) => (
                    <button
                      key={wallet.address}
                      onClick={() => handleSwitchWallet(wallet)}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-300 truncate">
                          {wallet.nickname}
                        </div>
                        <div className="text-xs font-mono text-zinc-600">
                          {truncateAddress(wallet.address)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-4">
          <div>
            <span className="text-3xl font-bold text-zinc-50">
              {formatUSD(accountValue)}
            </span>
            <span className="text-xs text-zinc-600 ml-2" title="Perps equity + spot USDC. Staked HYPE not included.">
              equity
            </span>
            {lastUpdated && (
              <span className="text-[10px] text-zinc-600 ml-2">
                updated {Math.round((Date.now() - lastUpdated) / 60000)}m ago
              </span>
            )}
            <div
              className="text-[10px] text-zinc-600 mt-1"
              title="Perps equity + spot USDC. Staked HYPE not included."
            >
              Perps: {formatUSD(perpsValue)} • Spot USDC: {formatUSD(spotUsdc)} • Staked HYPE not included
            </div>
          </div>
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
                  {unrealizedPnl >= 0 ? "+" : ""}
                  {formatUSD(unrealizedPnl)} unrealized
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-start">
        <button
          onClick={async () => {
            setRefreshing(true);
            try { await refresh(); } finally { setRefreshing(false); }
          }}
          disabled={refreshing || portfolioLoading}
          className={cn(
            "text-xs border border-zinc-800 rounded px-3 py-1.5 transition-colors",
            refreshing || portfolioLoading
              ? "text-zinc-600 cursor-not-allowed"
              : "text-teal-400 hover:text-teal-300 hover:border-teal-600/30",
          )}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button
          onClick={disconnect}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded px-3 py-1.5 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
