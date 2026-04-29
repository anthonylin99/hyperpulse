"use client";

import type { MarketSetupSignal } from "@/lib/tradePlan";

const TONE_CLASS: Record<MarketSetupSignal["tone"], string> = {
  green: "border-emerald-400/40 bg-emerald-500/12 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.16)]",
  red: "border-rose-400/40 bg-rose-500/12 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.14)]",
  amber: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  neutral: "border-zinc-800 bg-zinc-900/65 text-zinc-500",
};

export default function SetupBadge({ setup }: { setup?: MarketSetupSignal | null }) {
  if (!setup) {
    return <span className="text-zinc-700">Scanning...</span>;
  }

  return (
    <div className="flex min-w-[190px] items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
          TONE_CLASS[setup.tone]
        } ${setup.isActive ? "animate-pulse" : ""}`}
        title={setup.detail}
      >
        {setup.isActive ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
        {setup.label}
      </span>
      <span className="truncate text-[10px] text-zinc-500">{setup.detail}</span>
    </div>
  );
}
