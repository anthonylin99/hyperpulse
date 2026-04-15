"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { cn } from "@/lib/format";

interface PrivyWalletPanelProps {
  onAddress: (address: string) => void;
  onConnectExternal?: () => void;
  onTradeWallet: (wallet: ConnectedWallet) => void;
  tradingEnabled: boolean;
  disabled: boolean;
}

export default function PrivyWalletPanel({
  onAddress,
  onConnectExternal,
  onTradeWallet,
  tradingEnabled,
  disabled,
}: PrivyWalletPanelProps) {
  const { ready, authenticated, login, user, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [connecting, setConnecting] = useState(false);
  const [pendingConnect, setPendingConnect] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  const privyAddress = useMemo(() => {
    if (wallets && wallets.length > 0) {
      const external = wallets.find((w) => w.walletClientType !== "privy");
      if (external) return external.address;
      const embedded = wallets.find((w) => w.walletClientType === "privy");
      return (embedded ?? wallets[0]).address;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeWallet = (user as any)?.wallet;
    return maybeWallet?.address ?? null;
  }, [wallets, user]);

  useEffect(() => {
    if (!pendingConnect) return;
    if (!authenticated || !privyAddress) return;
    setPendingConnect(false);
    setShowSelector(true);
  }, [pendingConnect, authenticated, privyAddress]);

  if (authenticated && showSelector) {
    const sortedWallets = [...wallets].sort((a, b) => {
      if (a.walletClientType === "privy" && b.walletClientType !== "privy") return 1;
      if (a.walletClientType !== "privy" && b.walletClientType === "privy") return -1;
      return a.address.localeCompare(b.address);
    });

    return (
      <div className="space-y-2">
        {disabled && (
          <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-3 py-2 text-left text-[11px] text-teal-200">
            Approving agent on Hyperliquid… this can take a few seconds. Do not refresh.
          </div>
        )}
        <div className="text-xs text-zinc-400 font-medium text-left">
          Choose the wallet to view
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-[11px] text-zinc-500">
          Your Hyperliquid trading account is usually the externally linked wallet, not the embedded Privy wallet. If the address you trade on ends with something else, use that address for analytics or trade from the linked wallet row below.
        </div>
        {wallets.length > 0 ? (
          <div className="space-y-2">
            {sortedWallets.map((wallet) => (
              <div
                key={wallet.address}
                className={cn(
                  "w-full px-4 py-3 rounded-lg text-sm transition-all",
                  "bg-zinc-900 border border-zinc-800 hover:border-teal-600/50 hover:bg-zinc-800/80"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-zinc-200 font-medium truncate">
                        {wallet.walletClientType === "privy" ? "Privy Embedded Wallet" : "Linked Wallet"}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          wallet.walletClientType === "privy"
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-teal-500/10 text-teal-300"
                        )}
                      >
                        {wallet.walletClientType === "privy" ? "embedded" : "external"}
                      </span>
                    </div>
                    <div className="mt-1 text-zinc-500 font-mono text-xs break-all">{wallet.address}</div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onAddress(wallet.address)}
                    disabled={disabled}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-teal-600/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    View Analytics
                  </button>
                  {tradingEnabled && (
                    <button
                      onClick={() => onTradeWallet(wallet)}
                      disabled={disabled}
                      className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {disabled ? "Approving…" : "Trade From This Wallet"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            No wallets detected from Privy. Paste your address below.
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <div className="text-[11px] text-zinc-500 mb-2">
            If your trading wallet is not listed, paste it here:
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              className={cn(
                "flex-1 py-2.5 px-3 rounded-lg text-xs font-mono",
                "bg-zinc-900 border border-zinc-700 text-zinc-100",
                "placeholder:text-zinc-600 focus:outline-none focus:border-teal-600"
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value;
                  if (value.trim()) onAddress(value.trim());
                }
              }}
            />
            <button
              onClick={(e) => {
                const input = e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null;
                if (input?.value?.trim()) onAddress(input.value.trim());
              }}
              className="px-3 py-2.5 rounded-lg text-xs bg-teal-600 text-white hover:bg-teal-500"
            >
              Use
            </button>
          </div>
          {tradingEnabled && onConnectExternal && (
            <button
              onClick={onConnectExternal}
              disabled={disabled}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-xs transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect External Wallet Directly
            </button>
          )}
          <button
            onClick={() => connectWallet()}
            disabled={disabled}
            className="w-full py-2.5 px-4 rounded-lg font-medium text-xs transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Link External Wallet In Privy
          </button>
          {authenticated && wallets.length > 0 && (
            <button
              onClick={() => setShowSelector(false)}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-xs transition-all bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border border-zinc-800"
            >
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={async () => {
        setConnecting(true);
        try {
          setPendingConnect(true);
          await login();
          if (authenticated && wallets.length > 0) {
            setShowSelector(true);
          }
        } finally {
          setConnecting(false);
        }
      }}
      disabled={disabled || !ready || connecting}
      className={cn(
        "w-full py-3 px-4 rounded-lg font-medium text-sm transition-all",
        "bg-teal-600 hover:bg-teal-500 text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {connecting ? "Signing in..." : "Continue with Email (Privy)"}
    </button>
  );
}
