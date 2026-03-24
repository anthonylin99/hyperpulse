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

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: `${hex}18`,
        color: hex,
      }}
    >
      {prefix}
      {signal.label}
    </span>
  );
}
