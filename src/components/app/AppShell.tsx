"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import AppTabStrip from "@/components/app/AppTabStrip";
import LiveTickerStrip from "@/components/app/LiveTickerStrip";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const usesWorkspaceShell =
    pathname === "/markets" ||
    pathname.startsWith("/markets/") ||
    pathname === "/portfolio" ||
    pathname.startsWith("/portfolio/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/factors" ||
    pathname.startsWith("/factors/") ||
    pathname === "/whales" ||
    pathname.startsWith("/whales/");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="sticky top-0 z-40">
        <LiveTickerStrip />
        <Nav />
        {usesWorkspaceShell ? <AppTabStrip /> : null}
      </div>
      {usesWorkspaceShell ? (
        <div className="mx-auto max-w-[1480px] px-4 py-5 pb-20 sm:px-6 xl:px-8">
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
