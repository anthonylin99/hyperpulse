"use client";

import type { MarketSetupSignal } from "@/lib/tradePlan";

const TONE_CLASS: Record<MarketSetupSignal["tone"], string> = {
  green: "border-emerald-400/40 bg-emerald-500/12 text-emerald-200",
  red: "border-rose-400/40 bg-rose-500/12 text-rose-200",
  amber: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  neutral: "border-zinc-800 bg-zinc-900/65 text-zinc-500",
};

const SHORT_LABEL: Record<MarketSetupSignal["type"], string> = {
  "support-reclaim": "Reclaim",
  "resistance-break": "Breakout",
  "support-break": "Breakdown",
  "near-resistance": "At R",
  "near-support": "At S",
  none: "Wait",
};

function formatSetupLevel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export default function SetupBadge({ setup }: { setup?: MarketSetupSignal | null }) {
  if (!setup) {
    return <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-700">Scan</span>;
  }

  const level = formatSetupLevel(setup.level);

  return (
    <span
      className={`inline-flex min-w-[82px] items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
        TONE_CLASS[setup.tone]
      } ${setup.isActive ? "animate-pulse" : ""}`}
      title={`${setup.label}: ${setup.detail}`}
    >
      {setup.isActive ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {SHORT_LABEL[setup.type]}
      {level ? <span className="font-mono opacity-80">{level}</span> : null}
    </span>
  );
}
