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

export interface FundingHistoryPoint {
  time: number;
  rate: number;
}

export interface CandlePoint {
  time: number;
  close: number;
}

export function fundingToSignal(
  fundingAPR: number,
  coin: string,
  oiUSD: number = 0,
  oiChangePct: number = 0,
): Signal {
  let type: SignalType = "neutral";
  let label = "Neutral";
  let color: Signal["color"] = "gray";

  // Fallback simple heuristic if we don't have historical signal data.
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
  }

  return { type, label, color, fundingAPR, oiUSD, oiChangePct };
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) {
    if (v <= value) count += 1;
  }
  return (count / sorted.length) * 100;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function findClosestClose(
  candles: CandlePoint[],
  time: number,
  maxDeltaMs: number,
): number | null {
  if (candles.length === 0) return null;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = candles[mid].time;
    if (t === time) return candles[mid].close;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }

  const candidates: CandlePoint[] = [];
  if (hi >= 0) candidates.push(candles[hi]);
  if (lo < candles.length) candidates.push(candles[lo]);
  let best: CandlePoint | null = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const delta = Math.abs(c.time - time);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta > maxDeltaMs) return null;
  return best.close;
}

function confidenceFrom(sampleSize: number, corrAbs: number | null): Signal["confidence"] {
  if (corrAbs == null) return "low";
  if (sampleSize >= 200 && corrAbs >= 0.35) return "high";
  if (sampleSize >= 100 && corrAbs >= 0.25) return "medium";
  return "low";
}

export function computeFundingSignal(args: {
  coin: string;
  currentFundingAPR: number;
  fundingHistory: FundingHistoryPoint[];
  candles: CandlePoint[];
  horizonHours?: number;
  oiUSD?: number;
  oiChangePct?: number;
}): Signal {
  const {
    coin,
    currentFundingAPR,
    fundingHistory,
    candles,
    horizonHours = 24,
    oiUSD = 0,
    oiChangePct = 0,
  } = args;

  if (fundingHistory.length < 10 || candles.length < 10) {
    return {
      ...fundingToSignal(currentFundingAPR, coin, oiUSD, oiChangePct),
      confidence: "low",
      correlation: null,
      fundingPercentile: null,
      sampleSize: 0,
    };
  }

  const sortedFunding = [...fundingHistory].sort((a, b) => a.time - b.time);
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);

  const fundingAprSeries = sortedFunding.map((f) => f.rate * 8760 * 100);
  const percentile = percentileRank(fundingAprSeries, currentFundingAPR);
  const p90 = quantile(fundingAprSeries, 0.9);
  const p10 = quantile(fundingAprSeries, 0.1);

  const horizonMs = horizonHours * 60 * 60 * 1000;
  const maxDeltaMs = 2 * 60 * 60 * 1000;
  const xs: number[] = [];
  const ys: number[] = [];
  const highBucket: number[] = [];
  const lowBucket: number[] = [];

  for (const entry of sortedFunding) {
    const startClose = findClosestClose(sortedCandles, entry.time, maxDeltaMs);
    const endClose = findClosestClose(sortedCandles, entry.time + horizonMs, maxDeltaMs);
    if (startClose == null || endClose == null) continue;
    const ret = ((endClose - startClose) / startClose) * 100;
    const apr = entry.rate * 8760 * 100;
    xs.push(apr);
    ys.push(ret);
    if (p90 != null && apr >= p90) highBucket.push(ret);
    if (p10 != null && apr <= p10) lowBucket.push(ret);
  }

  const correlation = pearson(xs, ys);
  const corrAbs = correlation == null ? null : Math.abs(correlation);
  const sampleSize = xs.length;
  const confidence = confidenceFrom(sampleSize, corrAbs);

  const avgHigh =
    highBucket.length > 0
      ? highBucket.reduce((s, v) => s + v, 0) / highBucket.length
      : null;
  const avgLow =
    lowBucket.length > 0
      ? lowBucket.reduce((s, v) => s + v, 0) / lowBucket.length
      : null;

  const extremeHigh = percentile != null && percentile >= 90;
  const extremeLow = percentile != null && percentile <= 10;
  const material = corrAbs != null && corrAbs >= 0.2 && sampleSize >= 30;

  let type: SignalType = "neutral";
  let label = "Neutral";
  let color: Signal["color"] = "gray";

  if (extremeHigh) {
    if (material && avgHigh != null && avgHigh < 0) {
      type = "crowded-long";
      label = "Crowded Long";
      color = "orange";
    } else if (material && avgHigh != null && avgHigh > 0) {
      type = "neutral";
      label = "Funding Elevated (trend)";
      color = "orange";
    } else {
      type = "neutral";
      label = "Funding Elevated (low corr)";
      color = "gray";
    }
  } else if (extremeLow) {
    if (material && avgLow != null && avgLow > 0) {
      type = coin === "ETH" && currentFundingAPR < -10 ? "funding-arb" : "crowded-short";
      label = type === "funding-arb" ? "Funding Arb" : "Crowded Short";
      color = type === "funding-arb" ? "green" : "orange";
    } else if (material && avgLow != null && avgLow < 0) {
      type = "neutral";
      label = "Funding Cheap (trend)";
      color = "orange";
    } else {
      type = "neutral";
      label = "Funding Cheap (low corr)";
      color = "gray";
    }
  }

  return {
    type,
    label,
    color,
    fundingAPR: currentFundingAPR,
    oiUSD,
    oiChangePct,
    confidence,
    correlation,
    fundingPercentile: percentile,
    sampleSize,
  };
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
