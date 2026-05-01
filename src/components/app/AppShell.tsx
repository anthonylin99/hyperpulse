"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import AppTabStrip from "@/components/app/AppTabStrip";
import LiveTickerStrip from "@/components/app/LiveTickerStrip";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";
import { getBuildStamp } from "@/lib/site";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { deploymentMode } = useAppConfig();
  const { lastUpdated } = useMarket();
  const usesWorkspaceShell =
    pathname === "/markets" ||
    pathname.startsWith("/markets/") ||
    pathname === "/portfolio" ||
    pathname.startsWith("/portfolio/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/whales" ||
    pathname.startsWith("/whales/");
  const buildStamp = getBuildStamp();
  const syncLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  const footer = (
    <footer className="border-t border-zinc-900/80 bg-[#090b0f]/92">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-2 px-4 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 xl:px-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-300">
            {deploymentMode === "read-only" ? "Read-only" : "Trading enabled"}
          </span>
          <span>Hyperliquid-native</span>
          <span>Last sync {syncLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span>Public demo</span>
          {buildStamp ? <span className="font-mono text-zinc-400">{buildStamp.slice(0, 7)}</span> : null}
        </div>
      </div>
    </footer>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="sticky top-0 z-40">
        <LiveTickerStrip />
        <Nav />
        {usesWorkspaceShell ? <AppTabStrip /> : null}
      </div>
      {usesWorkspaceShell ? (
        <>
          <div className="mx-auto max-w-[1480px] px-4 py-5 pb-20 sm:px-6 xl:px-8">
            <div className="min-w-0">{children}</div>
          </div>
          {footer}
        </>
      ) : (
        <>
          {children}
          {footer}
        </>
      )}
    </div>
  );
}
