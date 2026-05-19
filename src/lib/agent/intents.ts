import { createHash, randomUUID } from "crypto";
import { Pool } from "pg";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import type {
  AgentExecutionIntent,
  AgentExecutionIntentStatus,
  AgentRecommendation,
} from "@/types/agent";

const DATABASE_URL = getPooledDatabaseUrl();
const STORE_BACKOFF_MS = 5 * 60 * 1000;
const SCHEMA_WRITES_ENABLED = process.env.ENABLE_AGENT_SCHEMA_WRITES !== "false";

let pool: Pool | null = null;
let disabledUntil = 0;

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  return pool;
}

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + STORE_BACKOFF_MS;
  console.warn("[agent-intents-store] unavailable", error);
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeChecks(value: unknown): AgentExecutionIntent["checks"] {
  return Array.isArray(value) ? value as AgentExecutionIntent["checks"] : [];
}

export function isAgentIntentStoreConfigured(): boolean {
  return Boolean(getPool());
}

export async function ensureAgentExecutionTables(): Promise<void> {
  if (!SCHEMA_WRITES_ENABLED) return;
  const client = getPool();
  if (!client) return;

  await client.query(`
    create table if not exists agent_execution_intents (
      id text primary key,
      idempotency_key text not null unique,
      mode text not null default 'paper',
      status text not null,
      source_type text not null,
      source_id text not null,
      asset text not null,
      side text not null,
      signal_created_at bigint not null,
      created_at bigint not null,
      updated_at bigint not null,
      approved_at bigint,
      rejected_at bigint,
      closed_at bigint,
      entry_price double precision not null,
      stop_price double precision,
      target_price double precision,
      margin_usd double precision,
      notional_usd double precision,
      leverage double precision,
      risk_usd double precision,
      stop_distance_pct double precision,
      reward_risk double precision,
      score double precision not null default 0,
      reason text not null default '',
      route_href text not null default '',
      policy_snapshot jsonb not null default '{}'::jsonb,
      checks jsonb not null default '[]'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      last_mark_price double precision,
      exit_price double precision,
      paper_pnl_usd double precision,
      paper_pnl_pct double precision,
      unique (mode, source_type, source_id)
    );
  `);
  await client.query(`
    create table if not exists agent_audit_log (
      id text primary key,
      intent_id text not null,
      event_type text not null,
      created_at bigint not null,
      message text not null,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await client.query(`create index if not exists agent_execution_intents_status_time_idx on agent_execution_intents (status, updated_at desc);`);
  await client.query(`create index if not exists agent_execution_intents_source_idx on agent_execution_intents (source_type, source_id);`);
  await client.query(`create index if not exists agent_audit_log_intent_time_idx on agent_audit_log (intent_id, created_at desc);`);
}

function intentStatusFor(recommendation: AgentRecommendation): AgentExecutionIntentStatus {
  return recommendation.eligible ? "pending_approval" : "risk_blocked";
}

function intentIdentityFor(recommendation: AgentRecommendation) {
  const signal = recommendation.signal;
  const key = [
    "paper",
    signal.source,
    signal.sourceId,
    signal.asset,
    signal.side,
    "policy-v1",
  ].join(":");
  return {
    idempotencyKey: key,
    id: `paper-${hashId(key)}`,
  };
}

function normalizeIntent(row: Record<string, unknown>): AgentExecutionIntent {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    mode: row.mode === "testnet" || row.mode === "live" ? row.mode : "paper",
    status: String(row.status) as AgentExecutionIntentStatus,
    sourceType: "momentum_alert",
    sourceId: String(row.source_id),
    asset: String(row.asset),
    side: row.side === "short" ? "short" : "long",
    signalCreatedAt: Number(row.signal_created_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    approvedAt: asNumber(row.approved_at),
    rejectedAt: asNumber(row.rejected_at),
    closedAt: asNumber(row.closed_at),
    entryPrice: Number(row.entry_price),
    stopPrice: asNumber(row.stop_price),
    targetPrice: asNumber(row.target_price),
    marginUsd: asNumber(row.margin_usd),
    notionalUsd: asNumber(row.notional_usd),
    leverage: asNumber(row.leverage),
    riskUsd: asNumber(row.risk_usd),
    stopDistancePct: asNumber(row.stop_distance_pct),
    rewardRisk: asNumber(row.reward_risk),
    score: Number(row.score ?? 0),
    reason: String(row.reason ?? ""),
    routeHref: String(row.route_href ?? ""),
    policySnapshot: asJsonObject(row.policy_snapshot),
    checks: normalizeChecks(row.checks),
    payload: asJsonObject(row.payload),
    lastMarkPrice: asNumber(row.last_mark_price),
    exitPrice: asNumber(row.exit_price),
    paperPnlUsd: asNumber(row.paper_pnl_usd),
    paperPnlPct: asNumber(row.paper_pnl_pct),
  };
}

async function writeAudit(args: {
  intentId: string;
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const client = getPool();
  if (!client) return;
  await client.query(
    `
    insert into agent_audit_log (id, intent_id, event_type, created_at, message, payload)
    values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      randomUUID(),
      args.intentId,
      args.eventType,
      Date.now(),
      args.message,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

export async function upsertPaperIntentsFromRecommendations(
  recommendations: AgentRecommendation[],
): Promise<{ configured: boolean; upserted: number }> {
  const client = getPool();
  if (!client) return { configured: false, upserted: 0 };

  try {
    await ensureAgentExecutionTables();
    let upserted = 0;
    for (const recommendation of recommendations) {
      const { signal, proposedOrder } = recommendation;
      const identity = intentIdentityFor(recommendation);
      const now = Date.now();
      const status = intentStatusFor(recommendation);
      await client.query(
        `
        insert into agent_execution_intents (
          id, idempotency_key, mode, status, source_type, source_id, asset, side,
          signal_created_at, created_at, updated_at, entry_price, stop_price,
          target_price, margin_usd, notional_usd, leverage, risk_usd,
          stop_distance_pct, reward_risk, score, reason, route_href,
          policy_snapshot, checks, payload
        )
        values (
          $1, $2, 'paper', $3, 'momentum_alert', $4, $5, $6,
          $7, $8, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21::jsonb, $22::jsonb, $23::jsonb
        )
        on conflict (idempotency_key) do update set
          status = case
            when agent_execution_intents.status in ('paper_open', 'paper_closed', 'rejected') then agent_execution_intents.status
            else excluded.status
          end,
          updated_at = excluded.updated_at,
          entry_price = excluded.entry_price,
          stop_price = excluded.stop_price,
          target_price = excluded.target_price,
          margin_usd = excluded.margin_usd,
          notional_usd = excluded.notional_usd,
          leverage = excluded.leverage,
          risk_usd = excluded.risk_usd,
          stop_distance_pct = excluded.stop_distance_pct,
          reward_risk = excluded.reward_risk,
          score = excluded.score,
          reason = excluded.reason,
          route_href = excluded.route_href,
          policy_snapshot = excluded.policy_snapshot,
          checks = excluded.checks,
          payload = excluded.payload
        `,
        [
          identity.id,
          identity.idempotencyKey,
          status,
          signal.sourceId,
          signal.asset,
          signal.side,
          signal.createdAt,
          now,
          signal.entryPrice,
          signal.stopPrice,
          signal.targetPrice,
          proposedOrder?.marginUsd ?? null,
          proposedOrder?.notionalUsd ?? null,
          proposedOrder?.leverage ?? null,
          proposedOrder?.riskUsd ?? null,
          proposedOrder?.stopDistancePct ?? null,
          proposedOrder?.rewardRisk ?? null,
          signal.score,
          signal.reason,
          signal.routeHref,
          JSON.stringify(recommendation.policySnapshot),
          JSON.stringify(recommendation.checks),
          JSON.stringify({ summary: recommendation.summary, recommendationId: recommendation.id }),
        ],
      );
      upserted += 1;
    }
    return { configured: true, upserted };
  } catch (error) {
    markStoreUnavailable(error);
    return { configured: false, upserted: 0 };
  }
}

export async function listAgentExecutionIntents(limit = 50): Promise<AgentExecutionIntent[]> {
  const client = getPool();
  if (!client) return [];

  try {
    await ensureAgentExecutionTables();
    const result = await client.query(
      `
      select *
      from agent_execution_intents
      order by
        case status
          when 'paper_open' then 0
          when 'pending_approval' then 1
          when 'risk_blocked' then 2
          else 3
        end,
        updated_at desc
      limit $1
      `,
      [Math.min(Math.max(Math.round(limit), 1), 100)],
    );
    return result.rows.map(normalizeIntent);
  } catch (error) {
    markStoreUnavailable(error);
    return [];
  }
}

export async function approvePaperIntent(id: string): Promise<AgentExecutionIntent | null> {
  const client = getPool();
  if (!client) return null;

  try {
    await ensureAgentExecutionTables();
    const now = Date.now();
    const result = await client.query(
      `
      update agent_execution_intents
      set status = 'paper_open',
          approved_at = coalesce(approved_at, $2),
          updated_at = $2
      where id = $1
        and mode = 'paper'
        and status = 'pending_approval'
      returning *
      `,
      [id, now],
    );
    const intent = result.rows[0] ? normalizeIntent(result.rows[0]) : null;
    if (intent) {
      await writeAudit({
        intentId: intent.id,
        eventType: "paper_approved",
        message: "Paper trade intent approved. No exchange order was placed.",
        payload: { sourceId: intent.sourceId, asset: intent.asset, side: intent.side },
      });
    }
    return intent;
  } catch (error) {
    markStoreUnavailable(error);
    return null;
  }
}

export async function rejectAgentIntent(id: string): Promise<AgentExecutionIntent | null> {
  const client = getPool();
  if (!client) return null;

  try {
    await ensureAgentExecutionTables();
    const now = Date.now();
    const result = await client.query(
      `
      update agent_execution_intents
      set status = 'rejected',
          rejected_at = coalesce(rejected_at, $2),
          updated_at = $2
      where id = $1
        and mode = 'paper'
        and status in ('pending_approval', 'risk_blocked')
      returning *
      `,
      [id, now],
    );
    const intent = result.rows[0] ? normalizeIntent(result.rows[0]) : null;
    if (intent) {
      await writeAudit({
        intentId: intent.id,
        eventType: "rejected",
        message: "Trade intent rejected by operator.",
        payload: { sourceId: intent.sourceId, asset: intent.asset, side: intent.side },
      });
    }
    return intent;
  } catch (error) {
    markStoreUnavailable(error);
    return null;
  }
}
