import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStressSeries,
  computeTrackRecord,
  extractStressEvents,
  fadeReturn,
  type HistoryCandle,
  type HistoryFundingPoint,
} from "./crowdingHistory.ts";

const HOUR_MS = 3_600_000;
const START = Date.UTC(2026, 0, 1);

function makeCandles(closes: number[], volume = 1000): HistoryCandle[] {
  return closes.map((close, index) => ({ t: START + index * HOUR_MS, c: close, v: volume }));
}

function makeFunding(rates: number[]): HistoryFundingPoint[] {
  return rates.map((rate, index) => ({ t: START + index * HOUR_MS, rate }));
}

// Hourly funding rates for a 150% and a 2% APR market.
const HOT = 150 / 100 / 8760;
const CALM = 2 / 100 / 8760;

test("buildStressSeries scores a persistent expensive long side above the high threshold", () => {
  const hours = 120;
  // Price drifts down 0.1%/h while longs pay 150% APR the whole time.
  const closes = Array.from({ length: hours }, (_, index) => 100 * (1 - 0.001 * index));
  const rates = Array.from({ length: hours }, () => HOT);
  const series = buildStressSeries(makeCandles(closes), makeFunding(rates));
  assert.equal(series.length, hours);
  const late = series[hours - 1];
  assert.equal(late.side, "longs_crowded");
  assert.ok(late.score >= 62, `expected high-tier score, got ${late.score}`);
  assert.equal(late.actionable, true);
});

test("buildStressSeries stays quiet on calm funding", () => {
  const hours = 120;
  const closes = Array.from({ length: hours }, () => 100);
  const rates = Array.from({ length: hours }, () => CALM);
  const series = buildStressSeries(makeCandles(closes), makeFunding(rates));
  assert.ok(series.every((point) => point.side === "none"));
  assert.ok(series.every((point) => point.score < 46), "calm market must not reach medium tier");
});

test("extractStressEvents enforces the cooldown window", () => {
  const hours = 200;
  const closes = Array.from({ length: hours }, (_, index) => 100 * (1 - 0.001 * index));
  const rates = Array.from({ length: hours }, () => HOT);
  const series = buildStressSeries(makeCandles(closes), makeFunding(rates));
  const events = extractStressEvents(series, 62, 24, false);
  assert.ok(events.length >= 2);
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index].time - events[index - 1].time > 24 * HOUR_MS);
  }
});

test("fadeReturn pays the fader when a crowded long unwinds", () => {
  const hours = 120;
  const closes = Array.from({ length: hours }, (_, index) => 100 * (1 - 0.001 * index));
  const rates = Array.from({ length: hours }, () => HOT);
  const candles = makeCandles(closes);
  const series = buildStressSeries(candles, makeFunding(rates));
  const [event] = extractStressEvents(series, 62, 24, false);
  const net = fadeReturn(event, series, candles, 24);
  assert.ok(net != null);
  // Short fade earns the ~2.4% price drop plus positive carry minus fees.
  assert.ok(net > 0.02, `expected positive fade return, got ${net}`);
});

test("fadeReturn returns null when the horizon runs past the data", () => {
  const hours = 60;
  const closes = Array.from({ length: hours }, () => 100);
  const rates = Array.from({ length: hours }, () => HOT);
  const candles = makeCandles(closes);
  const series = buildStressSeries(candles, makeFunding(rates));
  const lastPoint = series[series.length - 1];
  assert.equal(fadeReturn(lastPoint, series, candles, 24), null);
});

test("computeTrackRecord pools events and reports insufficient cells honestly", () => {
  const hours = 400;
  const closes = Array.from({ length: hours }, (_, index) => 100 * (1 - 0.0005 * index));
  const rates = Array.from({ length: hours }, () => HOT);
  const record = computeTrackRecord(
    [
      { coin: "AAA", candles: makeCandles(closes), funding: makeFunding(rates) },
      { coin: "BBB", candles: makeCandles(closes), funding: makeFunding(rates) },
      { coin: "TOO_SHORT", candles: makeCandles(closes.slice(0, 50)), funding: makeFunding(rates.slice(0, 50)) },
    ],
    { startTime: START, endTime: START + hours * HOUR_MS, windowDays: 17, now: START },
  );
  assert.equal(record.assetCount, 2);
  const cell = record.tiers.high?.["24h"];
  assert.ok(cell && "meanNetPct" in cell, "expected a populated high/24h cell");
  assert.ok(cell.n >= 5);
  assert.ok(record.methodology.includes("Backtest"));
});
