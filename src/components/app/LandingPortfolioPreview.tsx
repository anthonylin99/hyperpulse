"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";

const EQUITY_POINTS = [42, 43, 45, 48, 47, 50, 54, 57, 55, 60, 64, 62, 66, 71];

function ChartPath(points: number[]) {
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * 100;
      const y = 100 - point;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

export default function LandingPortfolioPreview() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-zinc-800 bg-[#10141a] shadow-[0_0_0_1px_rgba(45,212,191,0.04)]">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#131923] px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Portfolio Review</div>
          <div className="mt-1 text-sm font-medium text-zinc-100">Chart-first trading workspace</div>
        </div>
        <BriefcaseBusiness className="h-4 w-4 text-teal-300" />
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {([
            ["01 Overview", true],
            ["02 Positions", false],
            ["03 Journal", false],
            ["04 Details", false],
          ] as Array<[string, boolean]>).map(([label, active]) => (
            <div
              key={label}
              className={`rounded-xl px-3 py-2 text-xs font-medium ${active ? "border border-teal-500/30 bg-teal-500/10 text-zinc-50" : "border border-zinc-800 bg-zinc-950/70 text-zinc-500"}`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Portfolio Performance</div>
                <div className="mt-2 font-mono text-3xl text-zinc-100">+$559.40</div>
                <div className="mt-1 text-sm text-emerald-300">+63.3% over 30D</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Win Rate</div>
                <div className="mt-1 font-mono text-xl text-zinc-100">63.3%</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-[#0c1014] p-4">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full">
                <defs>
                  <linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(45,212,191,0.35)" />
                    <stop offset="100%" stopColor="rgba(45,212,191,0.02)" />
                  </linearGradient>
                </defs>
                <path d={`${ChartPath(EQUITY_POINTS)} L100,100 L0,100 Z`} fill="url(#portfolio-fill)" />
                <path d={ChartPath(EQUITY_POINTS)} fill="none" stroke="#5eead4" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-500">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-300" /> Account Equity</span>
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-zinc-400" /> Realized P&L</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Open Positions</div>
              <div className="mt-2 font-mono text-3xl text-zinc-100">5</div>
              <div className="mt-1 text-sm text-zinc-400">Live exposure across BTC, ETH, HYPE, and SOL.</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Trade Journal</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                  <span className="text-zinc-200">HYPE long</span>
                  <span className="font-mono text-emerald-300">+$64.47</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                  <span className="text-zinc-200">BTC long</span>
                  <span className="font-mono text-emerald-300">+$121.10</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                  <span className="text-zinc-200">ARB long</span>
                  <span className="font-mono text-rose-300">-$9.12</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100">
            Open Portfolio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
