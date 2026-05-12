export type AgentTradeSide = "long" | "short";

export type AgentRiskCheckStatus = "pass" | "warn" | "block";

export interface AgentRiskPolicy {
  allowedAssets: string[];
  maxPositionNotionalUsd: number;
  maxPositionNotionalPctEquity: number;
  maxLeverage: number;
  perTradeRiskPctEquity: number;
  dailyLossLimitPctEquity: number;
  tradeCooldownMinutes: number;
  killSwitchEnabled: boolean;
  humanApprovalRequired: boolean;
  requireBracketOrders: boolean;
  minRewardRisk: number;
  minStopDistancePct: number;
  maxTradesPerDay: number;
}

export interface AgentTradeSignal {
  id: string;
  asset: string;
  side: AgentTradeSide;
  source: "momentum_alert";
  sourceId: string;
  createdAt: number;
  entryPrice: number;
  stopPrice: number | null;
  targetPrice: number | null;
  score: number;
  reason: string;
  routeHref: string;
}

export interface AgentRiskCheck {
  key: string;
  label: string;
  status: AgentRiskCheckStatus;
  detail: string;
}

export interface AgentProposedOrder {
  asset: string;
  side: AgentTradeSide;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  marginUsd: number;
  notionalUsd: number;
  leverage: number;
  riskUsd: number;
  stopDistancePct: number;
  rewardRisk: number;
}

export interface AgentRecommendation {
  id: string;
  mode: "dev_recommendation";
  signal: AgentTradeSignal;
  eligible: boolean;
  summary: string;
  proposedOrder: AgentProposedOrder | null;
  checks: AgentRiskCheck[];
  policySnapshot: AgentRiskPolicy;
  generatedAt: number;
}

export interface AgentRecommendationsResponse {
  enabled: boolean;
  mode: "dev_recommendation";
  generatedAt: number;
  equityUsd: number;
  policy: AgentRiskPolicy;
  recommendations: AgentRecommendation[];
  source: string;
}
