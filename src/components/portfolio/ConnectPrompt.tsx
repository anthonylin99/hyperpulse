"use client";

import { useEffect, useState } from "react";
import { type ConnectedWallet } from "@privy-io/react-auth";
import { ArrowRight, Wallet } from "lucide-react";
import { useAppConfig } from "@/context/AppConfigContext";
import { useWallet } from "@/context/WalletContext";
import { clearSavedWallets, getSavedWallets, removeWallet, type SavedWallet } from "@/lib/savedWallets";
import { cn, truncateAddress } from "@/lib/format";
import PrivyWalletPanel from "@/components/PrivyWalletPanel";

export default function ConnectPrompt() {
  const { tradingEnabled } = useAppConfig();
  const { connectReadOnly, connectWithBrowserWallet, connectWithPrivyWallet, loading } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [addressMode, setAddressMode] = useState<"wallet" | "ens">("wallet");
  const [error, setError] = useState<string | null>(null);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const privyAllowEmbedded = process.env.NEXT_PUBLIC_PRIVY_ALLOW_EMBEDDED === "true";

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
      await connectWithBrowserWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const handlePrivyTradeConnect = async (wallet: ConnectedWallet) => {
    setError(null);
    try {
      await connectWithPrivyWallet(wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
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
    <div className="min-h-[80vh] px-4 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] lg:items-center">
        <div className="max-w-xl">
          <div className="text-[12px] uppercase tracking-[0.28em] text-zinc-500">Connect wallet</div>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-zinc-100 sm:text-6xl">
            Link your
            <br />
            <span className="text-emerald-300">address.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-zinc-400">
            Connect a wallet or enter an address to fetch your Hyperliquid portfolio, fills, funding, and trade review data.
          </p>

          <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950/45 p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Read-only by default</div>
            <div className="mt-2 text-sm leading-6 text-zinc-400">
              Analytics only need a public wallet address. Browser-wallet access is optional, and HyperPulse never asks for a seed phrase or manual private key.
            </div>
          </div>

          {savedWallets.length > 0 ? (
            <div className="mt-8">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent wallets</div>
                <button
                  onClick={handleClearSaved}
                  className="text-xs text-zinc-500 transition hover:text-rose-300"
                >
                  Forget all
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {savedWallets
                  .sort((a, b) => b.lastUsed - a.lastUsed)
                  .slice(0, 4)
                  .map((wallet) => (
                    <button
                      key={wallet.address}
                      onClick={() => handleSavedWalletClick(wallet)}
                      disabled={loading}
                      className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900/80 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-200">{wallet.nickname}</div>
                        <div className="mt-1 font-mono text-xs text-zinc-500">{truncateAddress(wallet.address)}</div>
                      </div>
                      <button
                        onClick={(e) => handleRemoveSaved(e, wallet.address)}
                        className="ml-3 text-zinc-600 transition hover:text-rose-300"
                        title="Remove saved wallet"
                      >
                        ×
                      </button>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[30px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(19,23,31,0.98),rgba(13,16,22,0.96))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="rounded-[24px] border border-emerald-500/35 bg-emerald-500/[0.06] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-medium text-zinc-100">Connect Wallet</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {tradingEnabled ? "MetaMask, WalletConnect, Rabby" : "Read-only analytics with optional wallet auth"}
                  </div>
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Recommended</div>
            </div>

            <div className="mt-4">
              {privyEnabled && privyAllowEmbedded ? (
                <PrivyWalletPanel
                  disabled={loading}
                  onConnectExternal={handleWalletConnect}
                  onTradeWallet={handlePrivyTradeConnect}
                  tradingEnabled={tradingEnabled}
                  onAddress={async (addr) => {
                    try {
                      await connectReadOnly(addr);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to load wallet");
                    }
                  }}
                />
              ) : (
                <button
                  onClick={handleWalletConnect}
                  disabled={loading}
                  className={cn(
                    "w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-left transition",
                    "hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <div className="text-sm font-medium text-emerald-100">{loading ? "Connecting..." : "Connect browser wallet"}</div>
                  <div className="mt-1 text-xs text-emerald-200/80">Use a wallet first if you want the app to discover your account automatically.</div>
                </button>
              )}
            </div>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Or paste address</div>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setAddressMode("wallet")}
              className={cn(
                "rounded-2xl border px-4 py-4 text-left transition",
                addressMode === "wallet"
                  ? "border-emerald-500/35 bg-zinc-950/80"
                  : "border-zinc-800 bg-zinc-950/35 hover:border-zinc-700",
              )}
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Address</div>
              <div className="mt-2 text-base font-medium text-zinc-100">0x...</div>
            </button>
            <button
              onClick={() => setAddressMode("ens")}
              className={cn(
                "rounded-2xl border px-4 py-4 text-left transition",
                addressMode === "ens"
                  ? "border-emerald-500/35 bg-zinc-950/80"
                  : "border-zinc-800 bg-zinc-950/35 hover:border-zinc-700",
              )}
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">ENS</div>
              <div className="mt-2 text-base font-medium text-zinc-100">name.eth</div>
            </button>
          </div>

          <div className="mt-5">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasteSubmit()}
              placeholder={addressMode === "wallet" ? "0x... paste a Hyperliquid wallet address" : "name.eth"}
              autoFocus
              className={cn(
                "w-full rounded-2xl border border-zinc-800 bg-zinc-950/75 px-4 py-4 text-sm text-zinc-100",
                "placeholder:text-zinc-600 focus:border-emerald-500/35 focus:outline-none",
              )}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-zinc-500">
              Paste the exact address you trade on Hyperliquid. If a wallet app shows the wrong linked account, this input is the cleanest path.
            </div>
            <button
              onClick={handlePasteSubmit}
              disabled={loading || !addressInput.trim()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium transition",
                "bg-emerald-600 text-white hover:bg-emerald-500",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {loading ? "Loading..." : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {privyEnabled && !privyAllowEmbedded ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/45 px-4 py-3 text-xs leading-5 text-zinc-500">
              Email-style embedded login is disabled here because it can create a fresh wallet that does not match your actual Hyperliquid trading account.
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
