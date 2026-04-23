"use client";

import Link from "next/link";
import BrandLogo from "@/components/brand/BrandLogo";
import { useMarket } from "@/context/MarketContext";
import WalletConnect from "./WalletConnect";
import NetworkToggle from "./NetworkToggle";
import { useAppConfig } from "@/context/AppConfigContext";

export default function Nav() {
  const { lastUpdated, loading } = useMarket();
  const { whalesEnabled, factorsEnabled } = useAppConfig();
  const focusAreas = ["markets", "portfolio review", "docs"];
  if (factorsEnabled) focusAreas.splice(1, 0, "factors");
  if (whalesEnabled) focusAreas.push("whales");

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  return (
    <div className="border-b border-[#7dd4c4]/12 bg-gradient-to-r from-[#10181b]/95 via-[#0a0c10] to-[#111417]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="min-w-0">
          <Link href="/" className="inline-flex items-center gap-2">
            <BrandLogo compact markClassName="h-8 w-8" textClassName="text-[24px]" />
          </Link>
          <div className="mt-0.5 hidden text-xs text-zinc-500 md:block">
            Hyperliquid intelligence across {focusAreas.join(", ")}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#7dd4c4]/20 bg-[#0f1a1e]/70 px-3 py-1.5 text-xs text-zinc-500 shadow-[0_0_0_1px_rgba(125,212,196,0.05)] sm:flex">
            <div className={loading ? "live-dot opacity-30" : "live-dot"} />
            <span className="font-mono text-[#b7ece1]">{loading ? "Syncing" : "Live"}</span>
            <span className="font-mono text-zinc-300">{timeStr}</span>
          </div>

          <NetworkToggle />
          <WalletConnect />
        </div>
      </div>
    </div>
  );
}
