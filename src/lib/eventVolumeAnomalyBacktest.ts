export type EventAnomalySide = "buy_pressure" | "sell_pressure" | "mixed";
export type EventAnomalySeverity = "high" | "medium" | "low";

export interface EventBacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
}

export interface EventVolumeBacktestConfig {
  baselineHours: number;
  preEventHours: number;
  postEventHours: number;
  minBaselineCandles: number;
  repeatVolumeMultiple: number;
}

export interface EventVolumeAnomalyResult {
  asset: string;
  eventId: string;
  eventTime: number;
  side: EventAnomalySide;
  severity: EventAnomalySeverity;
  score: number;
  baselineHourlyVolumeUsd: number | null;
  preEventMaxHourlyVolumeUsd: number | null;
  preEventVolumeMultiple: number | null;
  preEventReturnPct: number | null;
  preEventRepeatCount: number;
  postEventMaxHourlyVolumeUsd: number | null;
  postEventVolumeMultiple: number | null;
  postEventReturnPct: number | null;
  evidence: string[];
}

export interface RollingAnomalyResult {
  asset: string;
  detectedAt: number;
  side: EventAnomalySide;
  severity: EventAnomalySeverity;
  score: number;
  price: number;
  windowReturnPct: number | null;
  maxHourlyVolumeUsd: number;
  baselineHourlyVolumeUsd: number;
  volumeMultiple: number;
  repeatCount: number;
  forwardReturn1hPct: number | null;
  forwardReturn4hPct: number | null;
  forwardReturn24hPct: number | null;
  sideAdjustedForward4hPct: number | null;
  sideAdjustedForward24hPct: number | null;
  maxFavorable24hPct: number | null;
  maxAdverse24hPct: number | null;
  evidence: string[];
}

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG: EventVolumeBacktestConfig = {
  baselineHours: 7 * 24,
  preEventHours: 72,
  postEventHours: 48,
  minBaselineCandles: 24,
  repeatVolumeMultiple: 4,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function median(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
}

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return null;
  return ((to - from) / from) * 100;
}

function scoped(candles: EventBacktestCandle[], start: number, end: number) {
  return candles.filter((candle) => candle.time >= start && candle.time < end).sort((a, b) => a.time - b.time);
}

function firstOpenToLastClose(candles: EventBacktestCandle[]): number | null {
  if (candles.length < 2) return null;
  return pctChange(candles[0].open, candles[candles.length - 1].close);
}

function maxByVolume(candles: EventBacktestCandle[]): EventBacktestCandle | null {
  if (candles.length === 0) return null;
  return candles.reduce((best, candle) => (candle.volumeUsd > best.volumeUsd ? candle : best), candles[0]);
}

function inferSide(returnPct: number | null, candles: EventBacktestCandle[]): EventAnomalySide {
  if (returnPct != null && returnPct <= -2) return "sell_pressure";
  if (returnPct != null && returnPct >= 2) return "buy_pressure";
  const downHours = candles.filter((candle) => candle.close < candle.open).length;
  const upHours = candles.filter((candle) => candle.close > candle.open).length;
  if (downHours >= upHours + 2) return "sell_pressure";
  if (upHours >= downHours + 2) return "buy_pressure";
  return "mixed";
}

function severityFromScore(score: number): EventAnomalySeverity {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function scoreAnomaly(args: {
  volumeMultiple: number | null;
  returnPct: number | null;
  repeatCount: number;
  side: EventAnomalySide;
}) {
  const volumeMultiple = args.volumeMultiple ?? 0;
  const returnAbs = Math.abs(args.returnPct ?? 0);
  const volumeScore = clamp((volumeMultiple - 2) * 5, 0, 45);
  const returnScore = clamp(returnAbs * 2.5, 0, 28);
  const repeatScore = clamp(args.repeatCount * 6, 0, 18);
  const directionScore = args.side === "mixed" ? 0 : 9;
  return Math.round(clamp(volumeScore + returnScore + repeatScore + directionScore, 0, 100));
}

function formatMultiple(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
}

function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function candleAtOffset(candles: EventBacktestCandle[], index: number, offsetHours: number): EventBacktestCandle | null {
  return candles[index + offsetHours] ?? null;
}

function sideMultiplier(side: EventAnomalySide): number {
  if (side === "sell_pressure") return -1;
  if (side === "buy_pressure") return 1;
  return 0;
}

function sideAdjustedReturn(side: EventAnomalySide, value: number | null): number | null {
  const multiplier = sideMultiplier(side);
  if (multiplier === 0 || value == null || !Number.isFinite(value)) return null;
  return value * multiplier;
}

function forwardPathStats(
  side: EventAnomalySide,
  entryPrice: number,
  futureCandles: EventBacktestCandle[],
): { maxFavorable24hPct: number | null; maxAdverse24hPct: number | null } {
  const multiplier = sideMultiplier(side);
  if (multiplier === 0 || entryPrice <= 0 || futureCandles.length === 0) {
    return { maxFavorable24hPct: null, maxAdverse24hPct: null };
  }
  const sideAdjustedMoves = futureCandles.flatMap((candle) => {
    const highMove = pctChange(entryPrice, candle.high);
    const lowMove = pctChange(entryPrice, candle.low);
    return [highMove == null ? null : highMove * multiplier, lowMove == null ? null : lowMove * multiplier].filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
  });
  if (sideAdjustedMoves.length === 0) return { maxFavorable24hPct: null, maxAdverse24hPct: null };
  return {
    maxFavorable24hPct: Math.max(...sideAdjustedMoves),
    maxAdverse24hPct: Math.min(...sideAdjustedMoves),
  };
}

export function normalizeBacktestCandles(candles: EventBacktestCandle[]): EventBacktestCandle[] {
  return candles
    .filter((candle) =>
      [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volumeUsd].every((value) => Number.isFinite(value)) &&
      candle.time > 0 &&
      candle.open > 0 &&
      candle.high > 0 &&
      candle.low > 0 &&
      candle.close > 0 &&
      candle.volumeUsd >= 0,
    )
    .sort((a, b) => a.time - b.time);
}

export function analyzeEventVolumeAnomaly(
  asset: string,
  eventId: string,
  eventTime: number,
  inputCandles: EventBacktestCandle[],
  config: EventVolumeBacktestConfig = DEFAULT_EVENT_VOLUME_BACKTEST_CONFIG,
): EventVolumeAnomalyResult {
  const candles = normalizeBacktestCandles(inputCandles);
  const preStart = eventTime - config.preEventHours * HOUR_MS;
  const baselineStart = preStart - config.baselineHours * HOUR_MS;
  const baseline = scoped(candles, baselineStart, preStart);
  const fallbackBaseline = scoped(candles, eventTime - (config.baselineHours + config.preEventHours) * HOUR_MS, eventTime).slice(
    0,
    Math.max(config.minBaselineCandles, config.baselineHours),
  );
  const baselineCandles = baseline.length >= config.minBaselineCandles ? baseline : fallbackBaseline;
  const preEvent = scoped(candles, preStart, eventTime);
  const postEvent = scoped(candles, eventTime, eventTime + config.postEventHours * HOUR_MS);
  const baselineHourlyVolumeUsd = median(baselineCandles.map((candle) => candle.volumeUsd));
  const preMax = maxByVolume(preEvent);
  const postMax = maxByVolume(postEvent);
  const preEventVolumeMultiple =
    baselineHourlyVolumeUsd && preMax ? cleanNumber(preMax.volumeUsd / Math.max(baselineHourlyVolumeUsd, 1)) : null;
  const postEventVolumeMultiple =
    baselineHourlyVolumeUsd && postMax ? cleanNumber(postMax.volumeUsd / Math.max(baselineHourlyVolumeUsd, 1)) : null;
  const preEventReturnPct = firstOpenToLastClose(preEvent);
  const postEventReturnPct = firstOpenToLastClose(postEvent);
  const preEventRepeatCount =
    baselineHourlyVolumeUsd == null
      ? 0
      : preEvent.filter((candle) => candle.volumeUsd / Math.max(baselineHourlyVolumeUsd, 1) >= config.repeatVolumeMultiple).length;
  const side = inferSide(preEventReturnPct, preEvent);
  const score = scoreAnomaly({
    volumeMultiple: preEventVolumeMultiple,
    returnPct: preEventReturnPct,
    repeatCount: preEventRepeatCount,
    side,
  });
  const evidence = [
    `Pre-event max hourly volume ${formatMultiple(preEventVolumeMultiple)} baseline.`,
    `Pre-event return ${formatPct(preEventReturnPct)}.`,
    `${preEventRepeatCount} pre-event hours exceeded ${config.repeatVolumeMultiple}x baseline volume.`,
  ];
  if (postEventVolumeMultiple != null) evidence.push(`Post-event max hourly volume ${formatMultiple(postEventVolumeMultiple)} baseline.`);
  if (postEventReturnPct != null) evidence.push(`Post-event return ${formatPct(postEventReturnPct)}.`);

  return {
    asset,
    eventId,
    eventTime,
    side,
    severity: severityFromScore(score),
    score,
    baselineHourlyVolumeUsd,
    preEventMaxHourlyVolumeUsd: preMax?.volumeUsd ?? null,
    preEventVolumeMultiple,
    preEventReturnPct,
    preEventRepeatCount,
    postEventMaxHourlyVolumeUsd: postMax?.volumeUsd ?? null,
    postEventVolumeMultiple,
    postEventReturnPct,
    evidence,
  };
}

export function findRollingVolumeAnomalies(args: {
  asset: string;
  candles: EventBacktestCandle[];
  baselineHours?: number;
  windowHours?: number;
  minScore?: number;
  cooldownHours?: number;
  repeatVolumeMultiple?: number;
}): RollingAnomalyResult[] {
  const candles = normalizeBacktestCandles(args.candles);
  const baselineHours = args.baselineHours ?? 7 * 24;
  const windowHours = args.windowHours ?? 4;
  const minScore = args.minScore ?? 70;
  const cooldownHours = args.cooldownHours ?? 12;
  const repeatVolumeMultiple = args.repeatVolumeMultiple ?? 4;
  const results: RollingAnomalyResult[] = [];
  let lastDetectionAt = 0;

  for (let index = baselineHours + windowHours; index < candles.length; index += 1) {
    const window = candles.slice(index - windowHours + 1, index + 1);
    const baseline = candles.slice(index - windowHours - baselineHours + 1, index - windowHours + 1);
    const baselineHourlyVolumeUsd = median(baseline.map((candle) => candle.volumeUsd));
    if (baselineHourlyVolumeUsd == null || baselineHourlyVolumeUsd <= 0) continue;
    const maxCandle = maxByVolume(window);
    if (!maxCandle) continue;
    const volumeMultiple = maxCandle.volumeUsd / baselineHourlyVolumeUsd;
    const repeatCount = window.filter((candle) => candle.volumeUsd / baselineHourlyVolumeUsd >= repeatVolumeMultiple).length;
    const windowReturnPct = firstOpenToLastClose(window);
    const side = inferSide(windowReturnPct, window);
    const score = scoreAnomaly({ volumeMultiple, returnPct: windowReturnPct, repeatCount, side });
    if (score < minScore) continue;
    if (candles[index].time - lastDetectionAt < cooldownHours * HOUR_MS) continue;
    lastDetectionAt = candles[index].time;
    const entryPrice = candles[index].close;
    const forwardReturn1hPct = pctChange(entryPrice, candleAtOffset(candles, index, 1)?.close ?? NaN);
    const forwardReturn4hPct = pctChange(entryPrice, candleAtOffset(candles, index, 4)?.close ?? NaN);
    const forwardReturn24hPct = pctChange(entryPrice, candleAtOffset(candles, index, 24)?.close ?? NaN);
    const sideAdjustedForward4hPct = sideAdjustedReturn(side, forwardReturn4hPct);
    const sideAdjustedForward24hPct = sideAdjustedReturn(side, forwardReturn24hPct);
    const pathStats = forwardPathStats(side, entryPrice, candles.slice(index + 1, index + 25));

    results.push({
      asset: args.asset,
      detectedAt: candles[index].time,
      side,
      severity: severityFromScore(score),
      score,
      price: entryPrice,
      windowReturnPct,
      maxHourlyVolumeUsd: maxCandle.volumeUsd,
      baselineHourlyVolumeUsd,
      volumeMultiple,
      repeatCount,
      forwardReturn1hPct,
      forwardReturn4hPct,
      forwardReturn24hPct,
      sideAdjustedForward4hPct,
      sideAdjustedForward24hPct,
      maxFavorable24hPct: pathStats.maxFavorable24hPct,
      maxAdverse24hPct: pathStats.maxAdverse24hPct,
      evidence: [
        `Rolling ${windowHours}h max volume ${formatMultiple(volumeMultiple)} baseline.`,
        `Window return ${formatPct(windowReturnPct)}.`,
        `${repeatCount} hours exceeded ${repeatVolumeMultiple}x baseline volume.`,
      ],
    });
  }

  return results;
}
