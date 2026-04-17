"use client";

import { useEffect, useState } from "react";
import { Copy, LogOut, Shield, X } from "lucide-react";
import {
  useWallet,
  type BrowserWalletPreference,
} from "@/context/WalletContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { isNetworkTestnet } from "@/lib/hyperliquid";
import { formatUSD, truncateAddress } from "@/lib/format";
import PrivyWalletPanel from "@/components/PrivyWalletPanel";
import type { ConnectedWallet } from "@privy-io/react-auth";
import toast from "react-hot-toast";

interface WalletModalProps {
  onClose: () => void;
}

export default function WalletModal({ onClose }: WalletModalProps) {
  const { tradingEnabled } = useAppConfig();
  const {
    address: connectedAddress,
    accountState,
    connectWithBrowserWallet,
    connectReadOnly,
    connectWithPrivyWallet,
    disconnect,
    isConnected,
    isReadOnly,
    loading,
  } = useWallet();
  const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const privyAllowEmbedded = process.env.NEXT_PUBLIC_PRIVY_ALLOW_EMBEDDED === "true";
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const trimmedAddress = address.trim();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handlePrivyTrade = async (wallet: ConnectedWallet) => {
    setError("");
    try {
      await connectWithPrivyWallet(wallet);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  };

  const handlePrivyAddress = async (addr: string) => {
    setError("");
    try {
      await connectReadOnly(addr);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
    }
  };

  const handleBrowserWalletConnect = async (
    preference: BrowserWalletPreference = "auto"
  ) => {
    setError("");
    try {
      await connectWithBrowserWallet(preference);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Wallet connect failed. Please try again.";
      setError(message);
    }
  };

  const handleReadOnlyConnect = async () => {
    if (!trimmedAddress) {
      setError("Please enter a wallet address");
      return;
    }

    setError("");
    try {
      await connectReadOnly(trimmedAddress);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load wallet";
      setError(message);
    }
  };

  const handleCopyAddress = async () => {
    if (!connectedAddress) return;
    try {
      await navigator.clipboard.writeText(connectedAddress);
      toast.success("Wallet address copied");
    } catch {
      toast.error("Failed to copy address");
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-[120] max-h-[calc(100vh-4rem)] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#7dd4c4]" />
            <span className="text-sm font-medium">Wallet Access</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {isNetworkTestnet() ? "TESTNET" : "MAINNET"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-zinc-400 font-sans leading-relaxed space-y-2">
            <p>
              HyperPulse is <strong>read-only by default</strong>. Paste any public Hyperliquid
              address to view portfolio analytics without exposing private credentials.
            </p>
            <p className="text-zinc-500">
              The public deployment does not accept manual API private keys. That path is removed
              intentionally to minimize trust and keep the demo safe to share broadly.
            </p>
          </div>

          {isConnected && connectedAddress && (
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Current Session
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <div className="text-sm font-medium text-zinc-100">
                      {truncateAddress(connectedAddress)}
                    </div>
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                      {isReadOnly ? "Read-only" : "Trading enabled"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 break-all">
                    {connectedAddress}
                  </div>
                  {!isReadOnly && (
                    <div className="mt-2 text-xs text-zinc-400">
                      Available buying power: {formatUSD(accountState?.withdrawable ?? 0, 0)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          )}

          {privyEnabled && privyAllowEmbedded && (
            <div className="space-y-3 border border-zinc-800 rounded p-3 bg-zinc-950/50">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Email / Privy
              </div>
              <PrivyWalletPanel
                disabled={loading}
                tradingEnabled={tradingEnabled}
                onAddress={handlePrivyAddress}
                onTradeWallet={handlePrivyTrade}
              />
            </div>
          )}

          <div className="space-y-3 border border-zinc-800 rounded p-3 bg-zinc-950/50">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Wallet Address
              </label>
              <input
                type="text"
                placeholder="0x... (public wallet address)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReadOnlyConnect()}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#7dd4c4] transition-colors"
              />
            </div>

            <button
              onClick={handleReadOnlyConnect}
              disabled={loading || !trimmedAddress}
              className="w-full py-2.5 bg-[#24786d] hover:bg-[#2b8b7f] disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition-colors"
            >
              {loading ? "Loading..." : "View Read-only Analytics"}
            </button>
          </div>

          {tradingEnabled && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Optional
                </span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <div className="text-[11px] text-zinc-500 leading-relaxed">
                Browser wallet execution is enabled for this deployment only. It requires a fresh
                reconnect after reload and does not persist an execution key.
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleBrowserWalletConnect("metamask")}
                  disabled={loading}
                  className="py-2 text-[11px] text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-800 disabled:text-zinc-500"
                >
                  MetaMask
                </button>
                <button
                  onClick={() => handleBrowserWalletConnect("rabby")}
                  disabled={loading}
                  className="py-2 text-[11px] text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-800 disabled:text-zinc-500"
                >
                  Rabby
                </button>
                <button
                  onClick={() => handleBrowserWalletConnect("coinbase")}
                  disabled={loading}
                  className="py-2 text-[11px] text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-800 disabled:text-zinc-500"
                >
                  Coinbase
                </button>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600 text-center">
            {isNetworkTestnet() ? "Testnet only. " : ""}Read-only analytics never request your private
            key or seed phrase.
          </p>
        </div>
      </div>
    </>
  );
}
