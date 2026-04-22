"use client";

import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import AppTabStrip from "@/components/app/AppTabStrip";
import LiveTickerStrip from "@/components/app/LiveTickerStrip";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="sticky top-0 z-40">
        <LiveTickerStrip />
        <Nav />
        <AppTabStrip />
      </div>
      {children}
    </div>
  );
}
