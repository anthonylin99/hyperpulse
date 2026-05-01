"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/brand/BrandLogo";
import WalletConnect from "./WalletConnect";
import { useAppConfig } from "@/context/AppConfigContext";
import { APP_TABS } from "@/lib/appTabs";
import { cn } from "@/lib/format";

export default function Nav() {
  const pathname = usePathname();
  const { whalesEnabled } = useAppConfig();

  const tabs = APP_TABS.filter((tab) => {
    if (!whalesEnabled && tab.key === "whales") return false;
    return true;
  });

  return (
    <div className="border-b border-[#7dd4c4]/12 bg-[#0a0c10]/92 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
        <Link href="/" className="inline-flex shrink-0 items-center">
          <BrandLogo compact markClassName="h-8 w-8" textClassName="h-5" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {tabs.map((tab) => {
            const active = tab.key === "home"
              ? pathname === "/"
              : tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-emerald-500/[0.08] text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.14)]"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <WalletConnect />
        </div>
      </div>
    </div>
  );
}
