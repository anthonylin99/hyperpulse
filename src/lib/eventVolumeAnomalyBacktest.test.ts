import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeEventVolumeAnomaly,
  findRollingVolumeAnomalies,
  type EventBacktestCandle,
} from "./eventVolumeAnomalyBacktest.ts";

const HOUR_MS = 60 * 60 * 1000;

function makeCandles(args: {
  start: number;
  hours: number;
  startPrice?: number;
  volumeUsd?: number;
  shockAt?: number;
  shockVolumeUsd?: number;
  shockMovePct?: number;
}): EventBacktestCandle[] {
  const candles: EventBacktestCandle[] = [];
  let price = args.startPrice ?? 100;
  for (let index = 0; index < args.hours; index += 1) {
    const isShock = index === args.shockAt;
    const open = price;
    const close = isShock ? price * (1 + (args.shockMovePct ?? 0) / 100) : price * 1.001;
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    candles.push({
      time: args.start + index * HOUR_MS,
      open,
      high,
      low,
      close,
      volumeUsd: isShock ? args.shockVolumeUsd ?? 10_000_000 : args.volumeUsd ?? 1_000_000,
    });
    price = close;
  }
  return candles;
}

test("event anomaly scores ZEC-style pre-event sell pressure as high severity", () => {
  const start = Date.UTC(2026, 4, 20);
  const eventTime = start + 9 * 24 * HOUR_MS;
  const candles = makeCandles({
    start,
    hours: 12 * 24,
    startPrice: 650,
    volumeUsd: 8_000_000,
    shockAt: 6 * 24 + 17,
    shockVolumeUsd: 145_000_000,
    shockMovePct: -18,
  });

  const result = analyzeEventVolumeAnomaly("ZEC", "zec-critical-disclosure", eventTime, candles, {
    baselineHours: 5 * 24,
    preEventHours: 72,
    postEventHours: 48,
    minBaselineCandles: 24,
    repeatVolumeMultiple: 4,
  });

  assert.equal(result.side, "sell_pressure");
  assert.equal(result.severity, "high");
  assert.ok((result.preEventVolumeMultiple ?? 0) > 10);
  assert.ok((result.preEventReturnPct ?? 0) < -5);
});

test("event anomaly downgrades volume without directional displacement", () => {
  const start = Date.UTC(2026, 4, 20);
  const eventTime = start + 9 * 24 * HOUR_MS;
  const candles = makeCandles({
    start,
    hours: 12 * 24,
    volumeUsd: 8_000_000,
    shockAt: 6 * 24 + 17,
    shockVolumeUsd: 40_000_000,
    shockMovePct: 0.2,
  });

  const result = analyzeEventVolumeAnomaly("TEST", "benign-news", eventTime, candles, {
    baselineHours: 5 * 24,
    preEventHours: 72,
    postEventHours: 48,
    minBaselineCandles: 24,
    repeatVolumeMultiple: 4,
  });

  assert.notEqual(result.severity, "high");
  assert.ok(result.score < 75);
});

test("rolling scan finds isolated high-volume directional windows with cooldown", () => {
  const start = Date.UTC(2026, 4, 1);
  const candles = makeCandles({
    start,
    hours: 12 * 24,
    volumeUsd: 5_000_000,
    shockAt: 8 * 24,
    shockVolumeUsd: 90_000_000,
    shockMovePct: -8,
  });

  const results = findRollingVolumeAnomalies({
    asset: "ZEC",
    candles,
    baselineHours: 5 * 24,
    windowHours: 4,
    minScore: 70,
    cooldownHours: 12,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].side, "sell_pressure");
  assert.ok(results[0].volumeMultiple > 10);
});
