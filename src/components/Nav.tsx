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
    <div className="flex items-center justify-between px-3 h-full border-b border-[#7dd4c4]/20 bg-gradient-to-r from-[#0f1a1e]/95 via-[#0a0a0a] to-[#141414] backdrop-blur-sm">
      {/* Left: Wordmark */}
      <div className="font-mono text-[17px] font-bold tracking-tight text-white">
        <span className="bg-gradient-to-r from-white via-[#c9f2ea] to-[#7dd4c4] bg-clip-text text-transparent">
          HyperPulse
        </span>
      </div>

      {/* Center: Live indicator */}
      <div className="flex items-center gap-1.5 rounded-full border border-[#7dd4c4]/25 bg-[#0f1a1e]/70 px-2.5 py-0.5 text-[11px] text-zinc-500 shadow-[0_0_0_1px_rgba(125,212,196,0.08)]">
        <div className={loading ? "live-dot opacity-30" : "live-dot"} />
        <span className="text-[#b7ece1] font-mono">
          {loading ? "Connecting..." : "Live"}
        </span>
        <span className="font-mono text-zinc-300">{timeStr}</span>
      </div>

      {/* Right: Wallet connect */}
      <WalletConnect />
    </div>
  );
}
