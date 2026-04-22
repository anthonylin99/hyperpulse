"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_TABS } from "@/lib/appTabs";
import { cn } from "@/lib/format";

export default function AppTabStrip() {
  const pathname = usePathname();

  return (
    <div className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="scrollbar-hide inline-flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5">
          {APP_TABS.map((tab) => {
            const active = tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap",
                  active
                    ? "bg-teal-500/12 text-zinc-50 shadow-[0_0_0_1px_rgba(45,212,191,0.14)]"
                    : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
