import assert from "node:assert/strict";
import test from "node:test";
import { composeTradeIdeas } from "./tradeIdeas.ts";
import type { DailySetup } from "./dailySetup.ts";
import type { PositioningStressAlert } from "./crowding.ts";
import type { TrackRecordCell } from "./crowdingHistory.ts";

const NOW = 1_790_000_000_000;

const trackRecordCell: TrackRecordCell = {
  n: 84,
  meanNetPct: 1.11,
  medianNetPct: 0.69,
  hitRate: 0.571,
  positiveMonths: 5,
  totalMonths: 5,
};

function makeAlert(overrides: Partial<PositioningStressAlert> = {}): PositioningStressAlert {
  return {
    asset: "SOL",
    displayName: "SOL",
    category: "Majors" as PositioningStressAlert["category"],
    side: "longs_crowded",
    severity: "high",
    status: "actionable_watch",
    score: 70,
    label: "Crowded long unwind",
    decision: "Do not chase long.",
    fundingApr: 85,
    fundingPercentile: 92,
    fundingMeanApr: 30,
    openInterestUsd: 300_000_000,
    oiChangePct: null,
    priceChange24h: -3.2,
    volume24hUsd: 500_000_000,
    volumeVsAvg: null,
    markPx: 150,
    triggerLevel: 147,
    invalidationLevel: 154,
    oiRegime: "stale_carry",
    components: {
      fundingStress: 40,
      fundingPersistence: 10,
      oiPressure: 4,
      priceConfirmation: 16,
      volumeConfirmation: 0,
      categoryRisk: 0,
    },
    evidence: ["Longs paying +85% APR.", "Funding sits in the 92nd percentile.", "24h price move -3.2%."],
    missingData: [],
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSetup(overrides: Partial<DailySetup> = {}): DailySetup {
  return {
    coin: "ETH",
    side: "short",
    title: "ETH crowded-long fade watch",
    status: "watch",
    markPx: 4000,
    fundingApr: 45,
    fundingZ7d: 2.1,
    priceChange24h: 5,
    openInterestUsd: 900_000_000,
    volume24hUsd: 2_000_000_000,
    trigger: 3900,
    invalidation: 4100,
    target: 3600,
    maxHoldHours: 48,
    score: 10,
    rationale: ["Positive funding is high at +45%.", "Fade only after a breakdown."],
    guardrails: ["No averaging if price reclaims invalidation."],
    sentimentAlignment: "none",
    decisionLabel: "Funding short watch",
    socialContext: { label: "", note: "", bullishCount: 0, bearishCount: 0, neutralCount: 0, caveat: "" },
    topTakes: [],
    ...overrides,
  };
}

test("actionable high crowding alert becomes a conviction-A idea with track record", () => {
  const payload = composeTradeIdeas({ setups: [], crowdingAlerts: [makeAlert()], trackRecordCell, now: NOW });
  assert.equal(payload.ideas.length, 1);
  const [idea] = payload.ideas;
  assert.equal(idea.conviction, "A");
  assert.equal(idea.side, "short");
  assert.equal(idea.source, "crowding");
  assert.ok(idea.trackRecordNote?.includes("84 events"));
  assert.ok(idea.trigger != null && idea.invalidation != null);
  assert.equal(payload.standAside, false);
});

test("medium severity crowding alerts are excluded (backtest showed no edge)", () => {
  const payload = composeTradeIdeas({
    setups: [],
    crowdingAlerts: [makeAlert({ severity: "medium", score: 50 })],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 0);
  assert.equal(payload.standAside, true);
});

test("watch-only high alert is conviction B without a track-record claim", () => {
  const payload = composeTradeIdeas({
    setups: [],
    crowdingAlerts: [makeAlert({ status: "watch_only" })],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas[0]?.conviction, "B");
  assert.equal(payload.ideas[0]?.trackRecordNote, null);
});

test("same coin, same side from both families merges into one conviction-A combined idea", () => {
  const payload = composeTradeIdeas({
    setups: [makeSetup({ coin: "SOL", trigger: 146, invalidation: 155, target: 132 })],
    crowdingAlerts: [makeAlert()],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 1);
  const [idea] = payload.ideas;
  assert.equal(idea.source, "combined");
  assert.equal(idea.conviction, "A");
  assert.equal(idea.target, 132, "combined idea keeps the setup's sharper levels");
  assert.ok(idea.trackRecordNote != null);
});

test("watch_only crowding + same-coin setup merges to B, not A", () => {
  const payload = composeTradeIdeas({
    setups: [makeSetup({ coin: "SOL", trigger: 146, invalidation: 155, target: 132 })],
    crowdingAlerts: [makeAlert({ status: "watch_only" })],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 1);
  assert.equal(payload.ideas[0].source, "combined");
  assert.equal(payload.ideas[0].conviction, "B", "unconfirmed crowding must not mint an A");
  assert.equal(payload.ideas[0].trackRecordNote, null);
});

test("conflicting sides on the same coin: crowding wins and the setup is dropped", () => {
  const payload = composeTradeIdeas({
    setups: [makeSetup({ coin: "SOL", side: "long", trigger: 152, invalidation: 145, target: 165 })],
    crowdingAlerts: [makeAlert()],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 1);
  assert.equal(payload.ideas[0].source, "crowding");
  assert.equal(payload.ideas[0].side, "short");
});

test("ranking is conviction-first and capped at three", () => {
  const payload = composeTradeIdeas({
    setups: [
      makeSetup({ coin: "ETH", score: 12 }),
      makeSetup({ coin: "TON", score: 9 }),
      makeSetup({ coin: "OP", score: 4 }),
      makeSetup({ coin: "ARB", score: 3 }),
    ],
    crowdingAlerts: [makeAlert()],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 3);
  assert.equal(payload.ideas[0].conviction, "A");
  assert.deepEqual(
    payload.ideas.map((idea) => idea.conviction),
    [...payload.ideas.map((idea) => idea.conviction)].sort((a, b) => "CBA".indexOf(b) - "CBA".indexOf(a)),
  );
});

test("HIP-3 builder-market alerts are excluded (view-only, outside backtest basket)", () => {
  const payload = composeTradeIdeas({
    setups: [],
    crowdingAlerts: [makeAlert({ asset: "xyz:BOT", displayName: "BOT" })],
    trackRecordCell,
    now: NOW,
  });
  assert.equal(payload.ideas.length, 0);
  assert.equal(payload.standAside, true);
});

test("empty inputs produce an explicit stand-aside", () => {
  const payload = composeTradeIdeas({ setups: [], crowdingAlerts: [], trackRecordCell: null, now: NOW });
  assert.equal(payload.standAside, true);
  assert.ok(payload.marketNote.includes("Standing aside"));
});
