"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_TABS } from "@/lib/appTabs";
import { cn } from "@/lib/format";
import { useAppConfig } from "@/context/AppConfigContext";

export default function AppTabStrip() {
  const pathname = usePathname();
  const [recentAlertCount, setRecentAlertCount] = useState(0);
  const { agentDevEnabled, factorsEnabled } = useAppConfig();

  useEffect(() => {
    let mounted = true;
    fetch("/api/alerts/momentum?limit=10", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!mounted || !payload?.alerts) return;
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        setRecentAlertCount(payload.alerts.filter((alert: { createdAt?: number }) => Number(alert.createdAt) >= cutoff).length);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  const tabs = APP_TABS.filter((tab) => {
    if (!agentDevEnabled && tab.key === "agent") return false;
    if (!factorsEnabled && tab.key === "factors") return false;
    return true;
  });

  return (
    <div className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur lg:hidden">
      <div className="mx-auto max-w-[1520px] px-4 py-3 sm:px-6 xl:px-8">
        <div className="scrollbar-hide inline-flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5">
          {tabs.map((tab) => {
            const active =
              tab.key === "home"
                ? pathname === "/"
                : tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
                <span className="inline-flex items-center gap-1.5">
                  {tab.label}
                  {tab.key === "alerts" && recentAlertCount > 0 ? (
                    <span className="rounded-full bg-emerald-400 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-950">
                      {recentAlertCount > 9 ? "9+" : recentAlertCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
