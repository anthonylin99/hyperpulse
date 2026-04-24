"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  CheckCircle2,
  Layers3,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { useFactors } from "@/context/FactorContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { useAppConfig } from "@/context/AppConfigContext";
import LandingProductPreview from "@/components/app/LandingProductPreview";

const CAPABILITIES = [
  {
    title: "Market Pulse",
    description: "Track perp prices, funding rates, and tomorrow bias before entering a trade.",
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
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(45,212,191,0.20),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.13),transparent_32%),linear-gradient(135deg,rgba(6,16,17,0.98),rgba(3,6,10,0.98)_42%,rgba(4,13,12,1))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(ellipse_at_bottom,rgba(20,184,166,0.22),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(125,212,196,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(125,212,196,0.10)_1px,transparent_1px)] [background-size:96px_96px]" />

      <div className="relative mx-auto max-w-[1560px] space-y-8 px-4 py-10 pb-20 sm:px-6 xl:px-8">
        <section className="grid min-h-[calc(100vh-150px)] gap-10 xl:grid-cols-[0.78fr_1.22fr] xl:items-center">
          <div className="max-w-2xl xl:pr-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-zinc-950/55 px-4 py-2 text-xs text-zinc-300 shadow-[0_0_40px_rgba(20,184,166,0.10)] backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
              Built for Hyperliquid. Designed for edge.
            </div>
            <h1 className="mt-7 text-5xl font-semibold tracking-[-0.055em] text-zinc-50 sm:text-6xl xl:text-[5.6rem] xl:leading-[0.93]">
              Real-time
              <br />
              intelligence.
              <span className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-200 bg-clip-text text-transparent">
                Smarter perp decisions.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-zinc-300/82 sm:text-lg">
              Scan funding, track your wallet in read-only mode, and review live exposure without bouncing across tabs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-300 px-6 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_18px_60px_rgba(45,212,191,0.24)] transition hover:bg-teal-200"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/markets"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-950/45 px-6 py-3.5 text-sm font-medium text-zinc-200 backdrop-blur transition hover:border-zinc-500 hover:bg-zinc-900/80"
              >
                Explore Markets
              </Link>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-3">
              {[
                {
                  icon: BarChart3,
                  title: "Market Pulse",
                  body: "Real-time funding, bias, and crowded positioning.",
                },
                {
                  icon: BriefcaseBusiness,
                  title: "Portfolio Edge",
                  body: "Track performance, risk, and open exposures.",
                },
                {
                  icon: ScanLine,
                  title: "Trade Review",
                  body: "Review what moved the needle after each trade.",
                },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className={
                      index > 0
                        ? "border-t border-zinc-800/70 pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
                        : ""
                    }
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 text-teal-200 shadow-[0_0_24px_rgba(45,212,191,0.18)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-zinc-100">{item.title}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative xl:-mr-12">
            <div className="absolute -inset-8 rounded-[46px] bg-[radial-gradient(circle_at_50%_0%,rgba(45,212,191,0.28),transparent_42%)] blur-3xl" />
            <div className="relative origin-center rotate-[0.4deg] rounded-[36px] border border-teal-200/20 bg-zinc-950/35 p-2 shadow-[0_32px_140px_rgba(0,0,0,0.55),0_0_0_1px_rgba(45,212,191,0.06)] backdrop-blur">
              <LandingProductPreview />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-zinc-400">
          {[
            { icon: CheckCircle2, label: "Hyperliquid Native" },
            { icon: CheckCircle2, label: "Real-time Data" },
            { icon: ShieldCheck, label: "Built for Traders" },
            { icon: LockKeyhole, label: "Read-only by Default" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-800/90 bg-zinc-950/55 px-4 py-2 backdrop-blur"
              >
                <Icon className="h-4 w-4 text-teal-300" />
                {item.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative mx-auto max-w-[1480px] space-y-8 px-4 pb-20 sm:px-6 xl:px-8">
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
                <div className="mt-2 font-mono text-3xl text-zinc-100">{assets.length || "--"}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 sm:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Launch Mode</div>
                <div className="mt-2 text-sm leading-7 text-zinc-400">
                  {factorsEnabled
                    ? `${factors.length || "--"} factor baskets available in this environment.`
                    : "Public beta focuses on markets, read-only portfolio review, and docs."}
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
    </div>
  );
}
