"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, BriefcaseBusiness, Gauge, Sparkles } from "lucide-react";
import { cn } from "@/lib/format";

const SLIDES = [
  {
    key: "markets",
    label: "Markets",
    title: "Table-first market scan",
    description: "Real HyperPulse market directory with funding, tape context, and benchmark filters.",
    href: "/markets",
    image: "/landing/markets-demo.png",
    icon: BarChart3,
  },
  {
    key: "intel",
    label: "Intel",
    title: "Best setups first",
    description: "Daily call, radar, momentum flags, reaction levels, movers, and vault watches in one ranked board.",
    href: "/signals",
    image: null,
    icon: Sparkles,
  },
  {
    key: "portfolio",
    label: "Portfolio",
    title: "Chart-first wallet review",
    description: "Wallet tape, fills, funding drag, and position rows built for quick review.",
    href: "/portfolio",
    image: "/landing/portfolio-demo.png",
    icon: BriefcaseBusiness,
  },
  {
    key: "vaults",
    label: "Vaults",
    title: "Operator leaderboard",
    description: "Risk-adjusted vault screening with watch, review, and avoid labels.",
    href: "/vaults",
    image: null,
    icon: Gauge,
  },
] as const;

const AUTO_ADVANCE_MS = 6500;

export default function LandingProductPreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, []);

  const activeSlide = SLIDES[activeIndex];
  const ActiveIcon = activeSlide.icon;

  return (
    <div className="overflow-hidden rounded-[34px] border border-zinc-800 bg-[#0d1218] shadow-[0_0_0_1px_rgba(45,212,191,0.05)]">
      <div className="border-b border-zinc-800 bg-[#0f161d] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 p-1 text-sm">
            {SLIDES.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "rounded-full px-3 py-1.5 transition",
                  index === activeIndex
                    ? "bg-emerald-500/10 text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                    : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                {slide.label}
              </button>
            ))}
          </div>
          <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            Product surfaces
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="relative min-h-[360px] border-b border-zinc-800 bg-black/30 xl:min-h-[640px] xl:border-b-0 xl:border-r">
          {SLIDES.map((slide, index) => (
            <div
              key={slide.key}
              className={cn(
                "absolute inset-0 transition-opacity duration-500",
                index === activeIndex ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              {slide.image ? (
                <Image
                  src={slide.image}
                  alt={`${slide.label} workspace screenshot`}
                  fill
                  priority={index === 0}
                  className="object-cover object-top"
                  sizes="(min-width: 1280px) 60vw, 100vw"
                />
              ) : (
                <SyntheticTerminalPreview label={slide.label} />
              )}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,12,0.04),rgba(5,10,12,0.16)_48%,rgba(5,10,12,0.72))]" />
            </div>
          ))}

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 xl:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-300 backdrop-blur">
              <ActiveIcon className="h-3.5 w-3.5 text-emerald-300" />
              {activeSlide.label}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between bg-[#0b1016] p-5 sm:p-6 xl:p-7">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Preview surface</div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 xl:text-[2rem]">
              {activeSlide.title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-zinc-400">{activeSlide.description}</p>

            <div className="mt-6 grid gap-3">
              {[
                "Signals, markets, wallet review, and vault screening share the same terminal frame.",
                "Intel cards stay read-only and route paper ideas into the Shadow Book.",
                "Future workflow controls can be added without changing the core navigation.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/65 px-4 py-3 text-sm text-zinc-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-2">
              {SLIDES.map((slide, index) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show ${slide.label} screenshot`}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    index === activeIndex ? "w-8 bg-emerald-300" : "w-2.5 bg-zinc-700 hover:bg-zinc-500",
                  )}
                />
              ))}
            </div>
            <Link
              href={activeSlide.href}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/75 px-4 py-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-400/35 hover:bg-zinc-900"
            >
              Open {activeSlide.label}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyntheticTerminalPreview({ label }: { label: string }) {
  const rows =
    label === "Intel"
      ? [
          ["BTC", "Momentum", "high", "+1.8%"],
          ["HYPE", "Reaction", "medium", "0.7% away"],
          ["TAO", "Mover", "high", "+8.2%"],
          ["Vault", "Operator", "watch", "$13.6M"],
        ]
      : [
          ["HyperGrowth", "watch", "21.9%", "$13.6M"],
          ["Hyperrr", "review", "17.9%", "$1.5M"],
          ["drkmttr", "watch", "15.3%", "$5.9M"],
          ["HLT", "review", "13.9%", "$0.7M"],
        ];

  return (
    <div className="absolute inset-0 bg-[#070b0f] p-5">
      <div className="grid h-full grid-rows-[auto_1fr] gap-4 rounded-2xl border border-zinc-800 bg-[#0b1016] p-4">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-teal-300">{label}</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">
              {label === "Intel" ? "Recently flagged setups" : "Vault operator shortlist"}
            </div>
          </div>
          <div className="rounded-lg border border-teal-300/20 bg-teal-300/10 px-2.5 py-1 font-mono text-xs text-teal-200">
            LIVE
          </div>
        </div>
        <div className="space-y-3 overflow-hidden">
          {rows.map((row, index) => (
            <div
              key={`${label}-${row[0]}`}
              className="grid grid-cols-[1fr_86px_68px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/65 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-zinc-100">{row[0]}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{row[1]}</div>
              </div>
              <div
                className={cn(
                  "rounded-md border px-2 py-1 text-center text-[10px] uppercase tracking-[0.12em]",
                  index % 2 === 0
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                    : "border-sky-400/25 bg-sky-400/10 text-sky-200",
                )}
              >
                {row[2]}
              </div>
              <div className="text-right font-mono text-xs text-teal-200">{row[3]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
