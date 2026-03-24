"use client";

import { useMarket } from "@/context/MarketContext";
import WalletConnect from "./WalletConnect";

export default function Nav() {
  const { lastUpdated, loading } = useMarket();

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  return (
    <div className="flex items-center justify-between px-4 h-full">
      {/* Left: Wordmark */}
      <div className="font-mono text-lg font-bold tracking-tight text-white">
        HyperPulse
      </div>

      {/* Center: Live indicator */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className={loading ? "live-dot opacity-30" : "live-dot"} />
        <span className="text-zinc-400 font-mono">
          {loading ? "Connecting..." : "Live"}
        </span>
        <span className="font-mono">{timeStr}</span>
      </div>

      {/* Right: Wallet connect */}
      <WalletConnect />
    </div>
  );
}
