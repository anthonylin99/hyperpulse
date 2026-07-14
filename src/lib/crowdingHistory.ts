// Offline reconstruction of the positioning-stress score for track-record
// backtests. Mirrors the live scoring in ./crowding.ts with the substitutions
// an offline replay forces: funding percentile comes from the asset's own
// trailing 3-day funding series, volume-vs-average comes from candle volume,
// and the OI component uses the same no-data fallback the live route applies
// when oiChangePct is missing. Offline scores are therefore conservative
// relative to live scores. Keep thresholds in sync with ./crowding.ts.

export type HistoryCandle = { t: number; c: number; v: number };
export type HistoryFundingPoint = { t: number; rate: number };

export type StressPoint = {
  index: number;
  time: number;
  close: number;
  rate: number;
  apr: number;
  side: "longs_crowded" | "shorts_crowded" | "none";
  score: number;
  actionable: boolean;
};

export type TrackRecordCell = {
  n: number;
  meanNetPct: number;
  medianNetPct: number;
  hitRate: number;
  positiveMonths: number;
  totalMonths: number;
};

export type TrackRecord = {
  generatedAt: number;
  startTime: number;
  endTime: number;
  windowDays: number;
  assetCount: number;
  roundTripFeePct: number;
  tiers: Record<string, Record<string, TrackRecordCell | { n: number; note: string }>>;
  baselineLong72hPct: number;
  methodology: string;
};

const HOUR_MS = 3_600_000;
const PERCENTILE_WINDOW = 72;
const PERSISTENCE_WINDOW = 24;
const VOLUME_AVG_WINDOW_HOURS = 24 * 30;
const ROUND_TRIP_FEE = 0.0009;
const ACTIONABLE_MIN_SCORE = 42;

export const TRACK_RECORD_TIERS: Record<string, { threshold: number; requireActionable: boolean }> = {
  medium: { threshold: 46, requireActionable: false },
  high: { threshold: 62, requireActionable: false },
  high_actionable: { threshold: 62, requireActionable: true },
  extreme: { threshold: 78, requireActionable: false },
};

export const TRACK_RECORD_HORIZONS_HOURS = [24, 72];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fundingStressScore(absApr: number, percentile: number | null): number {
  const aprScore = absApr >= 100 ? 32 : absApr >= 50 ? 24 : absApr >= 20 ? 14 : absApr >= 10 ? 8 : 0;
  const percentileScore =
    percentile == null ? 4 : percentile >= 95 || percentile <= 5 ? 16 : percentile >= 80 || percentile <= 20 ? 10 : 0;
  return clamp(aprScore + percentileScore, 0, 42);
}

function persistenceScore(aprHistory: number[], currentApr: number): number {
  if (aprHistory.length === 0) return 0;
  const sign = currentApr >= 0 ? 1 : -1;
  const recent = aprHistory.slice(-PERSISTENCE_WINDOW);
  const elevated = recent.filter((apr) => Math.sign(apr || sign) === sign && Math.abs(apr) >= 20).length;
  return clamp((elevated / recent.length) * 18, 0, 18);
}

function priceConfirmationScore(change24h: number, side: StressPoint["side"]): number {
  if (side === "longs_crowded") {
    if (change24h <= -6) return 22;
    if (change24h <= -2) return 16;
    if (change24h <= 1) return 9;
    if (change24h >= 8) return -8;
  }
  if (side === "shorts_crowded") {
    if (change24h >= 6) return 22;
    if (change24h >= 2) return 16;
    if (change24h >= -1) return 9;
    if (change24h <= -8) return -8;
  }
  return 0;
}

function volumeConfirmationScore(volumeVsAvg: number | null): number {
  if (volumeVsAvg == null || !Number.isFinite(volumeVsAvg)) return 0;
  if (volumeVsAvg >= 2) return 8;
  if (volumeVsAvg >= 1.3) return 5;
  if (volumeVsAvg < 0.7) return -3;
  return 0;
}

export function buildStressSeries(candles: HistoryCandle[], funding: HistoryFundingPoint[]): StressPoint[] {
  const rateByHour = new Map<number, number>();
  for (const point of funding) {
    rateByHour.set(Math.floor(point.t / HOUR_MS) * HOUR_MS, point.rate);
  }
  const series: StressPoint[] = [];
  const aprHistory: number[] = [];
  const volumesUsd = candles.map((candle) => candle.v * candle.c);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const rate = rateByHour.get(candle.t);
    if (rate == null) continue;
    const apr = rate * 8760 * 100;
    const absApr = Math.abs(apr);
    const window = aprHistory.slice(-PERCENTILE_WINDOW);
    const percentile =
      window.length >= 12 ? (100 * window.filter((value) => value <= apr).length) / window.length : null;
    const side: StressPoint["side"] = absApr < 8 ? "none" : apr > 0 ? "longs_crowded" : "shorts_crowded";
    const prior = candles[index - 24];
    const change24h = index >= 24 && prior.c > 0 ? ((candle.c - prior.c) / prior.c) * 100 : 0;
    let volumeVsAvg: number | null = null;
    if (index >= 48) {
      const lookback = volumesUsd.slice(Math.max(0, index - VOLUME_AVG_WINDOW_HOURS), index - 24);
      const average24h = lookback.length > 0 ? (lookback.reduce((sum, v) => sum + v, 0) / lookback.length) * 24 : 0;
      const last24h = volumesUsd.slice(index - 24, index).reduce((sum, v) => sum + v, 0);
      volumeVsAvg = average24h > 0 ? last24h / average24h : null;
    }
    const priceScore = priceConfirmationScore(change24h, side);
    const oiFallback = absApr >= 50 ? 4 : 0;
    const score = clamp(
      fundingStressScore(absApr, percentile) +
        persistenceScore(aprHistory, apr) +
        oiFallback +
        priceScore +
        volumeConfirmationScore(volumeVsAvg),
      0,
      100,
    );
    series.push({
      index,
      time: candle.t,
      close: candle.c,
      rate,
      apr,
      side,
      score,
      actionable: score >= ACTIONABLE_MIN_SCORE && priceScore >= 12,
    });
    aprHistory.push(apr);
  }
  return series;
}

export function extractStressEvents(
  series: StressPoint[],
  threshold: number,
  horizonHours: number,
  requireActionable: boolean,
): StressPoint[] {
  // An event is a fresh crossing: the score must have been below the tier
  // threshold (or the side flat) since the previous event. A regime that
  // simply stays elevated past the cooldown is one event, not many —
  // otherwise long-lived alerts are over-weighted in the track record.
  const events: StressPoint[] = [];
  let cooldownUntil = -1;
  let armed = true;
  for (const point of series) {
    if (point.side === "none" || point.score < threshold) {
      armed = true;
      continue;
    }
    if (!armed || point.time <= cooldownUntil) continue;
    if (requireActionable && !point.actionable) continue;
    events.push(point);
    cooldownUntil = point.time + horizonHours * HOUR_MS;
    armed = false;
  }
  return events;
}

/** Net return of fading the crowded side: price move against the crowd plus
 *  funding carry received, minus round-trip taker fees. Null when the horizon
 *  runs off the end of the data. */
export function fadeReturn(
  event: StressPoint,
  series: StressPoint[],
  candles: HistoryCandle[],
  horizonHours: number,
): number | null {
  const exitIndex = event.index + horizonHours;
  if (exitIndex >= candles.length) return null;
  const priceReturn = (candles[exitIndex].c - candles[event.index].c) / candles[event.index].c;
  const direction = event.side === "longs_crowded" ? -1 : 1;
  let carry = 0;
  for (const point of series) {
    if (point.index < event.index) continue;
    if (point.index >= exitIndex) break;
    carry += point.rate * (direction === -1 ? 1 : -1);
  }
  return direction * priceReturn + carry - ROUND_TRIP_FEE;
}

function monthKey(time: number): string {
  return new Date(time).toISOString().slice(0, 7);
}

export function computeTrackRecord(
  datasets: Array<{ coin: string; candles: HistoryCandle[]; funding: HistoryFundingPoint[] }>,
  args: { startTime: number; endTime: number; windowDays: number; now?: number },
): TrackRecord {
  const seriesByCoin = datasets
    .filter((dataset) => dataset.candles.length >= 200 && dataset.funding.length >= 200)
    .map((dataset) => ({
      coin: dataset.coin,
      candles: dataset.candles,
      series: buildStressSeries(dataset.candles, dataset.funding),
    }));

  const tiers: TrackRecord["tiers"] = {};
  for (const [tierName, tier] of Object.entries(TRACK_RECORD_TIERS)) {
    tiers[tierName] = {};
    for (const horizon of TRACK_RECORD_HORIZONS_HOURS) {
      const pooled: Array<{ net: number; month: string }> = [];
      for (const { candles, series } of seriesByCoin) {
        for (const event of extractStressEvents(series, tier.threshold, horizon, tier.requireActionable)) {
          const net = fadeReturn(event, series, candles, horizon);
          if (net != null) pooled.push({ net, month: monthKey(event.time) });
        }
      }
      if (pooled.length < 5) {
        tiers[tierName][`${horizon}h`] = { n: pooled.length, note: "insufficient events" };
        continue;
      }
      const nets = pooled.map((entry) => entry.net).sort((a, b) => a - b);
      const mean = nets.reduce((sum, value) => sum + value, 0) / nets.length;
      const median =
        nets.length % 2 === 1 ? nets[(nets.length - 1) / 2] : (nets[nets.length / 2 - 1] + nets[nets.length / 2]) / 2;
      const byMonth = new Map<string, number[]>();
      for (const entry of pooled) {
        byMonth.set(entry.month, [...(byMonth.get(entry.month) ?? []), entry.net]);
      }
      let positiveMonths = 0;
      for (const values of byMonth.values()) {
        if (values.reduce((sum, value) => sum + value, 0) / values.length > 0) positiveMonths += 1;
      }
      tiers[tierName][`${horizon}h`] = {
        n: pooled.length,
        meanNetPct: Math.round(mean * 100 * 100) / 100,
        medianNetPct: Math.round(median * 100 * 100) / 100,
        hitRate: Math.round((pooled.filter((entry) => entry.net > 0).length / pooled.length) * 1000) / 1000,
        positiveMonths,
        totalMonths: byMonth.size,
      };
    }
  }

  let baselineSum = 0;
  let baselineCount = 0;
  for (const { candles } of seriesByCoin) {
    for (let index = 0; index + 72 < candles.length; index += 72) {
      baselineSum += (candles[index + 72].c - candles[index].c) / candles[index].c;
      baselineCount += 1;
    }
  }

  return {
    generatedAt: args.now ?? Date.now(),
    startTime: args.startTime,
    endTime: args.endTime,
    windowDays: args.windowDays,
    assetCount: seriesByCoin.length,
    roundTripFeePct: ROUND_TRIP_FEE * 100,
    tiers,
    baselineLong72hPct: baselineCount > 0 ? Math.round((baselineSum / baselineCount) * 100 * 100) / 100 : 0,
    methodology:
      "Backtest, not live results. Score reconstructed hourly from public funding + candles (OI component uses the no-data fallback). Event = a fresh crossing of the tier threshold (score must reset below it between events), cooldown = horizon. Return = fading the crowded side, net of funding carry received and taker fees.",
  };
}
