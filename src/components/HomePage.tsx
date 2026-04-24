"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BarChart3, BookOpenText, BriefcaseBusiness, Layers3, Waves } from "lucide-react";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { useAppConfig } from "@/context/AppConfigContext";
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
  const { whalesEnabled, factorsEnabled } = useAppConfig();
  const { assets } = useMarket();
  const { factors } = useFactors();
  const workspaceCount = 3 + (factorsEnabled ? 1 : 0) + (whalesEnabled ? 1 : 0);
  const capabilities = useMemo(
    () =>
      CAPABILITIES.filter((item) => {
        if (!whalesEnabled && item.title === "Smart Money Tracking") return false;
        if (!factorsEnabled && item.title === "Factor Intelligence") return false;
        return true;
      }),
    [factorsEnabled, whalesEnabled],
  );

  const primaryHref = isConnected ? "/portfolio" : "/markets";

  return (
    <div className="mx-auto max-w-[1480px] space-y-8 px-4 py-8 pb-20 sm:px-6 xl:px-8">
      <section className="grid min-h-[68vh] gap-10 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
        <div className="max-w-2xl xl:pr-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-xs text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Built for Hyperliquid. Designed for edge.
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl xl:text-[5.4rem] xl:leading-[0.96]">
            Real-time intelligence.
            <span className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-200 bg-clip-text text-transparent">
              Smarter perp decisions.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg">
            HyperPulse unifies live market data, portfolio review, and plain-English docs so you can assess the tape without bouncing across tabs.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-400 px-6 py-3.5 text-sm font-medium text-zinc-950 transition hover:bg-teal-300"
            >
              Enter Terminal
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#live-pulse"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-3.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              View Live Pulse
            </Link>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-[#13171f] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Perps monitored</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">{assets.length || "--"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-[#13171f] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                {factorsEnabled ? "Factor baskets" : "Launch mode"}
              </div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">
                {factorsEnabled ? factors.length || "--" : "BETA"}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-[#13171f] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Wallet posture</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">READ</div>
            </div>
          </div>
        </div>

        <div className="relative xl:-mr-6">
          <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.2),transparent_48%)] blur-3xl" />
          <div className="relative scale-[1.01] xl:scale-[1.04]">
            <LandingProductPreview />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {capabilities.map((item) => {
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

      <section id="live-pulse" className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-zinc-800 bg-[#13171f] p-6 xl:p-7">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Product proof</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 xl:text-[2.3rem]">
            One shell. Faster decisions.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
            Markets open with the directory first, portfolio review stays close, and the rest of the product keeps the same compact trading frame.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm text-zinc-400">
            <span className="rounded-full border border-zinc-800 bg-zinc-950/55 px-3 py-1.5">Table-first market scan</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/55 px-3 py-1.5">Read-only wallet review</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/55 px-3 py-1.5">Hyperliquid-native signals</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/55 px-3 py-1.5">Live docs and methodology</span>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-[#13171f] p-6 xl:p-7">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Trust layer</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">Grounded in the actual product</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            The homepage reflects the same shell, data, and workflows you see once you enter the terminal. No fake dashboard shots, no throwaway marketing chrome.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Core workspaces</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">{workspaceCount}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Signals</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">Live</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 sm:col-span-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Methodology</div>
              <div className="mt-2 text-sm leading-7 text-zinc-400">
                Funding signals, portfolio analytics, and market review all map back to the same product system.
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
            <BookOpenText className="h-4 w-4 text-teal-300" />
            <Link href="/docs" className="text-zinc-200 transition hover:text-white">
              Read how signals, portfolio analytics, and risk context are calculated.
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
