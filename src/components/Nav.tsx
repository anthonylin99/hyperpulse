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
    <div className="flex items-center justify-between px-3 h-full border-b border-emerald-400/10 bg-gradient-to-r from-zinc-950/95 via-zinc-950 to-emerald-950/20 backdrop-blur-sm">
      {/* Left: Wordmark */}
      <div className="font-mono text-[17px] font-bold tracking-tight text-white">
        <span className="bg-gradient-to-r from-white via-emerald-100 to-teal-300 bg-clip-text text-transparent">
          HyperPulse
        </span>
      </div>

      {/* Center: Live indicator */}
      <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/10 bg-zinc-950/70 px-2.5 py-0.5 text-[11px] text-zinc-500 shadow-[0_0_0_1px_rgba(16,185,129,0.02)]">
        <div className={loading ? "live-dot opacity-30" : "live-dot"} />
        <span className="text-emerald-200/80 font-mono">
          {loading ? "Connecting..." : "Live"}
        </span>
        <span className="font-mono text-zinc-300">{timeStr}</span>
      </div>

      {/* Right: Wallet connect */}
      <WalletConnect />
    </div>
  );
}
