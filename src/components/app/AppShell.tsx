"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import AppTabStrip from "@/components/app/AppTabStrip";
import AppSidebar from "@/components/app/AppSidebar";
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
        <div className="mx-auto max-w-[1520px] px-4 py-6 pb-20 sm:px-6 xl:px-8">
          <div className="grid gap-6 lg:grid-cols-[216px_minmax(0,1fr)] lg:items-start">
            <AppSidebar />
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
