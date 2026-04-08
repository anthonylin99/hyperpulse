"use client";

import { ArrowRight, BarChart3, BookOpenText, BriefcaseBusiness, Layers3 } from "lucide-react";
import { cn } from "@/lib/format";
import MarketOverviewPanel from "./MarketOverviewPanel";

type Tab = "home" | "portfolio" | "markets" | "factors" | "docs";

interface HomePageProps {
  onSelectTab: (tab: Exclude<Tab, "home">) => void;
}

const MODE_CARDS: Array<{
  tab: Exclude<Tab, "home">;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
}> = [
  {
    tab: "portfolio",
    title: "Portfolio",
    description: "Journal your Hyperliquid account, review trade quality, and inspect P&L structure.",
    icon: BriefcaseBusiness,
  },
  {
    tab: "markets",
    title: "Markets",
    description: "Monitor perp markets, funding, open interest, and short-horizon market context in one surface.",
    icon: BarChart3,
  },
  {
    tab: "factors",
    title: "Factors",
    description: "Track Artemis-style factor baskets, mapped names, and constituent performance in real time.",
    icon: Layers3,
  },
  {
    tab: "docs",
    title: "Docs",
    description: "See how HyperPulse calculates portfolio analytics, factor views, and market signals.",
    icon: BookOpenText,
  },
];

export default function HomePage({ onSelectTab }: HomePageProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),linear-gradient(180deg,rgba(18,24,27,0.96),rgba(10,10,10,0.98))] p-6 md:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-teal-400/80">HyperPulse</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
              Hyperliquid market intelligence with a cleaner command center.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 md:text-base">
              Use Home as your launch surface, then jump into Portfolio, Markets, Factors, or Docs with a more conventional app flow. The goal is fast orientation without the cramped widget stack.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Modes</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-100">4 active views</div>
              <div className="mt-2 text-sm text-zinc-400">Portfolio, Markets, Factors, and Docs all sit inside one app shell now.</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Focus</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-100">Readable first</div>
              <div className="mt-2 text-sm text-zinc-400">Bigger navigation, integrated market context, and less visual fragmentation.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MODE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.tab}
              onClick={() => onSelectTab(card.tab)}
              className={cn(
                "group rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5 text-left transition-all hover:border-teal-400/30 hover:bg-zinc-900 hover:shadow-[0_0_0_1px_rgba(45,212,191,0.08)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5 text-teal-300">
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-zinc-100">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{card.description}</p>
            </button>
          );
        })}
      </section>

      <MarketOverviewPanel
        title="Live market context"
        description="A larger integrated snapshot of tomorrow bias, factor regime, and benchmark perps before you drill into any single mode."
      />
    </div>
  );
}
