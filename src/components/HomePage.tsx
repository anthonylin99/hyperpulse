"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  BookOpenText,
  BriefcaseBusiness,
  Gauge,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import LandingProductPreview from "@/components/app/LandingProductPreview";
import { SectionEyebrow } from "@/components/trading-ui";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { cn } from "@/lib/format";
import type { TerminalSignal, TerminalSignalsResponse } from "@/types";

type QuickAction = {
  title: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tone: "teal" | "amber" | "sky" | "rose" | "zinc";
};

const ACTION_TONE: Record<QuickAction["tone"], string> = {
  teal: "border-teal-300/20 bg-teal-300/10 text-teal-200",
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  sky: "border-sky-300/20 bg-sky-300/10 text-sky-200",
  rose: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  zinc: "border-zinc-700 bg-zinc-950/70 text-zinc-300",
};

function ageLabel(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "latest";
  const minutes = Math.max(0, ms / 60_000);
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function familyLabel(signal: TerminalSignal) {
  if (signal.family === "momentum_alert") return "Momentum";
  if (signal.family === "market_radar") return "Radar";
  if (signal.family === "reaction_zone") return "Reaction";
  if (signal.family === "top_mover") return "Mover";
  return "Vault";
}

function SignalPreviewRow({ signal }: { signal: TerminalSignal }) {
  const tone =
    signal.severity === "high"
      ? "border-amber-400/20 bg-amber-400/[0.08]"
      : signal.side === "short"
        ? "border-rose-400/20 bg-rose-400/[0.06]"
        : signal.side === "long"
          ? "border-emerald-400/20 bg-emerald-400/[0.06]"
          : "border-zinc-800 bg-zinc-950/55";

  return (
    <Link
      href="/signals"
      className={cn("group block rounded-xl border px-3 py-3 transition hover:border-teal-300/30", tone)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-zinc-100">{signal.asset ?? "VAULT"}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-teal-300/80">{familyLabel(signal)}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{signal.side}</span>
          </div>
          <div className="mt-1 truncate text-sm text-zinc-300">{signal.title}</div>
        </div>
        <div className="shrink-0 font-mono text-[10px] text-zinc-600">{ageLabel(signal.freshnessMs)}</div>
      </div>
    </Link>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  return (
    <Link
      href={action.href}
      className="group rounded-xl border border-zinc-800 bg-[#0b1016] p-4 transition hover:border-teal-300/25 hover:bg-[#0e151d]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-lg border p-2.5", ACTION_TONE[action.tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
      </div>
      <div className="mt-4 text-sm font-semibold text-zinc-100">{action.title}</div>
      <div className="mt-1 text-xs text-zinc-500">{action.label}</div>
    </Link>
  );
}

export default function HomePage() {
  const { isConnected } = useWallet();
  const { assets, lastUpdated } = useMarket();
  const { vaultsEnabled } = useAppConfig();
  const [signals, setSignals] = useState<TerminalSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSignals() {
      try {
        const response = await fetch("/api/signals?limit=6");
        if (!response.ok) return;
        const payload = (await response.json()) as TerminalSignalsResponse;
        if (!cancelled) setSignals(payload.signals);
      } finally {
        if (!cancelled) setSignalsLoading(false);
      }
    }
    loadSignals();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadSignals();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [
      { title: "Markets", label: "Perps, spot, funding", href: "/markets", icon: LineChart, tone: "teal" },
      { title: "Intel", label: "Unified signal feed", href: "/signals", icon: Sparkles, tone: "amber" },
      { title: "Alerts", label: "Momentum blotter", href: "/alerts", icon: Bell, tone: "sky" },
      { title: "Portfolio", label: isConnected ? "Wallet workspace" : "Read-only review", href: "/portfolio", icon: BriefcaseBusiness, tone: "zinc" },
      { title: "Shadow Book", label: "Paper trade review", href: "/portfolio?section=shadow", icon: BookOpenCheck, tone: "teal" },
      { title: "Docs", label: "Methodology", href: "/docs", icon: BookOpenText, tone: "zinc" },
    ];
    if (vaultsEnabled) {
      actions.splice(3, 0, { title: "Vaults", label: "Operator leaderboard", href: "/vaults", icon: Gauge, tone: "rose" });
    }
    return actions;
  }, [isConnected, vaultsEnabled]);

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 pb-20 sm:px-6 xl:px-8">
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#10151b]">
        <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_12%_0%,rgba(45,212,191,0.13),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.08),transparent_30%),#10151b] p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <SectionEyebrow className="text-teal-300">Terminal Lobby</SectionEyebrow>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
                Hyperliquid-native market intelligence.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
                Fast discovery, explainable setup flags, read-only wallet review, and paper execution context in one compact workspace.
              </p>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3 xl:min-w-[520px]">
              <StatusTile label="Tracked assets" value={assets.length ? String(assets.length) : "—"} />
              <StatusTile label="Mode" value="Read-only" tone="green" />
              <StatusTile label="Last sync" value={lastUpdated ? "live" : "waiting"} tone={lastUpdated ? "green" : "amber"} />
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-zinc-800 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-px bg-zinc-800 md:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <QuickActionCard key={action.title} action={action} />
            ))}
          </div>
          <aside className="bg-[#0b1016] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionEyebrow>Recently Flagged</SectionEyebrow>
                <div className="mt-1 text-sm font-semibold text-zinc-100">Setups and watches</div>
              </div>
              <Link href="/signals" className="text-xs text-teal-300 transition hover:text-teal-100">
                Open Intel
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {signalsLoading && signals.length === 0 ? (
                <>
                  <div className="skeleton h-16 rounded-xl" />
                  <div className="skeleton h-16 rounded-xl" />
                  <div className="skeleton h-16 rounded-xl" />
                </>
              ) : signals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/45 px-4 py-8 text-center text-sm text-zinc-500">
                  Intel feed is waiting for source data.
                </div>
              ) : (
                signals.map((signal) => <SignalPreviewRow key={signal.id} signal={signal} />)
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <LandingProductPreview />
        <div className="space-y-5">
          <section className="rounded-2xl border border-zinc-800 bg-[#10151b] p-5">
            <SectionEyebrow className="text-teal-300">Operating posture</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Signals stay explainable.</h2>
            <div className="mt-4 grid gap-3">
              {[
                { icon: ShieldCheck, label: "Read-only by default", body: "Connected wallets are used for review and paper workflows unless trading is explicitly enabled." },
                { icon: Sparkles, label: "Source caveats attached", body: "Each Intel card carries evidence and methodology context instead of pretending a flag is certainty." },
                { icon: RefreshCw, label: "Existing data surfaces", body: "The MVP composes market radar, alerts, reaction levels, top movers, and vault analytics already in HyperPulse." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <Icon className="h-4 w-4 text-teal-300" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function StatusTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "amber" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/65 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg",
          tone === "green" && "text-emerald-300",
          tone === "amber" && "text-amber-300",
          tone === "neutral" && "text-zinc-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}
