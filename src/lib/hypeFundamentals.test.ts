import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveHypeFundamentals,
  normalizeHypeStatsPoints,
  type HypeMetricPoint,
  type HypeStatsSnapshot,
} from "./hypeFundamentals.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 21);

function series(values: number[], start = NOW - (values.length - 1) * DAY_MS): HypeMetricPoint[] {
  return values.map((value, index) => ({ time: start + index * DAY_MS, value }));
}

function stats(overrides: Partial<HypeStatsSnapshot>): HypeStatsSnapshot {
  return {
    hypeVolume: series([100, 110, 120, 130, 140, 150, 160, 170]),
    protocolVolume: series([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]),
    hypeOpenInterest: series([1000, 1040, 1080, 1120, 1160, 1200, 1260, 1320]),
    hypeFunding: series([2, 3, 4, 5, 6, 7, 8, 9]),
    ...overrides,
  };
}

test("deriveHypeFundamentals raises confidence when volume share and OI expand", () => {
  const context = deriveHypeFundamentals({
    stats: stats({}),
    live: {
      markPrice: 40,
      prevDayPrice: 39,
      priceChange24hPct: 2.56,
      openInterestUsd: 500_000_000,
      dayVolumeUsd: 200,
      fundingRate: 0.00005,
      fundingApr: 4,
    },
    now: NOW,
  });

  assert.equal(context.regime, "expanding");
  assert.equal(context.confidenceAdjustment, "raise");
  assert.equal(context.levelBias, "breakout_confirm");
});

test("deriveHypeFundamentals lowers confidence when usage and OI cool", () => {
  const context = deriveHypeFundamentals({
    stats: stats({
      hypeVolume: series([250, 230, 210, 190, 170, 150, 130, 110]),
      hypeOpenInterest: series([1500, 1450, 1400, 1320, 1250, 1180, 1110, 1030]),
    }),
    live: {
      markPrice: 35,
      prevDayPrice: 37,
      priceChange24hPct: -5.4,
      openInterestUsd: 350_000_000,
      dayVolumeUsd: 80,
      fundingRate: 0.0002,
      fundingApr: 17.5,
    },
    now: NOW,
  });

  assert.equal(context.regime, "cooling");
  assert.equal(context.confidenceAdjustment, "lower");
  assert.equal(context.levelBias, "resistance_fade");
});

test("deriveHypeFundamentals flags stale official stats", () => {
  const old = Date.UTC(2026, 4, 1);
  const context = deriveHypeFundamentals({
    stats: {
      hypeVolume: series([100, 120], old),
      protocolVolume: series([1000, 1000], old),
      hypeOpenInterest: series([1000, 1100], old),
      hypeFunding: series([3, 4], old),
    },
    live: {
      markPrice: 40,
      prevDayPrice: 40,
      priceChange24hPct: 0,
      openInterestUsd: 400_000_000,
      dayVolumeUsd: 150,
      fundingRate: 0,
      fundingApr: 0,
    },
    now: NOW,
  });

  assert.equal(context.statsStale, true);
  assert.equal(context.confidenceAdjustment, "lower");
  assert.match(context.evidence.join(" "), /stale/i);
});

test("normalizeHypeStatsPoints parses Hyperliquid date strings without truncating to 1970", () => {
  const points = normalizeHypeStatsPoints(
    {
      chart_data: [
        { time: "2026-06-19", coin: "BTC", daily_usd_volume: "100" },
        { time: "2026-06-20", coin: "HYPE", daily_usd_volume: "250" },
      ],
    },
    "daily_usd_volume",
    "HYPE",
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].time, Date.UTC(2026, 5, 20));
  assert.equal(points[0].value, 250);
});
