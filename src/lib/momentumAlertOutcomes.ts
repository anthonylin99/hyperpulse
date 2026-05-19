import { Pool } from "pg";
import { getInfoClient } from "@/lib/hyperliquid";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import { listMomentumAlerts } from "@/lib/momentumAlerts";
import type { MomentumAlert, MomentumAlertOutcome, MomentumAlertOutcomeStatus, MomentumAlertOutcomeSummary } from "@/types";

const DATABASE_URL = getPooledDatabaseUrl();
const STORE_BACKOFF_MS = 5 * 60 * 1000;
const OUTCOME_HORIZON_MS = 72 * 60 * 60 * 1000;
const REEVALUATE_OPEN_AFTER_MS = 15 * 60 * 1000;
const MAX_LIMIT = 50;

let pool: Pool | null = null;
let disabledUntil = 0;

type Candle = {
  time: number;
  high: number;
  low: number;
  close: number;
};

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  return pool;
}

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + STORE_BACKOFF_MS;
  console.warn("[alert-outcomes] unavailable", error);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function directionOf(alert: MomentumAlert): "long" | "short" {
  return alert.payload?.direction === "short" ? "short" : "long";
}

function coinOf(alert: MomentumAlert): string {
  const rawName = alert.payload?.rawName;
  return typeof rawName === "string" && rawName.trim() ? rawName.trim() : alert.asset;
}

async function ensureAlertOutcomeTable(): Promise<void> {
  const client = getPool();
  if (!client) return;
  await client.query(`
    create table if not exists alert_outcomes (
      alert_id text primary key,
      asset text not null,
      direction text not null,
      evaluated_at bigint not null,
      horizon_ms bigint not null,
      horizon_complete boolean not null default false,
      outcome text not null,
      hit_time bigint,
      hit_price double precision,
      time_to_hit_ms bigint,
      outcome_return_pct double precision,
      max_favorable_pct double precision,
      max_adverse_pct double precision,
      candles_checked integer not null default 0,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await client.query(`create index if not exists alert_outcomes_asset_idx on alert_outcomes (asset, evaluated_at desc);`);
  await client.query(`create index if not exists alert_outcomes_outcome_idx on alert_outcomes (outcome, evaluated_at desc);`);
}

function normalizeOutcome(row: Record<string, unknown>): MomentumAlertOutcome {
  const outcome = String(row.outcome) as MomentumAlertOutcomeStatus;
  return {
    alertId: String(row.alert_id),
    asset: String(row.asset),
    direction: String(row.direction) === "short" ? "short" : "long",
    outcome,
    evaluatedAt: Number(row.evaluated_at),
    horizonMs: Number(row.horizon_ms),
    horizonComplete: Boolean(row.horizon_complete),
    hitTime: asNumber(row.hit_time),
    hitPrice: asNumber(row.hit_price),
    timeToHitMs: asNumber(row.time_to_hit_ms),
    outcomeReturnPct: asNumber(row.outcome_return_pct),
    maxFavorablePct: asNumber(row.max_favorable_pct),
    maxAdversePct: asNumber(row.max_adverse_pct),
    candlesChecked: Number(row.candles_checked ?? 0),
  };
}

function parseCandle(candle: Record<string, unknown>): Candle | null {
  const rawTime = Number(candle.t ?? candle.T ?? candle.time ?? candle.openTime ?? 0);
  const time = rawTime > 10_000_000_000 ? rawTime : rawTime * 1000;
  const high = asNumber(candle.h ?? candle.high);
  const low = asNumber(candle.l ?? candle.low);
  const close = asNumber(candle.c ?? candle.close);
  if (time <= 0 || high == null || low == null || close == null || high <= 0 || low <= 0 || close <= 0 || high < low) return null;
  return { time, high, low, close };
}

function pctMove(direction: "long" | "short", exit: number | null, entry: number): number | null {
  if (exit == null || !Number.isFinite(exit) || !Number.isFinite(entry) || entry <= 0) return null;
  return direction === "long" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
}

function validateLevels(alert: MomentumAlert, direction: "long" | "short"): boolean {
  const entry = alert.alertPrice;
  const target = alert.targetPrice;
  const invalidation = alert.invalidationPrice;
  if (![entry, target, invalidation].every((value) => value != null && Number.isFinite(value) && Number(value) > 0)) return false;
  if (target == null || invalidation == null) return false;
  return direction === "long" ? target > entry && invalidation < entry : target < entry && invalidation > entry;
}

async function fetchCandles(alert: MomentumAlert): Promise<Candle[]> {
  const info = getInfoClient("mainnet");
  const now = Date.now();
  const startTime = Math.max(1, alert.createdAt);
  const endTime = Math.min(alert.createdAt + OUTCOME_HORIZON_MS, now);
  if (endTime <= startTime) return [];
  const data = await info.candleSnapshot({
    coin: coinOf(alert),
    interval: "1m",
    startTime,
    endTime,
  });
  return Array.isArray(data)
    ? data.map((candle) => parseCandle(candle as Record<string, unknown>)).filter((candle): candle is Candle => Boolean(candle)).sort((a, b) => a.time - b.time)
    : [];
}

export async function evaluateMomentumAlert(alert: MomentumAlert): Promise<MomentumAlertOutcome> {
  const direction = directionOf(alert);
  const now = Date.now();
  const horizonComplete = now >= alert.createdAt + OUTCOME_HORIZON_MS;
  if (!validateLevels(alert, direction)) {
    return {
      alertId: alert.id,
      asset: alert.asset,
      direction,
      outcome: "invalid_levels",
      evaluatedAt: now,
      horizonMs: OUTCOME_HORIZON_MS,
      horizonComplete,
      hitTime: null,
      hitPrice: null,
      timeToHitMs: null,
      outcomeReturnPct: null,
      maxFavorablePct: null,
      maxAdversePct: null,
      candlesChecked: 0,
    };
  }

  const candles = await fetchCandles(alert);
  if (candles.length === 0) {
    return {
      alertId: alert.id,
      asset: alert.asset,
      direction,
      outcome: "no_candles",
      evaluatedAt: now,
      horizonMs: OUTCOME_HORIZON_MS,
      horizonComplete,
      hitTime: null,
      hitPrice: null,
      timeToHitMs: null,
      outcomeReturnPct: null,
      maxFavorablePct: null,
      maxAdversePct: null,
      candlesChecked: 0,
    };
  }

  let maxFavorablePct: number | null = null;
  let maxAdversePct: number | null = null;
  const entry = alert.alertPrice;
  const target = Number(alert.targetPrice);
  const invalidation = Number(alert.invalidationPrice);
  let firstOutcome: MomentumAlertOutcomeStatus | null = null;
  let hitTime: number | null = null;
  let hitPrice: number | null = null;
  let timeToHitMs: number | null = null;
  let outcomeReturnPct: number | null = null;

  for (const candle of candles) {
    const favorable = direction === "long" ? pctMove(direction, candle.high, entry) : pctMove(direction, candle.low, entry);
    const adverse = direction === "long" ? pctMove(direction, candle.low, entry) : pctMove(direction, candle.high, entry);
    if (favorable != null) maxFavorablePct = maxFavorablePct == null ? favorable : Math.max(maxFavorablePct, favorable);
    if (adverse != null) maxAdversePct = maxAdversePct == null ? adverse : Math.min(maxAdversePct, adverse);

    if (firstOutcome) continue;

    const tpHit = direction === "long" ? candle.high >= target : candle.low <= target;
    const slHit = direction === "long" ? candle.low <= invalidation : candle.high >= invalidation;
    if (!tpHit && !slHit) continue;

    hitTime = candle.time;
    timeToHitMs = Math.max(0, candle.time - alert.createdAt);
    if (tpHit && slHit) {
      firstOutcome = "ambiguous";
      continue;
    }

    firstOutcome = tpHit ? "tp_first" : "sl_first";
    hitPrice = tpHit ? target : invalidation;
    outcomeReturnPct = pctMove(direction, hitPrice, entry);
  }

  if (firstOutcome) {
    return {
      alertId: alert.id,
      asset: alert.asset,
      direction,
      outcome: firstOutcome,
      evaluatedAt: now,
      horizonMs: OUTCOME_HORIZON_MS,
      horizonComplete,
      hitTime,
      hitPrice,
      timeToHitMs,
      outcomeReturnPct,
      maxFavorablePct,
      maxAdversePct,
      candlesChecked: candles.length,
    };
  }

  const lastClose = candles[candles.length - 1]?.close ?? null;
  return {
    alertId: alert.id,
    asset: alert.asset,
    direction,
    outcome: "open",
    evaluatedAt: now,
    horizonMs: OUTCOME_HORIZON_MS,
    horizonComplete,
    hitTime: null,
    hitPrice: null,
    timeToHitMs: null,
    outcomeReturnPct: pctMove(direction, lastClose, entry),
    maxFavorablePct,
    maxAdversePct,
    candlesChecked: candles.length,
  };
}

function shouldReevaluate(outcome: MomentumAlertOutcome | undefined): boolean {
  if (!outcome) return true;
  if (outcome.outcome !== "open" && outcome.outcome !== "no_candles") return false;
  if (outcome.horizonComplete) return false;
  return Date.now() - outcome.evaluatedAt > REEVALUATE_OPEN_AFTER_MS;
}

async function loadStoredOutcomes(alertIds: string[]): Promise<Map<string, MomentumAlertOutcome>> {
  const client = getPool();
  if (!client || alertIds.length === 0) return new Map();
  await ensureAlertOutcomeTable();
  const result = await client.query(`select * from alert_outcomes where alert_id = any($1::text[])`, [alertIds]);
  return new Map(result.rows.map((row) => [String(row.alert_id), normalizeOutcome(row)]));
}

async function saveOutcome(outcome: MomentumAlertOutcome): Promise<void> {
  const client = getPool();
  if (!client) return;
  await ensureAlertOutcomeTable();
  await client.query(
    `insert into alert_outcomes (
      alert_id, asset, direction, evaluated_at, horizon_ms, horizon_complete, outcome,
      hit_time, hit_price, time_to_hit_ms, outcome_return_pct, max_favorable_pct,
      max_adverse_pct, candles_checked, payload
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    on conflict (alert_id) do update set
      direction = excluded.direction,
      evaluated_at = excluded.evaluated_at,
      horizon_ms = excluded.horizon_ms,
      horizon_complete = excluded.horizon_complete,
      outcome = excluded.outcome,
      hit_time = excluded.hit_time,
      hit_price = excluded.hit_price,
      time_to_hit_ms = excluded.time_to_hit_ms,
      outcome_return_pct = excluded.outcome_return_pct,
      max_favorable_pct = excluded.max_favorable_pct,
      max_adverse_pct = excluded.max_adverse_pct,
      candles_checked = excluded.candles_checked,
      payload = excluded.payload`,
    [
      outcome.alertId,
      outcome.asset,
      outcome.direction,
      outcome.evaluatedAt,
      outcome.horizonMs,
      outcome.horizonComplete,
      outcome.outcome,
      outcome.hitTime,
      outcome.hitPrice,
      outcome.timeToHitMs,
      outcome.outcomeReturnPct,
      outcome.maxFavorablePct,
      outcome.maxAdversePct,
      outcome.candlesChecked,
      JSON.stringify({ version: 1 }),
    ],
  );
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildZoneQuality(summary: Omit<MomentumAlertOutcomeSummary, "zoneQuality">): string {
  if (summary.evaluated === 0) return "No completed TP/SL sample yet.";
  if (summary.wins === 0 && summary.losses === 0) return "Most alerts are still unresolved; wait for more TP/SL touches before adjusting zones.";
  if ((summary.winRatePct ?? 0) >= 55 && (summary.averageMaxFavorablePct ?? 0) > Math.abs(summary.averageMaxAdversePct ?? 0)) {
    return "Targets are winning more often than stops and MFE is larger than MAE; current zones are directionally useful.";
  }
  if ((summary.averageMaxFavorablePct ?? 0) > 2 * Math.abs(summary.averageMaxAdversePct ?? 0) && (summary.winRatePct ?? 0) < 50) {
    return "Alerts often move favorably before failing; consider tighter first targets or trailing exits.";
  }
  if ((summary.lossRatePct ?? 0) > 50) return "Stops are being touched first too often; invalidation zones may be too tight or entries too late.";
  return "Zone quality is mixed; keep tracking first-touch outcomes before changing the alert rules.";
}

export function summarizeMomentumAlertOutcomes(outcomes: MomentumAlertOutcome[]): MomentumAlertOutcomeSummary {
  const wins = outcomes.filter((outcome) => outcome.outcome === "tp_first").length;
  const losses = outcomes.filter((outcome) => outcome.outcome === "sl_first").length;
  const ambiguous = outcomes.filter((outcome) => outcome.outcome === "ambiguous").length;
  const open = outcomes.filter((outcome) => outcome.outcome === "open").length;
  const invalid = outcomes.filter((outcome) => outcome.outcome === "invalid_levels").length;
  const noCandles = outcomes.filter((outcome) => outcome.outcome === "no_candles").length;
  const resolved = wins + losses;
  const base = {
    evaluated: outcomes.length,
    wins,
    losses,
    ambiguous,
    open,
    invalid,
    noCandles,
    winRatePct: resolved > 0 ? (wins / resolved) * 100 : null,
    lossRatePct: resolved > 0 ? (losses / resolved) * 100 : null,
    medianTimeToHitMs: median(outcomes.map((outcome) => outcome.timeToHitMs).filter((value): value is number => value != null)),
    averageMaxFavorablePct: average(outcomes.map((outcome) => outcome.maxFavorablePct)),
    averageMaxAdversePct: average(outcomes.map((outcome) => outcome.maxAdversePct)),
  };
  return { ...base, zoneQuality: buildZoneQuality(base) };
}

export async function getMomentumAlertOutcomes(limit = MAX_LIMIT): Promise<{ outcomes: MomentumAlertOutcome[]; summary: MomentumAlertOutcomeSummary; generatedAt: number; source: string }> {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), MAX_LIMIT);
  const alerts = await listMomentumAlerts(safeLimit);
  const alertIds = alerts.map((alert) => alert.id);
  const stored = await loadStoredOutcomes(alertIds).catch((error) => {
    markStoreUnavailable(error);
    return new Map<string, MomentumAlertOutcome>();
  });
  const outcomes = new Map(stored);
  const queue = alerts.filter((alert) => shouldReevaluate(outcomes.get(alert.id)));

  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const alert = queue.shift();
      if (!alert) return;
      try {
        const outcome = await evaluateMomentumAlert(alert);
        outcomes.set(alert.id, outcome);
        await saveOutcome(outcome).catch((error) => markStoreUnavailable(error));
      } catch (error) {
        console.warn(`[alert-outcomes] failed to evaluate ${alert.id}`, error);
      }
    }
  });
  await Promise.all(workers);

  const ordered = alerts.map((alert) => outcomes.get(alert.id)).filter((outcome): outcome is MomentumAlertOutcome => Boolean(outcome));
  return {
    outcomes: ordered,
    summary: summarizeMomentumAlertOutcomes(ordered),
    generatedAt: Date.now(),
    source: "momentum-alert-events:first-touch-72h",
  };
}
