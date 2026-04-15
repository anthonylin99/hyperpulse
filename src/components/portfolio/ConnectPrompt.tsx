"use client";

import { useState, useEffect } from "react";
import { type ConnectedWallet } from "@privy-io/react-auth";
import { useAppConfig } from "@/context/AppConfigContext";
import { useWallet } from "@/context/WalletContext";
import { getSavedWallets, removeWallet, clearSavedWallets, type SavedWallet } from "@/lib/savedWallets";
import { truncateAddress, cn } from "@/lib/format";
import PrivyWalletPanel from "@/components/PrivyWalletPanel";

export default function ConnectPrompt() {
  const { tradingEnabled } = useAppConfig();
  const { connectReadOnly, connectWithBrowserWallet, connectWithPrivyWallet, loading } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [mode, setMode] = useState<"main" | "paste">("main");
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
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-3">
          <div className="text-4xl font-bold tracking-tight text-zinc-50">HyperPulse</div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Portfolio analytics and trade insights for Hyperliquid.
            <br />
            Paste any address to get started. Browser-wallet execution is optional and disabled in the public deployment by default.
          </p>
        </div>

        {savedWallets.length > 0 && mode === "main" && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Saved Wallets</div>
            <div className="space-y-1.5">
              {savedWallets
                .sort((a, b) => b.lastUsed - a.lastUsed)
                .map((wallet) => (
                  <button
                    key={wallet.address}
                    onClick={() => handleSavedWalletClick(wallet)}
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-all",
                      "bg-zinc-900 border border-zinc-800 hover:border-teal-600/50 hover:bg-zinc-800/80",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                      <div className="text-left min-w-0">
                        <div className="text-zinc-200 font-medium truncate">{wallet.nickname}</div>
                        <div className="text-zinc-500 font-mono text-xs">{truncateAddress(wallet.address)}</div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleRemoveSaved(e, wallet.address)}
                      className="text-zinc-600 hover:text-red-400 text-xs px-2 py-1 transition-colors flex-shrink-0"
                      title="Remove saved wallet"
                    >
                      ×
                    </button>
                  </button>
                ))}
            </div>
            <button
              onClick={handleClearSaved}
              className="w-full py-2 px-3 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/40 transition-colors"
            >
              Forget All Saved Wallets
            </button>
          </div>
        )}

        {mode === "main" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left">
              <div className="text-xs text-zinc-400 font-medium mb-1">Read-only by default</div>
              <div className="text-xs text-zinc-500">
                Viewing analytics never asks for private keys. Use a public wallet address first; browser-wallet access is optional and deployment-gated.
              </div>
            </div>

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
            ) : null}

            {privyEnabled && !privyAllowEmbedded && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-xs text-zinc-500">
                Email login is disabled because Privy can create a fresh embedded wallet. Use external wallet connect or paste your trading address below.
              </div>
            )}

            {privyEnabled && (
              <div className="text-[11px] text-zinc-500">
                Privy can create an embedded wallet, but Hyperliquid analytics usually belong to your linked external address. If the listed wallet is wrong, paste the exact trading address you use on Hyperliquid.
              </div>
            )}

            {tradingEnabled && (
              <button
                onClick={handleWalletConnect}
                disabled={loading}
                className={cn(
                  "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
                  "bg-teal-600 hover:bg-teal-500 text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? "Connecting..." : "Connect Browser Wallet"}
              </button>
            )}

            {tradingEnabled && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-500 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
            )}

            <button
              onClick={() => setMode("paste")}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
                tradingEnabled
                  ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  : "bg-teal-600 hover:bg-teal-500 text-white",
              )}
            >
              {tradingEnabled ? "View Any Wallet Address" : "View Wallet Address"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasteSubmit()}
              placeholder="0x..."
              autoFocus
              className={cn(
                "w-full py-3 px-4 rounded-lg text-sm font-mono",
                "bg-zinc-900 border border-zinc-700 text-zinc-100",
                "placeholder:text-zinc-600 focus:outline-none focus:border-teal-600",
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode("main");
                  setError(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700"
              >
                Back
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={loading || !addressInput.trim()}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all",
                  "bg-teal-600 hover:bg-teal-500 text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? "Loading..." : "View Analytics"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <p className="text-zinc-600 text-xs">
          Read-only by default. We never ask for your seed phrase or manual private key in the public deployment.
        </p>
      </div>
    </div>
  );
}
