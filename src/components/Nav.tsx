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
    <div className="border-b border-[#7dd4c4]/20 bg-gradient-to-r from-[#0f1a1e]/95 via-[#0a0a0a] to-[#141414] backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div>
          <div className="font-mono text-[22px] font-bold tracking-tight text-white">
            <span className="bg-gradient-to-r from-white via-[#c9f2ea] to-[#7dd4c4] bg-clip-text text-transparent">
              HyperPulse
            </span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Hyperliquid portfolio, markets, factors, and methodology in one workspace
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[#7dd4c4]/25 bg-[#0f1a1e]/70 px-3 py-1.5 text-xs text-zinc-500 shadow-[0_0_0_1px_rgba(125,212,196,0.08)]">
            <div className={loading ? "live-dot opacity-30" : "live-dot"} />
            <span className="text-[#b7ece1] font-mono">
              {loading ? "Connecting..." : "Live"}
            </span>
            <span className="font-mono text-zinc-300">{timeStr}</span>
          </div>

          <WalletConnect />
        </div>
      </div>
    </div>
  );
}
