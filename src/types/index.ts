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

export type SpotCategory =
  | "Stocks"
  | "Indices/ETFs"
  | "Metals"
  | "Energy"
  | "Commodities"
  | "Crypto"
  | "Other";

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
  marketType?: "perp" | "hip3_perp" | "hip3_spot";
  dex?: string | null;
}

export interface AccountState {
  accountValue: number;
  crossAccountValue: number;
  isolatedAccountValue: number;
  totalMarginUsed: number;
  withdrawable: number;
  spotUsdcTotal: number;
  spotUsdcHold: number;
  spotAssetValue: number;
  spotTotalValue: number;
  spotUnrealizedPnl: number;
  unrealizedPnl: number;
  positions: Position[];
  spotPositions: Position[];
}

// â”€â”€â”€ Portfolio Analytics Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  capitalUsedUsd?: number | null; // margin / own capital used when captured or estimated
  leverageUsed?: number | null;
  capitalSource?: "captured" | "estimated" | "spot" | "unavailable";
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
  avgWinDuration: number; // ms â€” how long winning trades last
  avgLossDuration: number; // ms â€” how long losing trades last
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

// â”€â”€â”€ Research Store Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DailyMarketPrice {
  asset: string;
  marketType: "perp" | "spot";
  day: string; // UTC YYYY-MM-DD
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: "hyperliquid";
  updatedAt: number;
}

export interface TradeSizingSnapshot {
  id: string;
  walletAddress: string;
  asset: string;
  side: "long" | "short";
  marketType: "perp" | "hip3_perp";
  positionKey: string;
  capturedAt: number;
  entryTime: number | null;
  entryPrice: number;
  markPrice: number;
  size: number;
  notionalUsd: number;
  marginUsedUsd: number;
  liquidationPx?: number | null;
  accountEquityUsd: number;
  tradeableCapitalUsd: number;
  leverage: number;
  sizingPct: number;
  status: "open" | "closed" | "unknown";
  source: "first_captured" | "snapshot";
}

export interface PortfolioTrackedWallet {
  walletAddress: string;
  firstSeenAt: number;
  lastSeenAt: number;
  source: "portfolio" | "manual" | "worker";
  status: "active" | "paused";
}

export interface CorrelationMatrixEntry {
  assetA: string;
  assetB: string;
  correlation: number | null;
  samples: number;
}

export interface CorrelationCluster {
  primaryAsset: string;
  secondaryAsset: string;
  correlation: number;
  combinedNotionalUsd: number;
  note: string;
}

export interface CorrelationResult {
  configured: boolean;
  windowDays: number;
  assets: string[];
  matrix: CorrelationMatrixEntry[];
  clusters: CorrelationCluster[];
  warning: string | null;
  updatedAt: number;
}

export interface SupportResistanceLevel {
  id: string;
  label: string;
  kind: "support" | "resistance" | "pivot";
  source:
    | "traditional_pivot"
    | "swing_pivot"
    | "structure_pivot"
    | "structure_trendline"
    | "leverage_liquidation";
  price: number;
  zoneLow?: number;
  zoneHigh?: number;
  strength: number;
  touches?: number;
  distancePct?: number;
  pivotTimeMs?: number;
  discoveredTimeMs?: number;
  updatedAtMs?: number;
  expiresAtMs?: number;
  confidence?: "low" | "medium" | "high";
  status?: "forecast" | "active" | "tested" | "broken" | "expired";
  confirmationBars?: number;
  reason?: string;
  explanation?: string;
  evidence?: string[];
  notionalUsd?: number;
  weightedLeverage?: number;
  leverageMultiplier?: number;
  pressureScore?: number;
  lfxScore?: number;
  depthAdjustedImpact?: number | null;
  volatilityReach?: number;
  distanceDecay?: number;
  flowSide?: PressureFlowSide;
  zoneType?: PressureZoneType;
  coverage?: PressureCoverage;
  flowRank?: number;
  flowRelative?: number;
  leverageBucket?: string;
  walletCount?: number;
  pressureSide?: PressureLevelSide;
  pressureSource?: PressureLevelSource;
}

export type PressureLevelSide = "long_liq" | "short_liq";
export type PressureFlowSide = "forced_sell" | "forced_buy";
export type PressureZoneType =
  | "downside_cascade"
  | "upside_squeeze"
  | "absorption_support"
  | "absorption_resistance"
  | "magnet"
  | "dead_zone";
export type PressureCoverage = "market_only" | "wallet_sample";
export type PressureLevelSource = "market_inferred" | "tracked_liquidation" | "estimated_leverage";
export type PressureConfidence = "low" | "medium" | "high";

export interface PressureLevel {
  id: string;
  price: number;
  side: PressureLevelSide;
  source: PressureLevelSource;
  distancePct: number;
  notionalUsd: number;
  weightedLeverage: number;
  leverageMultiplier: number;
  pressureScore: number;
  lfxScore: number;
  depthAdjustedImpact: number | null;
  volatilityReach: number;
  distanceDecay: number;
  flowSide: PressureFlowSide;
  zoneType: PressureZoneType;
  coverage: PressureCoverage;
  explanation?: string;
  evidence?: string[];
  flowRank?: number;
  flowRelative?: number;
  leverageBucket?: string;
  confidence: PressureConfidence;
  walletCount: number;
}

export interface PressurePayload {
  coin: string;
  coverage: PressureCoverage;
  currentPrice: number;
  updatedAt: number;
  market: {
    fundingAPR: number | null;
    openInterestUsd: number | null;
    oiChangePct: number | null;
    maxLeverage: number | null;
    bidDepthUsd: number | null;
    askDepthUsd: number | null;
    topBookImbalancePct: number | null;
    pressureScore: number;
  };
  levels: PressureLevel[];
  summary: {
    nearestPressureLevel: PressureLevel | null;
    dominantPressureLevel: PressureLevel | null;
    strongestLongLiquidationLevel: PressureLevel | null;
    strongestShortLiquidationLevel: PressureLevel | null;
    longLiquidationNotionalUsd: number;
    shortLiquidationNotionalUsd: number;
    trackedWallets: number;
  };
}

export interface PressureBatchPayload {
  updatedAt: number;
  assets: Record<string, PressurePayload>;
}

// â”€â”€â”€ Activity Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


// â”€â”€â”€ Whale Intelligence Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

export type TraderCohortFamily = "size" | "performance";

export type TraderCohortTone = "green" | "amber" | "red" | "neutral";

export interface TraderCohort {
  id: string;
  family: TraderCohortFamily;
  label: string;
  minUsd: number | null;
  maxUsd: number | null;
  tone: TraderCohortTone;
  description: string;
}

export type TraderProfileTag =
  | WhaleBehaviorTag
  | WhaleStyleTag
  | WhaleFocusTag
  | "Smart money"
  | "Large account"
  | "Review-only"
  | "Tracked favorite";

export interface WalletIntelligenceSummary {
  sizeCohort: TraderCohort;
  pnlCohort: TraderCohort;
  qualityLabel: string;
  riskLabel: string;
  directionBias: "long" | "short" | "balanced";
  topAssets: string[];
  tags: TraderProfileTag[];
  evidence: string[];
}

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
  szi?: number;
  size: number;
  entryPx: number;
  markPx: number;
  notionalUsd: number;
  positionValueUsd?: number;
  marginUsedUsd?: number | null;
  leverage: number;
  leverageType?: string | null;
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
  sizeCohort: TraderCohort;
  pnlCohort: TraderCohort;
  intelligenceSummary: WalletIntelligenceSummary;
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

export interface TrackedWalletFavorite extends WhaleWatchlistEntry {
  lastSeenAt: number | null;
  profile: WalletIntelligenceSummary | null;
}

export type MarketRadarSignalKind =
  | "strongest_asset"
  | "weakest_asset"
  | "crowded_long"
  | "crowded_short"
  | "liquidation_pressure"
  | "whale_flow"
  | "factor_confirmation";

export interface MarketRadarSignal {
  id: string;
  kind: MarketRadarSignalKind;
  asset: string;
  label: string;
  value: string;
  severity: WhaleSeverity;
  timestamp: number;
  evidence: string[];
  routeHref: string;
}

export interface CohortsLiteBucket {
  id: string;
  label: string;
  description: string;
  walletCount: number;
  netLongUsd: number;
  netShortUsd: number;
  netBias: "long" | "short" | "balanced";
  topAsset: string | null;
  medianTradeSizeUsd: number;
  avgLeverage: number;
}

export interface ShareCardPayload {
  type: "whale" | "market" | "factor" | "portfolio";
  title: string;
  subtitle: string;
  primaryMetric: string;
  secondaryMetric?: string;
  evidence: string[];
  routeHref: string;
  generatedAt: number;
  privacy: "public" | "redacted";
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

export interface TrackedLiquidationBucket {
  id: string;
  asset: string;
  side: "long_liq" | "short_liq";
  timestamp: number;
  bucketSize: number;
  price: number;
  currentPrice: number;
  distancePct: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  totalNotionalUsd: number;
  marginUsd: number | null;
  weightedAvgLeverage: number | null;
  avgEntryPrice: number | null;
  positionCount: number;
  walletCount: number;
  source: "tracked_wallet_sample";
  trackedWalletCount: number | null;
  payload: Record<string, unknown>;
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
  clusterDistancePct?: number | null;
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
