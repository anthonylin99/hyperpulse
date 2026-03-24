export type SignalType =
  | "extreme-longs"
  | "crowded-long"
  | "neutral"
  | "crowded-short"
  | "funding-arb";

export interface Signal {
  type: SignalType;
  label: string;
  color: 'red' | 'orange' | 'green' | 'gray';
  fundingAPR: number;
  oiUSD: number;
  oiChangePct: number;
}

export interface MarketAsset {
  coin: string;
  assetIndex: number;
  markPx: number;
  midPx: number;
  oraclePx: number;
  fundingRate: number; // raw hourly rate (decimal, e.g. 0.0001 = 0.01%)
  fundingAPR: number; // annualized percentage (e.g. 87.6)
  openInterest: number; // USD
  prevOpenInterest: number | null; // USD, from previous poll
  oiChangePct: number | null; // percent change since last poll
  dayVolume: number; // USD
  prevDayPx: number;
  priceChange24h: number; // percent
  signal: Signal;
  maxLeverage: number;
}

export interface Position {
  coin: string;
  szi: number; // signed size (negative = short)
  entryPx: number;
  markPx: number;
  unrealizedPnl: number;
  marginUsed: number;
  leverage: number;
  liquidationPx: number | null;
  returnOnEquity: number;
}

export interface AccountState {
  accountValue: number;
  totalMarginUsed: number;
  withdrawable: number;
  unrealizedPnl: number;
  positions: Position[];
}

export type ActivityType = "liquidation" | "whale" | "oi-spike";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  coin: string;
  timestamp: number;
  notional?: number;
}
