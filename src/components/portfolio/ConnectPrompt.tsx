"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWallet } from "@/context/WalletContext";
import { getSavedWallets, removeWallet, type SavedWallet } from "@/lib/savedWallets";
import { truncateAddress, cn } from "@/lib/format";

function PrivyLoginPanel({
  onAddress,
  disabled,
}: {
  onAddress: (address: string) => void;
  disabled: boolean;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const [connecting, setConnecting] = useState(false);
  const connectedOnce = useRef(false);

  const privyAddress = useMemo(() => {
    if (wallets && wallets.length > 0) {
      // Prefer a linked external wallet over the embedded Privy wallet
      const external = wallets.find((w) => w.walletClientType !== "privy");
      if (external) return external.address;
      const embedded = wallets.find((w) => w.walletClientType === "privy");
      return (embedded ?? wallets[0]).address;
    }
    // Fallback: older user shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeWallet = (user as any)?.wallet;
    return maybeWallet?.address ?? null;
  }, [wallets, user]);

  useEffect(() => {
    if (!authenticated || !privyAddress) return;
    if (connectedOnce.current) return;
    connectedOnce.current = true;
    onAddress(privyAddress);
  }, [authenticated, privyAddress, onAddress]);

  return (
    <button
      onClick={async () => {
        setConnecting(true);
        try {
          await login();
        } finally {
          setConnecting(false);
        }
      }}
      disabled={disabled || !ready || connecting}
      className={cn(
        "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
        "bg-teal-600 hover:bg-teal-500 text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {connecting ? "Signing in..." : "Continue with Email (Privy)"}
    </button>
  );
}

export default function ConnectPrompt() {
  const { connectReadOnly, connectWithBrowserWallet, loading } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [mode, setMode] = useState<"main" | "paste">("main");
  const [error, setError] = useState<string | null>(null);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

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

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo / Brand */}
        <div className="space-y-3">
          <div className="text-4xl font-bold tracking-tight text-zinc-50">
            HyperPulse
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Portfolio analytics and trade insights for Hyperliquid.
            <br />
            Paste any address to get started — no wallet required.
          </p>
        </div>

        {/* Saved Wallets */}
        {savedWallets.length > 0 && mode === "main" && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              Saved Wallets
            </div>
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
                        <div className="text-zinc-200 font-medium truncate">
                          {wallet.nickname}
                        </div>
                        <div className="text-zinc-500 font-mono text-xs">
                          {truncateAddress(wallet.address)}
                        </div>
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
          </div>
        )}

        {mode === "main" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left">
              <div className="text-xs text-zinc-400 font-medium mb-1">Read-only by default</div>
              <div className="text-xs text-zinc-500">
                Viewing analytics never asks for private keys. Email login uses a Privy wallet to match your Hyperliquid account.
              </div>
            </div>
            {privyEnabled ? (
              <PrivyLoginPanel
                disabled={loading}
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
                  "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
                  "bg-teal-600 hover:bg-teal-500 text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? "Connecting..." : "Connect Wallet (optional)"}
              </button>
            )}

            {privyEnabled && (
              <div className="text-[11px] text-zinc-500">
                Uses your linked external wallet if available. Otherwise a new embedded wallet is created.
              </div>
            )}

            <button
              onClick={handleWalletConnect}
              disabled={loading}
              className={cn(
                "w-full py-2.5 px-4 rounded-lg font-medium text-xs transition-all",
                "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              Use external wallet (MetaMask/Rabby)
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                or
              </span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Paste Address Button */}
            <button
              onClick={() => setMode("paste")}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
                "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
              )}
            >
              View Any Wallet Address
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

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}

        <p className="text-zinc-600 text-xs">
          Read-only by default. We never access your private keys.
        </p>
      </div>
    </div>
  );
}
