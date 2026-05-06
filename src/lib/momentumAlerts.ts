import { Pool } from "pg";
import type { MomentumAlert, NotificationDeliveryStatus } from "@/types";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const STORE_BACKOFF_MS = 5 * 60 * 1000;

let pool: Pool | null = null;
let disabledUntil = 0;

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  return pool;
}

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + STORE_BACKOFF_MS;
  console.warn("[momentum-alert-store] unavailable", error);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAlert(row: Record<string, unknown>, deliveryStatus?: NotificationDeliveryStatus | null): MomentumAlert {
  return {
    id: String(row.id),
    asset: String(row.asset),
    createdAt: Number(row.created_at),
    alertPrice: Number(row.alert_price),
    currentPriceAtEval: Number(row.current_price_at_eval),
    return1hPct: asNumber(row.return_1h_pct),
    return4hPct: asNumber(row.return_4h_pct),
    return24hPct: asNumber(row.return_24h_pct),
    openInterestUsd: asNumber(row.open_interest_usd),
    openInterestChangePct: asNumber(row.open_interest_change_pct),
    volume24hUsd: asNumber(row.volume_24h_usd),
    volumeVsBaseline: asNumber(row.volume_vs_baseline),
    fundingApr: asNumber(row.funding_apr),
    triggerKind: row.trigger_kind === "momentum_continuation" ? "momentum_continuation" : "momentum_ignition",
    score: Number(row.score),
    severity: row.severity === "medium" || row.severity === "low" ? row.severity : "high",
    reason: String(row.reason),
    invalidationPrice: asNumber(row.invalidation_price),
    targetPrice: asNumber(row.target_price),
    routeHref: String(row.route_href),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    deliveryStatus: deliveryStatus ?? null,
  };
}

export function isMomentumAlertStoreConfigured(): boolean {
  return Boolean(getPool());
}

export async function ensureMomentumAlertTables(): Promise<void> {
  const client = getPool();
  if (!client) return;
  await client.query(`
    create table if not exists momentum_alert_events (
      id text primary key,
      asset text not null,
      created_at bigint not null,
      alert_price double precision not null,
      current_price_at_eval double precision not null,
      return_1h_pct double precision,
      return_4h_pct double precision,
      return_24h_pct double precision,
      open_interest_usd double precision,
      open_interest_change_pct double precision,
      volume_24h_usd double precision,
      volume_vs_baseline double precision,
      funding_apr double precision,
      trigger_kind text not null,
      score double precision not null,
      severity text not null,
      reason text not null,
      invalidation_price double precision,
      target_price double precision,
      route_href text not null,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await client.query(`
    create table if not exists notification_queue (
      id text primary key,
      event_type text not null,
      event_id text not null,
      channel text not null,
      status text not null default 'queued',
      created_at bigint not null,
      sent_at bigint,
      attempts integer not null default 0,
      message_hash text,
      last_error text,
      payload jsonb not null default '{}'::jsonb,
      unique (event_type, event_id, channel)
    );
  `);
  await client.query(`create index if not exists momentum_alert_events_time_idx on momentum_alert_events (created_at desc);`);
  await client.query(`create index if not exists notification_queue_event_idx on notification_queue (event_type, event_id);`);
}

export async function listMomentumAlerts(limit = 50): Promise<MomentumAlert[]> {
  const client = getPool();
  if (!client) return [];

  try {
    await ensureMomentumAlertTables();
    const safeLimit = Math.min(Math.max(Math.round(limit), 1), 100);
    const result = await client.query(
      `
      select
        mea.*,
        nq.status as delivery_status,
        nq.sent_at as delivery_sent_at,
        nq.attempts as delivery_attempts,
        nq.last_error as delivery_last_error
      from momentum_alert_events mea
      left join notification_queue nq
        on nq.event_type = 'momentum_alert'
        and nq.event_id = mea.id
        and nq.channel = 'telegram'
      order by mea.created_at desc
      limit $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => normalizeAlert(row, {
      channel: "telegram",
      status: String(row.delivery_status ?? "unknown"),
      sentAt: asNumber(row.delivery_sent_at),
      attempts: Number(row.delivery_attempts ?? 0),
      lastError: typeof row.delivery_last_error === "string" ? row.delivery_last_error : null,
    }));
  } catch (error) {
    markStoreUnavailable(error);
    return [];
  }
}

export async function getMomentumWorkerStatus(): Promise<{ updatedAt: number | null; status: string; message: string | null } | null> {
  const client = getPool();
  if (!client) return null;

  try {
    const result = await client.query(
      `select started_at, completed_at, status, message from worker_runs where worker = 'momentum-alerts' order by started_at desc limit 1`,
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      updatedAt: asNumber(row.completed_at) ?? asNumber(row.started_at),
      status: String(row.status ?? "unknown"),
      message: typeof row.message === "string" ? row.message : null,
    };
  } catch (error) {
    markStoreUnavailable(error);
    return null;
  }
}
