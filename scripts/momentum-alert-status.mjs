import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

for (const file of [".env.local", ".env", "workers/momentum-alerts/.env"]) {
  if (!existsSync(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

const url = cleanEnv(
  process.env.NEON_DATABASE_URL_POOLING ??
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "",
);
if (!url) {
  console.error("NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required.");
  process.exit(1);
}

const telegramTokenPresent = Boolean(cleanEnv(process.env.TELEGRAM_BOT_TOKEN));
const telegramChatPresent = Boolean(cleanEnv(process.env.TELEGRAM_CHAT_ID));
const telegramEnv = cleanEnv(process.env.TELEGRAM_ENABLED).toLowerCase();
const telegramEnabled = telegramEnv === "false"
  ? false
  : telegramEnv === "true" || (telegramTokenPresent && telegramChatPresent);

const pool = new Pool({ connectionString: url, max: 1 });
const sinceMs = Date.now() - 24 * 60 * 60 * 1000;

function asIso(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : null;
}

function ageMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round((Date.now() - parsed) / 60_000);
}

try {
  console.log("\nLocal CLI config");
  console.table([{
    database: "configured",
    telegramToken: telegramTokenPresent ? "present" : "missing",
    telegramChat: telegramChatPresent ? "present" : "missing",
    telegramEnabled,
    dryRunEnv: process.env.MOMENTUM_ALERT_DRY_RUN ?? "unset",
  }]);

  const runs = await pool.query(
    `select started_at, completed_at, status, message, payload
     from worker_runs
     where worker = 'momentum-alerts'
     order by started_at desc
     limit 10`,
  );
  const latestRun = runs.rows[0];
  if (latestRun?.payload) {
    console.log("\nLatest production worker config observed");
    console.table([{
      dryRun: latestRun.payload.dryRun,
      telegramEnabled: latestRun.payload.telegramEnabled,
      telegramConfigured: latestRun.payload.telegramConfigured,
      telegramChartsEnabled: latestRun.payload.telegramChartsEnabled,
      telegramDailyCap: latestRun.payload.telegramDailyCap,
      telegramHourlyCap: latestRun.payload.telegramHourlyCap,
      maxTelegramPerCycle: latestRun.payload.maxTelegramPerCycle,
    }]);
  }
  console.log("\nMomentum worker runs");
  console.table(runs.rows.map((row) => ({
    started: asIso(row.started_at),
    ageMin: ageMinutes(row.started_at),
    completed: asIso(row.completed_at),
    status: row.status,
    dryRun: row.payload?.dryRun,
    scanned: row.payload?.scanned,
    candidates: row.payload?.candidates,
    inserted: row.payload?.inserted,
    queued: row.payload?.queued,
    requeued: row.payload?.requeued,
    sent: row.payload?.sent,
    selected: Array.isArray(row.payload?.selected) ? row.payload.selected.join(",") : "",
    message: row.message,
  })));

  const latestAge = ageMinutes(latestRun?.started_at);
  if (latestAge == null) {
    console.warn("\nALERT: no momentum worker runs found.");
  } else if (latestAge > 15) {
    console.warn(`\nALERT: latest momentum worker run is stale (${latestAge} minutes ago). Railway/worker is likely stopped.`);
  } else {
    console.log(`\nWorker freshness: latest run ${latestAge} minutes ago.`);
  }

  const alerts = await pool.query(
    `select asset, created_at, alert_price, score, severity, route_href
     from momentum_alert_events
     order by created_at desc
     limit 10`,
  );
  console.log("\nRecent momentum alerts");
  console.table(alerts.rows.map((row) => ({
    asset: row.asset,
    created: asIso(row.created_at),
    price: row.alert_price,
    score: row.score,
    severity: row.severity,
    route: row.route_href,
  })));

  const queue = await pool.query(
    `select status, count(*)::int as count
     from notification_queue
     where event_type = 'momentum_alert'
     group by status
     order by status`,
  );
  console.log("\nMomentum notification queue counts");
  console.table(queue.rows);

  const recentQueue = await pool.query(
    `select status, created_at, sent_at, attempts, last_error, payload->>'asset' as asset, payload
     from notification_queue
     where event_type = 'momentum_alert' and created_at >= $1
     order by created_at desc
     limit 10`,
    [sinceMs],
  );
  console.log("\nRecent queue rows 24h");
  console.table(recentQueue.rows.map((row) => ({
    status: row.status,
    asset: row.asset,
    created: asIso(row.created_at),
    sent: asIso(row.sent_at),
    attempts: row.attempts,
    error: row.last_error,
    method: row.payload?.telegramReceipt?.method ?? null,
    messageId: row.payload?.telegramReceipt?.messageId ?? null,
  })));
} finally {
  await pool.end();
}
