import type { Signal, SignalType } from "@/types";
import { OI_SPIKE_THRESHOLD_PCT } from "@/lib/constants";

const COLOR_HEX: Record<Signal["color"], string> = {
  red: "#ef4444",
  orange: "#f97316",
  green: "#22c55e",
  gray: "#71717a",
};

export function signalColorHex(color: Signal["color"]): string {
  return COLOR_HEX[color];
}

export function fundingToSignal(
  fundingAPR: number,
  coin: string,
  oiUSD: number = 0,
  oiChangePct: number = 0,
): Signal {
  let type: SignalType;
  let label: string;
  let color: Signal["color"];

  // ETH-only: funding arb when fundingAPR < -10%
  if (coin === "ETH" && fundingAPR < -10) {
    type = "funding-arb";
    label = "Funding Arb";
    color = "green";
  } else if (fundingAPR > 50) {
    type = "extreme-longs";
    label = "Extreme Longs";
    color = "red";
  } else if (fundingAPR > 10) {
    type = "crowded-long";
    label = "Crowded Long";
    color = "orange";
  } else if (fundingAPR < -10) {
    type = "crowded-short";
    label = "Crowded Short";
    color = "orange";
  } else {
    // -5 to +10 range (spec says -5 to +10 neutral; between -10 and -5 falls through to neutral too)
    type = "neutral";
    label = "Neutral";
    color = "gray";
  }

  return { type, label, color, fundingAPR, oiUSD, oiChangePct };
}

export function oiModifier(
  currentOI: number,
  previousOI: number | null
): { label: string; direction: "up" | "down" } | null {
  if (previousOI === null || previousOI === 0) return null;

  const changePct = ((currentOI - previousOI) / previousOI) * 100;

  if (changePct > OI_SPIKE_THRESHOLD_PCT) {
    return { label: "↑ OI surge", direction: "up" };
  }
  if (changePct < -OI_SPIKE_THRESHOLD_PCT) {
    return { label: "↓ OI flush", direction: "down" };
  }
  return null;
}

export function getSignalLabel(
  signal: Signal,
  oiMod: { label: string } | null
): string {
  if (oiMod) {
    return `${oiMod.label} · ${signal.label}`;
  }
  return signal.label;
}
