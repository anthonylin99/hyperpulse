"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { cn } from "@/lib/format";

export default function ConnectPrompt() {
  const { connectReadOnly, connectWithBrowserWallet, loading } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [mode, setMode] = useState<"main" | "paste">("main");
  const [error, setError] = useState<string | null>(null);

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
            Connect your wallet or paste any address to get started.
          </p>
        </div>

        {mode === "main" ? (
          <div className="space-y-3">
            {/* Connect Wallet Button */}
            <button
              onClick={handleWalletConnect}
              disabled={loading}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
                "bg-teal-600 hover:bg-teal-500 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {loading ? "Connecting..." : "Connect Wallet"}
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
              Paste Wallet Address
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
          Read-only. We never access your private keys.
        </p>
      </div>
    </div>
  );
}
