export type WhaleDirectionalBias =
  | "very_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "very_bearish";

export interface WhalePnlWindow {
  pnlUsd: number | null;
  returnPct: number | null;
  volumeUsd: number | null;
}

export interface WhalePositionSlice {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPx: number | null;
  notionalUsd: number;
  unrealizedPnlUsd: number;
  leverage: number | null;
  liquidationPx: number | null;
}

export interface WalletLeaderboardRow {
  rank: number;
  walletAddress: string;
  ageDays: number | null;
  accountValueUsd: number;
  spotValueUsd: number;
  notionalExposureUsd: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  effectiveLeverage: number | null;
  directionalBias: WhaleDirectionalBias;
  directionalLabel: string;
  unrealizedPnlUsd: number;
  pnl: {
    day: WhalePnlWindow;
    week: WhalePnlWindow;
    month: WhalePnlWindow;
    allTime: WhalePnlWindow;
  };
  topPositions: WhalePositionSlice[];
  source: "tracked" | "query" | "env";
  updatedAt: number;
  warnings: string[];
}

export interface WhaleLeaderboardResult {
  wallets: WalletLeaderboardRow[];
  partial: boolean;
  warnings: string[];
  unavailableCount: number;
  generatedAt: number;
  universe: {
    requested: number;
    ranked: number;
    source: "tracked_wallet_sample";
    caveats: string[];
  };
}
