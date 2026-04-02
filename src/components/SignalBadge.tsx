"use client";

import type { Signal } from "@/types";
import { signalColorHex } from "@/lib/signals";
import { OI_SPIKE_THRESHOLD_PCT } from "@/lib/constants";

interface SignalBadgeProps {
  signal: Signal;
  oiChangePct: number | null;
}

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
  );
}
