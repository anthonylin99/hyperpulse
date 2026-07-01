"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  BookOpenText,
  BriefcaseBusiness,
  Gem,
  Gauge,
  Home,
  LineChart,
  Radar,
  Scale,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import BrandLogo from "@/components/brand/BrandLogo";
import WalletConnect from "./WalletConnect";
import { useAppConfig } from "@/context/AppConfigContext";
import { APP_TABS, type AppTabKey } from "@/lib/appTabs";
import { cn } from "@/lib/format";

const TAB_ICONS: Record<AppTabKey, LucideIcon> = {
  home: Home,
  markets: LineChart,
  signals: Sparkles,
  alerts: Bell,
  agent: Bot,
  factors: Scale,
  hype: Gem,
  portfolio: BriefcaseBusiness,
  whales: WalletCards,
  vaults: Gauge,
  docs: BookOpenText,
};

export default function Nav() {
  const pathname = usePathname();
  const { agentDevEnabled, factorsEnabled, vaultsEnabled } = useAppConfig();

  const tabs = APP_TABS.filter((tab) => {
    if (!agentDevEnabled && tab.key === "agent") return false;
    if (!factorsEnabled && tab.key === "factors") return false;
    if (!vaultsEnabled && tab.key === "vaults") return false;
    return true;
  });
  const activeTab =
    tabs.find((tab) =>
      tab.key === "home"
        ? pathname === "/"
        : tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
    ) ?? tabs[0];

  return (
    <>
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-44 flex-col border-r border-teal-300/10 bg-[#070a0d]/95 shadow-[10px_0_40px_rgba(0,0,0,0.28)] backdrop-blur md:flex">
        <div className="flex h-14 items-center border-b border-zinc-900/90 px-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-lg text-teal-200 transition hover:text-teal-100"
            aria-label="HyperPulse home"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-300/15 bg-teal-300/5">
              <BrandLogo compact markClassName="h-7 w-7" textClassName="hidden" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-zinc-600">HyperPulse</span>
              <span className="block truncate text-sm font-semibold text-zinc-100">Setup desk</span>
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 px-2 py-3" aria-label="Primary terminal navigation">
          {tabs.map((tab) => {
            const active = tab.key === "home"
              ? pathname === "/"
              : tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
            const Icon = TAB_ICONS[tab.key] ?? Radar;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                title={tab.label}
                aria-label={tab.label}
                className={cn(
                  "group flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors",
                  active
                    ? "bg-teal-300/12 text-teal-100 shadow-[0_0_0_1px_rgba(45,212,191,0.18)]"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-medium">
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="border-b border-accent/15 bg-[#0a0c10]/92 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
          <Link href="/" className="inline-flex shrink-0 items-center md:hidden">
            <BrandLogo compact markClassName="h-8 w-8" textClassName="h-5" />
          </Link>
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/55 p-2 text-teal-300">
              {(() => {
                const Icon = TAB_ICONS[activeTab.key] ?? Radar;
                return <Icon className="h-4 w-4" />;
              })()}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">HyperPulse Terminal</div>
              <div className="text-sm font-medium text-zinc-100">{activeTab.label}</div>
            </div>
          </div>
          <WalletConnect />
        </div>
      </div>
    </>
  );
}
