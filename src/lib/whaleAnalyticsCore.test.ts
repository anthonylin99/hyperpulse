import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWalletLeaderboardRow,
  directionalBiasFromExposure,
  parseWhaleAddressList,
} from "./whaleAnalyticsCore.ts";

const WALLET = "0x0000000000000000000000000000000000000001";

test("parseWhaleAddressList keeps exact wallet matches and dedupes", () => {
  assert.deepEqual(
    parseWhaleAddressList(`${WALLET},bad,${WALLET.toUpperCase()}`),
    [WALLET],
  );
});

test("directionalBiasFromExposure labels long, short, mixed, and empty books", () => {
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 100, shortNotionalUsd: 0 }), "very_bullish");
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 65, shortNotionalUsd: 35 }), "bullish");
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 50, shortNotionalUsd: 50 }), "neutral");
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 35, shortNotionalUsd: 65 }), "bearish");
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 0, shortNotionalUsd: 100 }), "very_bearish");
  assert.equal(directionalBiasFromExposure({ longNotionalUsd: 0, shortNotionalUsd: 0 }), "neutral");
});

test("buildWalletLeaderboardRow computes leverage, exposure, age, and PnL windows", () => {
  const now = Date.UTC(2026, 5, 18);
  const row = buildWalletLeaderboardRow({
    walletAddress: WALLET,
    source: "query",
    firstSeenAt: now - 10 * 24 * 60 * 60 * 1000,
    now,
    clearinghouseState: {
      time: now,
      marginSummary: { accountValue: "1000", totalNtlPos: "3000" },
      assetPositions: [
        {
          type: "oneWay",
          position: {
            coin: "BTC",
            szi: "0.1",
            entryPx: "100000",
            positionValue: "2000",
            unrealizedPnl: "50",
            leverage: { type: "cross", value: 5 },
          },
        },
        {
          type: "oneWay",
          position: {
            coin: "ETH",
            szi: "-0.5",
            entryPx: "3000",
            positionValue: "1000",
            unrealizedPnl: "-25",
            leverage: { type: "cross", value: 3 },
          },
        },
      ],
    },
    spotState: { balances: [{ coin: "USDC", total: "125" }] },
    portfolio: [
      ["day", { pnlHistory: [[now, "100"]], accountValueHistory: [[now, "1100"]], vlm: "5000" }],
      ["week", { pnlHistory: [[now, "-50"]], accountValueHistory: [[now, "950"]], vlm: "10000" }],
    ],
  });

  assert.equal(row.ageDays, 10);
  assert.equal(row.accountValueUsd, 1000);
  assert.equal(row.spotValueUsd, 125);
  assert.equal(row.notionalExposureUsd, 3000);
  assert.equal(row.longNotionalUsd, 2000);
  assert.equal(row.shortNotionalUsd, 1000);
  assert.equal(row.effectiveLeverage, 3);
  assert.equal(row.directionalBias, "bullish");
  assert.equal(row.unrealizedPnlUsd, 25);
  assert.equal(row.pnl.day.pnlUsd, 100);
  assert.equal(row.pnl.week.pnlUsd, -50);
  assert.equal(row.topPositions[0].coin, "BTC");
});
