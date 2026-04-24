import type { SupportResistanceLevel } from "@/types";

export type ChartInterval = "5m" | "15m" | "1h" | "4h" | "1d";

export type LevelCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Period = "day" | "week" | "month";

function periodForInterval(interval: ChartInterval): Period {
  if (interval === "5m" || interval === "15m") return "day";
  if (interval === "1h" || interval === "4h") return "week";
  return "month";
}

function periodKey(timestampSeconds: number, period: Period): string {
  const date = new Date(timestampSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (period === "month") {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }

  if (period === "week") {
    const utc = Date.UTC(year, month, day);
    const weekDate = new Date(utc);
    const dayOfWeek = weekDate.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekDate.setUTCDate(weekDate.getUTCDate() + mondayOffset);
    return weekDate.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function previousCompletedPeriod(candles: LevelCandle[], interval: ChartInterval): LevelCandle[] {
  const period = periodForInterval(interval);
  const grouped = new Map<string, LevelCandle[]>();

  for (const candle of candles) {
    const key = periodKey(candle.time, period);
    const current = grouped.get(key) ?? [];
    current.push(candle);
    grouped.set(key, current);
  }

  const periods = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (periods.length < 2) return [];
  return periods[periods.length - 2][1];
}

function averageTrueRange(candles: LevelCandle[], length = 14): number {
  const scoped = candles.slice(-length);
  if (scoped.length === 0) return 0;
  return scoped.reduce((sum, candle) => sum + Math.max(candle.high - candle.low, 0), 0) / scoped.length;
}

function buildTraditionalPivots(candles: LevelCandle[], interval: ChartInterval): SupportResistanceLevel[] {
  const previous = previousCompletedPeriod(candles, interval);
  if (previous.length === 0) return [];

  const prevHigh = Math.max(...previous.map((candle) => candle.high));
  const prevLow = Math.min(...previous.map((candle) => candle.low));
  const prevClose = previous[previous.length - 1].close;
  if (!Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || !Number.isFinite(prevClose)) return [];

  const pivot = (prevHigh + prevLow + prevClose) / 3;
  const range = prevHigh - prevLow;

  const raw = [
    { label: "P", kind: "pivot" as const, price: pivot },
    { label: "S1", kind: "support" as const, price: pivot * 2 - prevHigh },
    { label: "S2", kind: "support" as const, price: pivot - range },
    { label: "S3", kind: "support" as const, price: pivot * 2 - (2 * prevHigh - prevLow) },
    { label: "R1", kind: "resistance" as const, price: pivot * 2 - prevLow },
    { label: "R2", kind: "resistance" as const, price: pivot + range },
    { label: "R3", kind: "resistance" as const, price: pivot * 2 + (prevHigh - 2 * prevLow) },
  ];

  return raw
    .filter((level) => Number.isFinite(level.price) && level.price > 0)
    .map((level) => ({
      id: `traditional-${interval}-${level.label}`,
      source: "traditional_pivot",
      strength: level.label === "P" ? 3 : 2,
      ...level,
    }));
}

function isPivotHigh(candles: LevelCandle[], index: number, lookback: number): boolean {
  const high = candles[index].high;
  for (let offset = 1; offset <= lookback; offset += 1) {
    if (candles[index - offset].high >= high || candles[index + offset].high >= high) return false;
  }
  return true;
}

function isPivotLow(candles: LevelCandle[], index: number, lookback: number): boolean {
  const low = candles[index].low;
  for (let offset = 1; offset <= lookback; offset += 1) {
    if (candles[index - offset].low <= low || candles[index + offset].low <= low) return false;
  }
  return true;
}

function buildSwingLevels(candles: LevelCandle[], interval: ChartInterval, currentPrice: number): SupportResistanceLevel[] {
  const lookback = interval === "5m" || interval === "15m" ? 4 : 3;
  if (candles.length < lookback * 2 + 5) return [];

  const atr = averageTrueRange(candles);
  const tolerance = Math.max(currentPrice * 0.0015, atr * 0.35);
  const pivots: Array<{ price: number; kind: "support" | "resistance"; time: number }> = [];

  for (let index = lookback; index < candles.length - lookback; index += 1) {
    if (isPivotHigh(candles, index, lookback)) {
      pivots.push({ price: candles[index].high, kind: "resistance", time: candles[index].time });
    }
    if (isPivotLow(candles, index, lookback)) {
      pivots.push({ price: candles[index].low, kind: "support", time: candles[index].time });
    }
  }

  const clusters: Array<{ price: number; kind: "support" | "resistance"; touches: number; lastTime: number }> = [];

  for (const pivot of pivots) {
    const match = clusters.find(
      (cluster) => cluster.kind === pivot.kind && Math.abs(cluster.price - pivot.price) <= tolerance,
    );

    if (!match) {
      clusters.push({ ...pivot, touches: 1, lastTime: pivot.time });
      continue;
    }

    match.price = (match.price * match.touches + pivot.price) / (match.touches + 1);
    match.touches += 1;
    match.lastTime = Math.max(match.lastTime, pivot.time);
  }

  return clusters
    .map((cluster) => {
      const recency = cluster.lastTime / Math.max(candles[candles.length - 1].time, 1);
      return {
        id: `swing-${cluster.kind}-${cluster.price.toFixed(4)}`,
        label: cluster.kind === "support" ? "Swing S" : "Swing R",
        kind: cluster.kind,
        source: "swing_pivot" as const,
        price: cluster.price,
        strength: cluster.touches + recency,
        touches: cluster.touches,
      };
    })
    .sort((a, b) => b.strength - a.strength);
}

export function calculateSupportResistanceLevels(
  candles: LevelCandle[],
  interval: ChartInterval,
): SupportResistanceLevel[] {
  if (candles.length < 10) return [];

  const currentPrice = candles[candles.length - 1].close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const pivots = buildTraditionalPivots(candles, interval);
  const swings = buildSwingLevels(candles, interval, currentPrice);

  const nearestSwingSupports = swings
    .filter((level) => level.kind === "support" && level.price < currentPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 2);
  const nearestSwingResistances = swings
    .filter((level) => level.kind === "resistance" && level.price > currentPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 2);

  const combined = [...pivots, ...nearestSwingSupports, ...nearestSwingResistances].map((level) => ({
    ...level,
    distancePct: ((level.price - currentPrice) / currentPrice) * 100,
  }));

  return combined
    .filter((level) => level.kind === "pivot" || Math.abs(level.distancePct ?? 0) <= 25)
    .sort((a, b) => {
      if (a.kind === "pivot") return -1;
      if (b.kind === "pivot") return 1;
      return Math.abs(a.distancePct ?? 0) - Math.abs(b.distancePct ?? 0);
    })
    .slice(0, 9);
}

export function nearestLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
): SupportResistanceLevel | null {
  return (
    levels
      .filter((level) => level.kind === kind)
      .sort((a, b) => Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity))[0] ?? null
  );
}
