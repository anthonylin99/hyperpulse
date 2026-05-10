import type { MomentumAlert } from "@/types";
import type {
  AgentRecommendation,
  AgentRiskCheck,
  AgentRiskPolicy,
  AgentTradeSignal,
  AgentTradeSide,
} from "@/types/agent";

export const DEFAULT_DEV_AGENT_EQUITY_USD = 1_000;

export const DEFAULT_DEV_AGENT_RISK_POLICY: AgentRiskPolicy = {
  allowedAssets: ["BTC", "ETH", "SOL", "HYPE"],
  maxPositionNotionalUsd: 500,
  maxPositionNotionalPctEquity: 0.05,
  maxLeverage: 3,
  perTradeRiskPctEquity: 0.005,
  dailyLossLimitPctEquity: 0.02,
  tradeCooldownMinutes: 30,
  killSwitchEnabled: false,
  humanApprovalRequired: true,
  requireBracketOrders: true,
  minRewardRisk: 1.5,
  minStopDistancePct: 0.2,
  maxTradesPerDay: 3,
};

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

function asFinitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inferSide(alert: MomentumAlert): AgentTradeSide {
  return alert.payload?.direction === "short" ? "short" : "long";
}

function check(
  key: string,
  label: string,
  status: AgentRiskCheck["status"],
  detail: string,
): AgentRiskCheck {
  return { key, label, status, detail };
}

export function signalFromMomentumAlert(
  alert: MomentumAlert,
  currentPrice?: number | null,
): AgentTradeSignal | null {
  const asset = normalizeAsset(alert.asset);
  const entryPrice =
    asFinitePositive(currentPrice) ??
    asFinitePositive(alert.currentPrice) ??
    asFinitePositive(alert.alertPrice);

  if (!asset || entryPrice == null) return null;

  return {
    id: `momentum:${alert.id}`,
    asset,
    side: inferSide(alert),
    source: "momentum_alert",
    sourceId: alert.id,
    createdAt: alert.createdAt,
    entryPrice,
    stopPrice: asFinitePositive(alert.invalidationPrice),
    targetPrice: asFinitePositive(alert.targetPrice),
    score: Number.isFinite(alert.score) ? alert.score : 0,
    reason: alert.reason,
    routeHref: alert.routeHref,
  };
}

export function buildDevAgentRecommendation(args: {
  signal: AgentTradeSignal;
  equityUsd?: number;
  policy?: AgentRiskPolicy;
  generatedAt?: number;
}): AgentRecommendation {
  const {
    signal,
    equityUsd = DEFAULT_DEV_AGENT_EQUITY_USD,
    policy = DEFAULT_DEV_AGENT_RISK_POLICY,
    generatedAt = Date.now(),
  } = args;

  const checks: AgentRiskCheck[] = [];
  const entry = signal.entryPrice;
  const stop = signal.stopPrice;
  const target = signal.targetPrice;
  const allowed = policy.allowedAssets.includes(signal.asset);

  checks.push(
    check(
      "allowed_asset",
      "Allowed asset",
      allowed ? "pass" : "block",
      allowed
        ? `${signal.asset} is in the dev allowlist.`
        : `${signal.asset} is outside the dev allowlist.`,
    ),
  );

  checks.push(
    check(
      "kill_switch",
      "Kill switch",
      policy.killSwitchEnabled ? "block" : "pass",
      policy.killSwitchEnabled
        ? "Automation is paused by policy."
        : "Automation is not paused.",
    ),
  );

  const hasBracket = stop != null && target != null;
  checks.push(
    check(
      "bracket_orders",
      "TP / SL present",
      hasBracket ? "pass" : "block",
      hasBracket
        ? "Signal has both target and invalidation."
        : "Dev agent requires both target and stop.",
    ),
  );

  const stopOnCorrectSide =
    stop != null &&
    (signal.side === "long" ? stop < entry : stop > entry);
  checks.push(
    check(
      "stop_side",
      "Stop side",
      stopOnCorrectSide ? "pass" : "block",
      stopOnCorrectSide
        ? "Stop is on the loss side of entry."
        : "Stop is missing or on the wrong side of entry.",
    ),
  );

  const targetOnCorrectSide =
    target != null &&
    (signal.side === "long" ? target > entry : target < entry);
  checks.push(
    check(
      "target_side",
      "Target side",
      targetOnCorrectSide ? "pass" : "block",
      targetOnCorrectSide
        ? "Target is on the profit side of entry."
        : "Target is missing or on the wrong side of entry.",
    ),
  );

  let proposedOrder: AgentRecommendation["proposedOrder"] = null;
  if (stop != null && target != null) {
    const stopDistancePct = (Math.abs(entry - stop) / entry) * 100;
    const rewardRisk = Math.abs(target - entry) / Math.abs(entry - stop);
    const stopDistanceOk = stopDistancePct >= policy.minStopDistancePct;
    const rewardRiskOk = rewardRisk >= policy.minRewardRisk;

    checks.push(
      check(
        "stop_distance",
        "Stop distance",
        stopDistanceOk ? "pass" : "block",
        `${stopDistancePct.toFixed(2)}% stop distance; minimum is ${policy.minStopDistancePct.toFixed(2)}%.`,
      ),
    );
    checks.push(
      check(
        "reward_risk",
        "Reward / risk",
        rewardRiskOk ? "pass" : "block",
        `${rewardRisk.toFixed(2)}x reward/risk; minimum is ${policy.minRewardRisk.toFixed(2)}x.`,
      ),
    );

    const maxByEquity = equityUsd * policy.maxPositionNotionalPctEquity;
    const notionalUsd = Math.max(
      0,
      Math.min(
        policy.maxPositionNotionalUsd,
        maxByEquity,
      ),
    );
    const leverage = Math.max(1, Math.min(policy.maxLeverage, 2));
    const marginUsd = notionalUsd / leverage;
    const riskUsd = notionalUsd * (stopDistancePct / 100);
    const sizeOk = notionalUsd >= 10;

    checks.push(
      check(
        "size_caps",
        "Position size",
        sizeOk ? "pass" : "block",
        sizeOk
          ? `Fixed allocation is ${(policy.maxPositionNotionalPctEquity * 100).toFixed(1)}% of dev equity.`
          : "Risk-based size is below the $10 minimum test threshold.",
      ),
    );
    checks.push(
      check(
        "human_approval",
        "Human approval",
        policy.humanApprovalRequired ? "warn" : "pass",
        policy.humanApprovalRequired
          ? "Mainnet execution would require approval."
          : "Policy allows auto mode.",
      ),
    );

    if (sizeOk) {
      proposedOrder = {
        asset: signal.asset,
        side: signal.side,
        entryPrice: entry,
        stopPrice: stop,
        targetPrice: target,
        marginUsd,
        notionalUsd,
        leverage,
        riskUsd,
        stopDistancePct,
        rewardRisk,
      };
    }
  }

  const eligible =
    proposedOrder != null &&
    !checks.some((item) => item.status === "block");

  return {
    id: `dev-rec:${signal.sourceId}`,
    mode: "dev_recommendation",
    signal,
    eligible,
    summary: eligible && proposedOrder
      ? `${signal.asset} ${signal.side} passes dev risk checks.`
      : `${signal.asset} ${signal.side} is blocked by dev risk checks.`,
    proposedOrder,
    checks,
    policySnapshot: policy,
    generatedAt,
  };
}
