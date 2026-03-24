export type SignalType =
  | "extreme-longs"
  | "crowded-long"
  | "neutral"
  | "crowded-short"
  | "funding-arb";

export interface Signal {
  type: SignalType;
  label: string;
  color: "red" | "orange" | "green" | "gray";
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
  fundingRate: number;
  fundingAPR: number;
  openInterest: number;
  prevOpenInterest: number | null;
  oiChangePct: number | null;
  dayVolume: number;
  prevDayPx: number;
  priceChange24h: number;
  signal: Signal;
  maxLeverage: number;
}

export type SpotCategory = "Stocks" | "Commodities" | "Crypto" | "Other";

export interface SpotAsset {
  marketIndex: number;
  spotAssetId: number;
  symbol: string;
  name: string;
  market: string;
  markPx: number;
  midPx: number;
  prevDayPx: number;
  priceChange24h: number;
  dayVolume: number;
  circulatingSupply: number;
  totalSupply: number;
  marketCap: number;
  category: SpotCategory;
}

export interface Position {
  coin: string;
  szi: number;
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
