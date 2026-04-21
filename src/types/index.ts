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
  confidence?: "high" | "medium" | "low";
  correlation?: number | null;
  fundingPercentile?: number | null;
  sampleSize?: number;
}

export interface MarketAsset {
  coin: string;
  assetIndex: number;
  szDecimals: number;
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
  dir: "Open Long" | "Close Long" | "Open Short" | "Close Short" | "Buy" | "Sell";
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

// ─── Factor Types ───────────────────────────────────────────────

export interface FactorHolding {
  symbol: string;
  weight?: number;
  note?: string;
}

export interface FactorSnapshot {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  methodology: string;
  reportDate: string;
  sourceUrl: string;
  sourceTitle: string;
  narrativeTags: string[];
  constructionType: "long-only" | "long-short";
  coverageNote: string;
  longs: FactorHolding[];
  shorts: FactorHolding[];
}

export interface FactorPerformanceWindow {
  days: number;
  longReturn: number | null;
  shortReturn: number | null;
  spreadReturn: number | null;
}

export interface FactorContributor {
  symbol: string;
  role: "long" | "short";
  returnPct: number;
  contributionPct: number;
  livePrice: number | null;
  liveChange24h: number | null;
  signalLabel?: string;
}

export interface FactorTradeCandidate {
  symbol: string;
  role: "long" | "short";
  thesis: string;
  score: number;
  liveChange24h: number | null;
  fundingAPR: number | null;
  signalLabel: string | null;
  confidence: "high" | "medium" | "low";
  trendStatus: "trend-confirmed" | "watchlist-only";
}

export interface FactorConstituentPerformance {
  symbol: string;
  role: "long" | "short";
  mappedToHyperliquid: boolean;
  latestPrice: number | null;
  return1d: number | null;
  return7d: number | null;
  return30d: number | null;
  liveChange24h: number | null;
  fundingAPR: number | null;
  signalLabel: string | null;
}

export interface LiveFactorState {
  snapshot: FactorSnapshot;
  windows: FactorPerformanceWindow[];
  longsReturnToday: number | null;
  shortsReturnToday: number | null;
  spreadToday: number | null;
  mappedHyperliquidAssets: string[];
  unmappedAssets: string[];
  basketCoverage: number;
  hyperliquidCoverage: number;
  confidence: "high" | "medium" | "low";
  stalenessDays: number;
  topContributors: FactorContributor[];
  topDetractors: FactorContributor[];
  tradeCandidates: FactorTradeCandidate[];
  constituents: FactorConstituentPerformance[];
}

export interface EditableFactorLeg {
  symbol: string;
  enabled: boolean;
  side: "long" | "short";
  weight: number;
  sourceRole: "long" | "short";
}

export interface FactorTradePreset {
  id: string;
  factorId: string;
  name: string;
  longGrossUsd: number;
  shortGrossUsd: number;
  leverage: number;
  slippageBps: number;
  legs: EditableFactorLeg[];
  createdAt: number;
  updatedAt: number;
}

export interface FactorExecutionLeg {
  symbol: string;
  assetIndex: number | null;
  enabled: boolean;
  side: "long" | "short";
  sourceRole: "long" | "short";
  weightInput: number;
  normalizedWeight: number;
  markPx: number | null;
  priceDecimals: number;
  sizeDecimals: number;
  currentQty: number;
  targetQty: number;
  deltaQty: number;
  targetNotionalUsd: number;
  deltaNotionalUsd: number;
  orderPrice: string | null;
  marginRequiredUsd: number;
  liveChange24h: number | null;
  fundingAPR: number | null;
  signalLabel: string | null;
  status: "ready" | "skipped" | "unmapped";
  statusReason: string | null;
}

export interface FactorExecutionSummary {
  longGrossUsd: number;
  shortGrossUsd: number;
  grossUsd: number;
  netUsd: number;
  estimatedMarginUsd: number;
  activeLongLegs: number;
  activeShortLegs: number;
  tradableCoverage: number;
}

export interface FactorDeploymentRecordLeg {
  symbol: string;
  side: "buy" | "sell";
  phase: "rebalance-close" | "rebalance-open" | "delta";
  targetSize: string;
  executedQty: number | null;
  avgPx: number | null;
  status: "filled" | "resting" | "waiting" | "error" | "skipped";
  error: string | null;
}

export interface FactorDeploymentRecord {
  id: string;
  factorId: string;
  factorName: string;
  timestamp: number;
  mainnet: boolean;
  address: string;
  legs: FactorDeploymentRecordLeg[];
}

export interface FactorExecutionPlan {
  factorId: string;
  factorName: string;
  leverage: number;
  slippageBps: number;
  summary: FactorExecutionSummary;
  legs: FactorExecutionLeg[];
  executableLegs: FactorExecutionLeg[];
  skippedLegs: FactorExecutionLeg[];
}

export interface FactorAiInsight {
  title: string;
  body: string;
  tone: "bullish" | "cautious" | "neutral";
  tickers: string[];
}

export interface FactorAiBrief {
  headline: string;
  summary: string;
  insights: FactorAiInsight[];
  disclaimer?: string;
  generatedAt: string;
}


// ─── Whale Intelligence Types ─────────────────────────────────

export type WhaleSeverity = "high" | "medium" | "low";

export type WhaleEventType =
  | "deposit-led-long"
  | "deposit-led-short"
  | "aggressive-add"
  | "flip"
  | "reduce"
  | "underwater-whale"
  | "liquidation-risk";

export type WhaleDirectionality =
  | "directional_entry"
  | "directional_add"
  | "hedge"
  | "rotation"
  | "reduce"
  | "stress";

export type WhaleMarketType = "crypto_perp" | "hip3_spot";

export type WhaleRiskBucket =
  | "crypto_beta"
  | "crypto_ai"
  | "crypto_defi"
  | "crypto_meme"
  | "equities_growth"
  | "equities_broad"
  | "energy"
  | "metals"
  | "commodities_other"
  | "fx_rates_other";

export type WhaleAssetClass = "Crypto" | "Stock" | "Oil" | "Commodity" | "Other HIP-3";

export type WhaleConviction = "high" | "medium" | "low";

export type WhaleBehaviorTag =
  | "Deposit-led"
  | "Aggressive leverage"
  | "Single-asset concentrated"
  | "Adds into strength"
  | "Adds into weakness"
  | "Underwater"
  | "Two-sided book"
  | "Recent flipper"
  | "Funding-sensitive";

export type WhaleStyleTag =
  | "Conviction trader"
  | "Hedger"
  | "Scalp trader"
  | "Swing trader"
  | "High leverage"
  | "Dip buyer"
  | "Momentum trader";

export type WhaleFocusTag =
  | "Crypto beta"
  | "Crypto AI"
  | "DeFi"
  | "Meme"
  | "Stocks"
  | "Energy"
  | "Metals"
  | "Multi-asset";

export interface WhaleBucketExposure {
  bucket: WhaleRiskBucket;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  netNotionalUsd: number;
}

export interface WhaleWalletBaselineStats {
  medianTradeSize30d: number;
  medianLeverage30d: number;
  avgHoldHours30d: number;
  longBiasPct30d: number;
  realizedPnl30d: number;
  volume30d: number;
  favoriteAssets: string[];
  dominantBuckets: WhaleRiskBucket[];
  directionalHitRate30d: number;
}

export interface WhaleEpisodeEvidence {
  summary: string;
  sizeVsWalletAverage: number;
  offsetRatio: number;
  preNetBucketUsd: number;
  postNetBucketUsd: number;
  bucketChangePct: number;
}

export interface WhalePositionSnapshot {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPx: number;
  markPx: number;
  notionalUsd: number;
  leverage: number;
  liquidationPx: number | null;
  liquidationDistancePct: number | null;
  unrealizedPnl: number;
  returnOnEquity: number;
  marketType: WhaleMarketType;
  assetClass: WhaleAssetClass;
  riskBucket: WhaleRiskBucket;
}

export interface WhaleTradeSummary {
  id: string;
  coin: string;
  direction: "long" | "short";
  entryTime: number;
  exitTime: number;
  durationMs: number;
  entryPx: number;
  exitPx: number;
  size: number;
  notionalUsd: number;
  realizedPnl: number;
  pnlPct: number;
  fees: number;
  funding: number;
}

export interface WhaleLedgerEvent {
  id: string;
  time: number;
  type:
    | "deposit"
    | "withdraw"
    | "internal-transfer"
    | "spot-transfer"
    | "subaccount-transfer"
    | "account-class-transfer"
    | "liquidation"
    | "reward"
    | "vault";
  direction: "in" | "out" | "neutral";
  amountUsd: number;
  asset: string;
  label: string;
  hash?: string;
}

export interface WhaleAlert {
  id: string;
  address: string;
  walletLabel: string;
  eventType: WhaleEventType;
  directionality: WhaleDirectionality;
  severity: WhaleSeverity;
  conviction: WhaleConviction;
  headline: string;
  detail: string;
  timestamp: number;
  coin: string;
  side: "long" | "short" | "mixed";
  notionalUsd: number;
  leverage: number | null;
  netFlow24hUsd: number;
  deposit24h: number;
  unrealizedPnl: number | null;
  sizeVsWalletAverage: number;
  offsetRatio: number;
  marketType: WhaleMarketType;
  assetClass: WhaleAssetClass;
  riskBucket: WhaleRiskBucket;
  confidenceLabel: string;
  walletRealizedPnl30d: number | null;
  walletDirectionalHitRate30d: number | null;
  behaviorTags: WhaleBehaviorTag[];
  evidence: WhaleEpisodeEvidence;
}

export interface WhaleWalletProfile {
  address: string;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  accountEquity: number;
  perpsEquity: number;
  spotUsdc: number;
  totalOpenNotionalUsd: number;
  unrealizedPnl: number;
  realizedPnl30d: number;
  funding30d: number;
  openPositionsCount: number;
  averageLeverage: number;
  dominantAssets: string[];
  netFlow24hUsd: number;
  netFlow7dUsd: number;
  netFlow30dUsd: number;
  behaviorTags: WhaleBehaviorTag[];
  styleTags: WhaleStyleTag[];
  focusTags: WhaleFocusTag[];
  baseline: WhaleWalletBaselineStats;
  medianTradeSize30d: number;
  avgHoldHours30d: number;
  directionalHitRate30d: number;
  preMoveHitRate1h?: number | null;
  preMoveHitRate4h?: number | null;
  preMoveSampleSize?: number | null;
  repeatedAddCount6h?: number | null;
  bucketExposures: WhaleBucketExposure[];
  narrative: string;
  positions: WhalePositionSnapshot[];
  trades: WhaleTradeSummary[];
  ledger: WhaleLedgerEvent[];
  activeAlerts: WhaleAlert[];
}

export interface WhaleEpisode {
  id: string;
  address: string;
  coin: string;
  startedAt: number;
  endedAt: number;
  marketType: WhaleMarketType;
  riskBucket: WhaleRiskBucket;
  directionality: WhaleDirectionality;
  fills: Fill[];
  ledger: WhaleLedgerEvent[];
  alert: WhaleAlert;
}

export interface WhaleWatchlistEntry {
  address: string;
  nickname: string | null;
  createdAt: number;
}

export type PositioningAlertType =
  | "crowding"
  | "liquidation_pressure"
  | "high_conviction_whale";

export type PositioningRegime =
  | "crowded_long"
  | "crowded_short"
  | "downside_magnet"
  | "upside_magnet"
  | "whale_conviction";

export interface PositioningMarketSnapshot {
  id: string;
  asset: string;
  timestamp: number;
  price: number;
  marketType: WhaleMarketType;
  fundingAPR: number | null;
  openInterestUsd: number | null;
  oiChange1h: number | null;
  oiChange4h: number | null;
  basisBps: number | null;
  spotProxySource: string | null;
  priceChange1h?: number | null;
  priceChange4h?: number | null;
}

export interface PositioningAlert {
  id: string;
  asset: string;
  alertType: PositioningAlertType;
  regime: PositioningRegime;
  severity: WhaleSeverity;
  timestamp: number;
  whyItMatters: string;
  walletAddress?: string | null;
  walletLabel?: string | null;
  basisBps?: number | null;
  fundingApr?: number | null;
  oiChange1h?: number | null;
  oiChange4h?: number | null;
  trackedLiquidationClusterUsd?: number | null;
  price?: number | null;
  clusterPrice?: number | null;
  repeatedAdds6h?: number | null;
  marketType?: WhaleMarketType | null;
  payload?: Record<string, unknown>;
}

export interface PositioningDigestRun {
  id: string;
  createdAt: number;
  periodStart: number;
  periodEnd: number;
  headline: string;
  summaryLines: string[];
  alertIds: string[];
  telegramSentAt: number | null;
  payload?: Record<string, unknown>;
}

export interface WalletTimingScore {
  address: string;
  asset: string;
  lookaheadHours: number;
  sampleSize: number;
  hitRate: number;
  updatedAt: number;
}
