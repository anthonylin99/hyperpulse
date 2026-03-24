"use client";

import { useMarket } from "@/context/MarketContext";

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

      {/* Right: Disabled wallet connect stub */}
      <button
        disabled
        className="px-3 py-1.5 text-xs font-mono rounded border border-zinc-700 text-zinc-600 cursor-not-allowed"
      >
        Connect Wallet
      </button>
    </div>
  );
}
