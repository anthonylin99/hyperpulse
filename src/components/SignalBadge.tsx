"use client";

import { Info } from "lucide-react";
import type { Signal } from "@/types";
import { signalColorHex } from "@/lib/signals";
import { OI_SPIKE_THRESHOLD_PCT } from "@/lib/constants";

interface SignalBadgeProps {
  signal: Signal;
  oiChangePct: number | null;
}

const SIGNAL_EXPLANATIONS: Record<string, string> = {
  "Funding Arb":
    "Funding is deeply negative, so shorts may be paying longs. This can reward being long if price stays stable or rises.",
  "Crowded Long":
    "Funding is rich and history suggests long positioning is crowded here, so upside may be less attractive or vulnerable to a flush.",
  "Crowded Short":
    "Funding is very negative and history suggests shorts may be overcrowded here, which can set up squeezes or rebounds.",
  "Funding Elevated (trend)":
    "Funding is high, but historically that has tended to confirm trend continuation more than signal a fade.",
  "Funding Elevated (low corr)":
    "Funding is high, but recent history does not show a strong enough funding-to-price relationship to make this very actionable.",
  "Funding Cheap (trend)":
    "Funding is cheap or negative, but historically that has behaved more like trend continuation than a clean contrarian setup.",
  "Funding Cheap (low corr)":
    "Funding is cheap or negative, but the historical relationship to forward returns is weak, so conviction should stay low.",
  Neutral:
    "No strong edge from funding versus recent history. Treat this as informational rather than a trade signal.",
  "Extreme Longs":
    "Funding is extremely positive, which usually means aggressive long positioning and higher squeeze-down risk.",
};

export default function SignalBadge({ signal, oiChangePct }: SignalBadgeProps) {
  const hasOiSurge = oiChangePct !== null && oiChangePct > OI_SPIKE_THRESHOLD_PCT;
  const hasOiFlush = oiChangePct !== null && oiChangePct < -OI_SPIKE_THRESHOLD_PCT;

  const prefix = hasOiSurge
    ? "↑ OI surge · "
    : hasOiFlush
      ? "↓ OI flush · "
      : "";

  const hex = signalColorHex(signal.color);
  const confidence = signal.confidence ?? "low";
  const explanation =
    SIGNAL_EXPLANATIONS[signal.label] ??
    "This label summarizes how current funding compares with recent history and whether that has mattered for forward price moves.";

  const tooltip = [
    signal.fundingPercentile != null
      ? `Funding percentile: ${signal.fundingPercentile.toFixed(0)}%`
      : null,
    signal.correlation != null
      ? `Funding↔24h return corr: ${signal.correlation.toFixed(2)}`
      : null,
    signal.sampleSize != null ? `Samples: ${signal.sampleSize}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <span className="group relative inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
        style={{
          backgroundColor: `${hex}18`,
          color: hex,
        }}
        title={tooltip}
      >
        {prefix}
        {signal.label}
        {signal.confidence && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-900/60 text-[9px] text-zinc-300 border border-zinc-700/70">
            {confidence}
          </span>
        )}
      </span>
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-200"
        aria-label={`Explain ${signal.label}`}
      >
        <Info className="h-3 w-3" />
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 text-[11px] leading-5 text-zinc-300 shadow-xl group-hover:block group-focus-within:block">
        <div className="font-medium text-zinc-100">{signal.label}</div>
        <div className="mt-1">{explanation}</div>
        {tooltip && <div className="mt-2 text-zinc-500">{tooltip}</div>}
      </span>
    </span>
  );
}
