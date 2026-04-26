"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Search, Wallet, X } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import {
  clearSavedWallets,
  getSavedWallets,
  removeWallet,
  savedWalletPersistenceEnabled,
  type SavedWallet,
} from "@/lib/savedWallets";
import { cn, truncateAddress } from "@/lib/format";

export default function ConnectPrompt() {
  const {
    connectReadOnly,
    connectWithBrowserWalletReadOnly,
    loading,
  } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const remembersWallets = savedWalletPersistenceEnabled();

  useEffect(() => {
    setSavedWallets(getSavedWallets());
  }, []);

  const handlePasteSubmit = async () => {
    if (!addressInput.trim()) return;
    setError(null);
    try {
      await connectReadOnly(addressInput.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid address");
    }
  };

  const handleWalletConnect = async () => {
    setError(null);
    try {
      await connectWithBrowserWalletReadOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const handleSavedWalletClick = async (wallet: SavedWallet) => {
    setError(null);
    try {
      await connectReadOnly(wallet.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
    }
  };

  const handleRemoveSaved = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    const updated = removeWallet(address);
    setSavedWallets(updated);
  };

  const handleClearSaved = () => {
    clearSavedWallets();
    setSavedWallets([]);
  };

  return (
    <section className="mx-auto max-w-[1240px] px-1 py-2">
      <div className="rounded-[26px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(12,18,24,0.98),rgba(8,11,16,0.98))] p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.04)]">
        <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-emerald-400/80">
                Portfolio
              </span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                Read-only
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
              Review a Hyperliquid wallet without connecting trading.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-400">
              Paste a public address or let your browser wallet reveal the active account. HyperPulse only loads analytics here, never a seed phrase or manual private key.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[440px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Mode</div>
              <div className="mt-2 text-sm font-medium text-zinc-100">Analytics only</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Access</div>
              <div className="mt-2 text-sm font-medium text-zinc-100">Browser or paste</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Security</div>
              <div className="mt-2 text-sm font-medium text-zinc-100">No custody</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[22px] border border-zinc-800 bg-zinc-950/55 p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Public wallet address
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePasteSubmit()}
                    placeholder="0x... paste a Hyperliquid wallet"
                    autoFocus
                    className={cn(
                      "w-full rounded-2xl border border-zinc-800 bg-[#090d12] px-4 py-3.5 text-sm font-mono text-zinc-100",
                      "placeholder:text-zinc-600 focus:border-emerald-500/35 focus:outline-none",
                    )}
                  />
                </div>
              </div>

              <button
                onClick={handlePasteSubmit}
                disabled={loading || !addressInput.trim()}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  "bg-emerald-500 text-[#05201a] hover:bg-emerald-400",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {loading ? "Loading..." : "Open Wallet"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-[#090d12] px-3 py-1.5">
                Perps + full marked spot wallet
              </span>
              <span className="rounded-full border border-zinc-800 bg-[#090d12] px-3 py-1.5">
                Staked HYPE excluded
              </span>
              <span className="rounded-full border border-zinc-800 bg-[#090d12] px-3 py-1.5">
                5 minute portfolio refresh
              </span>
              <span className="rounded-full border border-zinc-800 bg-[#090d12] px-3 py-1.5">
                {remembersWallets ? "This browser remembers wallets" : "Session-only privacy"}
              </span>
            </div>
          </div>

          <div className="rounded-[22px] border border-zinc-800 bg-zinc-950/55 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-200">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-100">Use browser wallet address</div>
                  <div className="mt-1 text-xs leading-6 text-zinc-500">
                    Read the active address from MetaMask or Rabby, then open analytics in read-only mode.
                  </div>
                </div>
              </div>
              <span className="rounded-full border border-zinc-800 bg-[#090d12] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Optional
              </span>
            </div>

            <button
              onClick={handleWalletConnect}
              disabled={loading}
              className={cn(
                "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                "border-zinc-800 bg-[#090d12] text-zinc-200 hover:border-emerald-500/30 hover:text-white",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Search className="h-4 w-4" />
              {loading ? "Checking wallet..." : "Discover Browser Wallet"}
            </button>

            <div className="mt-3 text-xs leading-6 text-zinc-500">
              HyperPulse does not request a seed phrase, private key, or execution permissions in the public deployment.
            </div>
          </div>
        </div>

        {remembersWallets && savedWallets.length > 0 ? (
          <div className="mt-5 rounded-[22px] border border-zinc-800 bg-zinc-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Recent wallets</div>
              <button
                onClick={handleClearSaved}
                className="text-xs text-zinc-500 transition hover:text-rose-300"
              >
                Forget all
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {savedWallets
                .sort((a, b) => b.lastUsed - a.lastUsed)
                .slice(0, 4)
                .map((wallet) => (
                  <div
                    key={wallet.address}
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-[#090d12] px-4 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900/80 disabled:opacity-50"
                  >
                    <button
                      onClick={() => handleSavedWalletClick(wallet)}
                      disabled={loading}
                      className="min-w-0 flex-1 text-left disabled:opacity-50"
                    >
                      <div className="text-sm font-medium text-zinc-200">{wallet.nickname}</div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">{truncateAddress(wallet.address)}</div>
                    </button>
                    <button
                      onClick={(e) => handleRemoveSaved(e, wallet.address)}
                      className="ml-3 text-zinc-600 transition hover:text-rose-300"
                      title="Remove saved wallet"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {!remembersWallets ? (
          <div className="mt-4 text-xs leading-6 text-zinc-500">
            HyperPulse is currently set to avoid storing wallet history in local browser memory. Your coworker will not see this wallet later unless you intentionally share the address or keep this tab open.
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </section>
  );
}
