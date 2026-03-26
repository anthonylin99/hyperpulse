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
  crossAccountValue: number;
  isolatedAccountValue: number;
  totalMarginUsed: number;
  withdrawable: number;
  spotUsdcTotal: number;
  spotUsdcHold: number;
  unrealizedPnl: number;
  positions: Position[];
}

// ─── Portfolio Analytics Types ───────────────────────────────────

export interface Fill {
  coin: string;
  side: "A" | "B"; // HL SDK uses A (buy) / B (sell)
  dir: "Open Long" | "Close Long" | "Open Short" | "Close Short";
  px: number;
  sz: number;
  time: number;
  fee: number;
  feeToken: string;
  closedPnl: number;
  crossed: boolean;
  hash: string;
  liquidation: boolean;
  oid: number;
  cloid: string | null;
}

export interface RoundTripTrade {
  id: string;
  coin: string;
  direction: "long" | "short";
  entryPx: number;
  exitPx: number;
  size: number; // in coins
  notional: number; // in USD
  entryTime: number;
  exitTime: number;
  duration: number; // ms
  pnl: number; // USD (closed P&L from fills)
  pnlPct: number; // %
  fees: number;
  fundingPaid: number;
  fills: Fill[];
}

export interface FundingEntry {
  time: number;
  coin: string;
  usdc: number; // payment amount (negative = paid out)
  positionSize: number;
  fundingRate: number;
  nSamples: number;
}

export interface PortfolioStats {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number; // gross profit / gross loss
  payoffRatio: number; // avg win / avg loss (risk/reward)
  kellyCriterion: number; // optimal position size fraction
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number; // as decimal (0.22 = 22%)
  maxDrawdownPeriod: { start: number; end: number } | null;
  calmarRatio: number;
  recoveryFactor: number; // net profit / max drawdown (absolute)
  avgWinDuration: number; // ms — how long winning trades last
  avgLossDuration: number; // ms — how long losing trades last
  avgTradeDuration: number; // ms
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  totalFeesPaid: number;
  totalFundingNet: number;
  bestTrade: RoundTripTrade | null;
  worstTrade: RoundTripTrade | null;
  longestWinStreak: number;
  longestLoseStreak: number;
  expectancy: number; // avg P&L per trade
  largestWin: number;
  largestLoss: number;
  avgRMultiple: number; // avg trade P&L / avg loss (how many "R" per trade)
}

export interface AssetBreakdown {
  coin: string;
  trades: number;
  pnl: number;
  winRate: number;
  avgHoldTime: number; // ms
  totalVolume: number; // notional USD
}

export interface HourlyBreakdown {
  hour: number; // 0-23
  trades: number;
  pnl: number;
  winRate: number;
}

export interface DailyBreakdown {
  day: number; // 0=Sun, 6=Sat
  dayName: string;
  trades: number;
  pnl: number;
  winRate: number;
}

export interface Insight {
  type: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
  metric?: string;
  value?: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number; // 0 to -1 (percentage from peak)
}

// ─── Activity Types ─────────────────────────────────────────────

export type ActivityType = "liquidation" | "whale" | "oi-spike";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  coin: string;
  timestamp: number;
  notional?: number;
  count?: number;
}
