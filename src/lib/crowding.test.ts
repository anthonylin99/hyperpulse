import test from "node:test";
import assert from "node:assert/strict";
import { buildPositioningStressAlert, rankPositioningStressAlerts, type FundingPoint } from "./crowding.ts";
import type { MarketAsset } from "../types/index.ts";

function asset(overrides: Partial<MarketAsset> = {}): MarketAsset {
  return {
    coin: "XYZ:SKHX",
    displayName: "SKHX",
    dex: "XYZ",
    marketType: "hip3_perp",
    assetIndex: 1,
    szDecimals: 2,
    markPx: 1600,
    midPx: 1600,
    oraclePx: 1600,
    fundingRate: 0.00018,
    fundingAPR: 157.68,
    openInterest: 100_000_000,
    prevOpenInterest: null,
    oiChangePct: 8,
    dayVolume: 50_000_000,
    prevDayPx: 1690,
    priceChange24h: -5.33,
    signal: {
      label: "Crowded Long",
      tone: "danger",
      description: "test",
      score: 90,
    },
    maxLeverage: 5,
    ...overrides,
  };
}

function fundingHistory(rate: number, count = 24): FundingPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    time: now - (count - index) * 60 * 60 * 1000,
    rate,
  }));
}

test("buildPositioningStressAlert flags expensive longs when funding, OI, and price confirm", () => {
  const alert = buildPositioningStressAlert({
    asset: asset(),
    fundingHistory: fundingHistory(0.00018),
    volumeVsAvg: 1.6,
    now: 1,
  });

  assert.equal(alert.side, "longs_crowded");
  assert.equal(alert.status, "actionable_watch");
  assert.match(alert.label, /Crowded long/);
  assert.match(alert.decision, /Do not chase long/);
  assert.ok(alert.score >= 70);
});

test("buildPositioningStressAlert flags crowded shorts when negative carry squeezes upward", () => {
  const alert = buildPositioningStressAlert({
    asset: asset({
      coin: "PURRDAT",
      displayName: "PURRDAT",
      marketType: "perp",
      fundingRate: -0.00022,
      fundingAPR: -192.72,
      priceChange24h: 7.5,
      prevDayPx: 1488,
      oiChangePct: 5,
    }),
    fundingHistory: fundingHistory(-0.00022),
    now: 1,
  });

  assert.equal(alert.side, "shorts_crowded");
  assert.equal(alert.status, "actionable_watch");
  assert.match(alert.label, /Crowded short/);
  assert.match(alert.decision, /Do not chase short/);
});

test("rankPositioningStressAlerts filters low funding no-edge assets", () => {
  const neutral = buildPositioningStressAlert({
    asset: asset({
      fundingRate: 0.000005,
      fundingAPR: 4.38,
      priceChange24h: 0.4,
      oiChangePct: 0,
    }),
    fundingHistory: fundingHistory(0.000005),
    now: 1,
  });

  assert.equal(neutral.side, "none");
  assert.equal(rankPositioningStressAlerts([neutral]).length, 0);
});
