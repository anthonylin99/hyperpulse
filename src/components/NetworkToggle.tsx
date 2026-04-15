"use client";

import { useEffect, useState } from "react";
import {
  getStoredNetwork,
  setStoredNetwork,
  onNetworkChange,
  type HyperliquidNetwork,
} from "@/lib/hyperliquid";

export default function NetworkToggle() {
  const [network, setNetwork] = useState<HyperliquidNetwork>("mainnet");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNetwork(getStoredNetwork());
    return onNetworkChange(setNetwork);
  }, []);

  if (!mounted) {
    return (
      <div
        aria-hidden
        className="inline-flex items-center rounded border border-zinc-800 bg-zinc-950 text-[10px] font-mono opacity-0"
      >
        <span className="px-2 py-1">MAINNET</span>
        <span className="px-2 py-1">TESTNET</span>
      </div>
    );
  }

  const handleToggle = (next: HyperliquidNetwork) => {
    if (next === network) return;
    const confirmed = window.confirm(
      `Switch to ${next}? Any connected Hyperliquid session will be disconnected and the page will reload.`,
    );
    if (!confirmed) return;
    setStoredNetwork(next);
    setTimeout(() => window.location.reload(), 100);
  };

  return (
    <div className="inline-flex items-center rounded border border-zinc-800 bg-zinc-950 text-[10px] font-mono">
      <button
        onClick={() => handleToggle("mainnet")}
        className={`px-2 py-1 transition-colors ${
          network === "mainnet"
            ? "bg-[#24786d]/30 text-[#7dd4c4]"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        MAINNET
      </button>
      <button
        onClick={() => handleToggle("testnet")}
        className={`px-2 py-1 transition-colors ${
          network === "testnet"
            ? "bg-amber-500/20 text-amber-300"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        TESTNET
      </button>
    </div>
  );
}
