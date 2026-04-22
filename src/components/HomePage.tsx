"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenText, BriefcaseBusiness, Layers3, Waves } from "lucide-react";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import LandingProductPreview from "@/components/app/LandingProductPreview";

const CAPABILITIES = [
  {
    title: "Market Pulse",
    description: "Track perp prices, funding, OI, and tomorrow bias before entering a trade.",
    href: "/markets",
    icon: BarChart3,
  },
  {
    title: "Smart Money Tracking",
    description: "Monitor whale flow, conviction adds, and tracked-book pressure in real time.",
    href: "/whales",
    icon: Waves,
  },
  {
    title: "Factor Intelligence",
    description: "Follow Artemis-style factor baskets and see what regimes are actually leading.",
    href: "/factors",
    icon: Layers3,
  },
  {
    title: "Portfolio Review",
    description: "Analyze positions, journal trades, and keep account performance in one workspace.",
    href: "/portfolio",
    icon: BriefcaseBusiness,
  },
] as const;

export default function HomePage() {
  const { isConnected } = useWallet();
  const { assets, lastUpdated } = useMarket();
  const { factors } = useFactors();

  const primaryHref = isConnected ? "/portfolio" : "/markets";
  const primaryLabel = isConnected ? "Enter Terminal" : "Enter Terminal";

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 pb-24">
      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-xs text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Built for Hyperliquid. Designed for edge.
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl xl:text-7xl">
            Real-time intelligence.
            <span className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-200 bg-clip-text text-transparent">
              Smarter perp decisions.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg">
            HyperPulse unifies live market data, factor regimes, whale activity, and portfolio review so you can see the market before it moves.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-400 px-6 py-3.5 text-sm font-medium text-zinc-950 transition hover:bg-teal-300"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#live-pulse"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-3.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              View Live Pulse
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.2),transparent_45%)] blur-3xl" />
          <div className="relative">
            <LandingProductPreview />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              href={item.href}
              className="group rounded-3xl border border-zinc-800 bg-[#13171f] p-5 transition hover:border-teal-400/30 hover:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-2.5 text-teal-300">
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-zinc-100">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
            </Link>
          );
        })}
      </section>

      <section id="live-pulse" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-zinc-800 bg-[#13171f] p-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Product proof</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
            All the edge. None of the noise.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
            HyperPulse brings together the most important market and wallet signals into one consistent shell so you can scan, decide, and review without bouncing between tools.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Link href="/markets" className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 transition hover:border-zinc-700">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Markets</div>
              <div className="mt-2 text-base font-medium text-zinc-100">Scanner + context</div>
              <div className="mt-2 text-sm leading-6 text-zinc-400">Funding, OI, signal labels, and fast perp navigation in one table-first view.</div>
            </Link>
            <Link href="/portfolio" className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 transition hover:border-zinc-700">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Portfolio</div>
              <div className="mt-2 text-base font-medium text-zinc-100">Review workspace</div>
              <div className="mt-2 text-sm leading-6 text-zinc-400">Chart-first performance review, live positions, and a tighter trade journal.</div>
            </Link>
            <Link href="/whales" className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 transition hover:border-zinc-700">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Whales</div>
              <div className="mt-2 text-base font-medium text-zinc-100">Live tape + dossiers</div>
              <div className="mt-2 text-sm leading-6 text-zinc-400">Profile tracked wallets, inspect pressure, and jump from alert feed into full dossiers.</div>
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-[#13171f] p-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Trust layer</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">Grounded in the actual product</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            The homepage now reflects the same shell, data, and workflows you see once you enter the terminal. No fake dashboard shots, no throwaway marketing chrome.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Perps monitored</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">{assets.length || "--"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Factor baskets</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">{factors.length || "--"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Core workspaces</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">5</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Last sync</div>
              <div className="mt-2 font-mono text-xl text-zinc-100">
                {lastUpdated
                  ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "--:--:--"}
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
            <BookOpenText className="h-4 w-4 text-teal-300" />
            <Link href="/docs" className="text-zinc-200 transition hover:text-white">
              Read how signals, factors, and portfolio analytics are calculated.
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
