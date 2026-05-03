"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  House,
  Layers3,
  Shield,
  Waves,
} from "lucide-react";
import BrandLogo from "@/components/brand/BrandLogo";
import { useAppConfig } from "@/context/AppConfigContext";
import { APP_TABS, type AppTabKey } from "@/lib/appTabs";
import { cn } from "@/lib/format";

const TAB_ICONS: Record<AppTabKey, typeof BarChart3> = {
  home: House,
  markets: BarChart3,
  factors: Layers3,
  whales: Waves,
  portfolio: BriefcaseBusiness,
  docs: Shield,
};

const TAB_HELPERS: Record<AppTabKey, string> = {
  home: "Landing + proof",
  markets: "Directory + context",
  factors: "Regime baskets",
  whales: "Tracked flow",
  portfolio: "Review workspace",
  docs: "Methodology",
};

export default function AppSidebar() {
  const pathname = usePathname();
  const { whalesEnabled, factorsEnabled } = useAppConfig();

  const tabs = APP_TABS.filter((tab) => {
    if (!whalesEnabled && tab.key === "whales") return false;
    if (!factorsEnabled && tab.key === "factors") return false;
    return true;
  });

  return (
    <aside className="sticky top-[104px] hidden self-start lg:block">
      <div className="w-[216px] rounded-[28px] border border-zinc-800 bg-[#0c1117]/92 p-4 shadow-[0_0_0_1px_rgba(45,212,191,0.04)]">
        <Link href="/" className="inline-flex">
          <BrandLogo compact markClassName="h-8 w-8" textClassName="text-[22px]" />
        </Link>

        <div className="mt-6 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
          Navigation
        </div>

        <nav className="mt-3 space-y-1.5">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            const active =
              tab.key === "home"
                ? pathname === "/"
                : tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "flex items-start gap-3 rounded-[18px] px-3 py-3 transition-all",
                  active
                    ? "border border-emerald-500/20 bg-emerald-500/[0.08] text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.16)]"
                    : "border border-transparent text-zinc-500 hover:border-zinc-800 hover:bg-zinc-900/80 hover:text-zinc-200",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-emerald-300" : "text-zinc-500")} />
                <div className="min-w-0">
                  <div className="font-mono text-sm">{tab.label}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{TAB_HELPERS[tab.key]}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <BookOpenText className="h-3.5 w-3.5 text-emerald-300" />
            Read-only beta
          </div>
          <div className="mt-2 text-sm leading-6 text-zinc-400">
            Paste a public Hyperliquid wallet and review markets, performance, and journal data without custody risk.
          </div>
        </div>
      </div>
    </aside>
  );
}
