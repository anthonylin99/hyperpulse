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

export type AgentExecutionMode = "paper" | "testnet" | "live";

export type AgentExecutionIntentStatus =
  | "risk_blocked"
  | "pending_approval"
  | "paper_open"
  | "paper_closed"
  | "rejected"
  | "expired"
  | "failed";

export interface AgentExecutionIntent {
  id: string;
  idempotencyKey: string;
  mode: AgentExecutionMode;
  status: AgentExecutionIntentStatus;
  sourceType: "momentum_alert";
  sourceId: string;
  asset: string;
  side: AgentTradeSide;
  signalCreatedAt: number;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  rejectedAt: number | null;
  closedAt: number | null;
  entryPrice: number;
  stopPrice: number | null;
  targetPrice: number | null;
  marginUsd: number | null;
  notionalUsd: number | null;
  leverage: number | null;
  riskUsd: number | null;
  stopDistancePct: number | null;
  rewardRisk: number | null;
  score: number;
  reason: string;
  routeHref: string;
  policySnapshot: AgentRiskPolicy | Record<string, unknown>;
  checks: AgentRiskCheck[];
  payload: Record<string, unknown>;
  lastMarkPrice: number | null;
  exitPrice: number | null;
  paperPnlUsd: number | null;
  paperPnlPct: number | null;
}

export interface AgentIntentResponse {
  enabled: boolean;
  mode: "paper";
  generatedAt: number;
  equityUsd: number;
  policy: AgentRiskPolicy;
  storageConfigured: boolean;
  intents: AgentExecutionIntent[];
  source: string;
  message?: string;
}
