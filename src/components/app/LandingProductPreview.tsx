"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, BriefcaseBusiness } from "lucide-react";
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
    key: "portfolio",
    label: "Portfolio",
    title: "Chart-first wallet review",
    description: "Actual portfolio review surface with the cleaned line chart, calmer labels, and tighter position rows.",
    href: "/portfolio",
    image: "/landing/portfolio-demo.png",
    icon: BriefcaseBusiness,
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
            Real product screenshots
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
              <Image
                src={slide.image}
                alt={`${slide.label} workspace screenshot`}
                fill
                priority={index === 0}
                className="object-cover object-top"
                sizes="(min-width: 1280px) 60vw, 100vw"
              />
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
                "Captured from HyperPulse itself, not a synthetic marketing mock.",
                "Mobile-safe carousel with manual tabs for quick scanning.",
                "Matches the same shell traders land in after the CTA.",
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
