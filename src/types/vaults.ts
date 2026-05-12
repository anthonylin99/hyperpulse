// Vault Analytics types. Mirrors @nktkas/hyperliquid `vaultDetails` response,
// plus the derived shapes the UI consumes (list rows, fingerprint, detail payload).

export type VaultPeriod = "day" | "week" | "month" | "allTime";

export interface VaultPortfolioWindow {
  period: VaultPeriod;
  accountValueHistory: Array<[timestamp: number, value: number]>;
  pnlHistory: Array<[timestamp: number, value: number]>;
  vlm: number;
}

export interface VaultFollower {
  user: string;
  vaultEquity: number;
  pnl: number;
  allTimePnl: number;
  daysFollowing: number;
  vaultEntryTime: number;
  lockupUntil: number;
}

export interface VaultDetails {
  vaultAddress: string;
  name: string;
  leader: string;
  description: string;
  apr: number;
  leaderFraction: number;
  leaderCommission: number;
  isClosed: boolean;
  allowDeposits: boolean;
  followers: VaultFollower[];
  portfolio: VaultPortfolioWindow[];
}

export interface VaultMetrics {
  tvl: number;
  tvlChange7dPct: number | null;
  return30dPct: number | null;
  returnAllTimePct: number | null;
  maxDrawdownPct: number | null;
  maxDrawdownAt: number | null;
  maxDrawdownFromEquity: number | null;
  maxDrawdownToEquity: number | null;
  sharpe90d: number | null;
  calmar90d: number | null;
  dailyReturnSamples: number;
  followerCount: number;
  historyDays: number;
}

export interface VaultListItem {
  vaultAddress: string;
  name: string;
  leader: string;
  metrics: VaultMetrics;
}

export interface StrategyAssetSlice {
  coin: string;
  longNotional: number;
  shortNotional: number;
  totalNotional: number;
}

export interface StrategyFingerprint {
  fillCount: number;
  topAssets: StrategyAssetSlice[];
  longShortBias: number | null; // -1..+1
  tradesPerDay: number | null;
  medianHoldTimeMs: number | null;
  topAssetConcentrationPct: number | null;
  sampleWindowDays: number;
}

export interface VaultDetailPayload {
  vault: VaultDetails;
  metrics: VaultMetrics;
  fingerprint: StrategyFingerprint;
  operator: {
    address: string;
    fillCount: number;
    fundingEntryCount: number;
  };
}
