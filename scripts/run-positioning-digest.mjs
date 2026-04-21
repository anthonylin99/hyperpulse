import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, 'workers/whale-indexer/.env'));

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL is required to run the positioning digest.');
}

const POSITIONING_DIGEST_INTERVAL_MS = envNumber('POSITIONING_DIGEST_INTERVAL_MS', 2 * 60 * 60 * 1000);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hyperpulse-gold.vercel.app';
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const args = new Set(process.argv.slice(2));
const queueTelegram = args.has('--queue-telegram');
const scheduledMode = args.has('--scheduled');
const requestedWindowHours = parseHoursFlag(process.argv.slice(2)) || Math.max(Math.round(POSITIONING_DIGEST_INTERVAL_MS / (60 * 60 * 1000)), 1);
const windowMs = requestedWindowHours * 60 * 60 * 1000;

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseHoursFlag(argv) {
  const match = argv.find((arg) => arg.startsWith('--window-hours='));
  if (!match) return null;
  const value = Number(match.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n/g, '\n');
  }
}

function formatPct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function buildDigestMessage(digest) {
  return [
    '📬 HYPERPULSE POSITIONING DIGEST',
    digest.headline,
    ...digest.summaryLines,
    `APP: ${APP_URL}/whales`,
  ].join('\n');
}

async function main() {
  const now = Date.now();
  const periodEnd = Math.floor(now / windowMs) * windowMs;
  const periodStart = periodEnd - windowMs;
  const digestId = scheduledMode ? `digest:${periodEnd}` : `manual-digest:${now}`;

  if (scheduledMode) {
    const existing = await pool.query(`select payload from positioning_digest_runs where id = $1 limit 1`, [digestId]);
    if (existing.rows[0]?.payload) {
      console.log(JSON.stringify(existing.rows[0].payload, null, 2));
      return;
    }
  }

  const alertsResult = await pool.query(
    `select payload from positioning_alerts where created_at >= $1 and created_at < $2 order by created_at desc limit 12`,
    [periodStart, periodEnd],
  );
  const alerts = alertsResult.rows.map((row) => row.payload);
  const crowding = alerts.filter((alert) => alert.alertType === 'crowding').slice(0, 3);
  const liquidation = alerts.filter((alert) => alert.alertType === 'liquidation_pressure').slice(0, 2);
  const whale = alerts.find((alert) => alert.alertType === 'high_conviction_whale') || null;

  const summaryLines = [];
  if (crowding.length > 0) {
    summaryLines.push(...crowding.map((alert) => `CROWDING: ${alert.asset} · ${alert.whyItMatters}`));
  } else {
    const snapshotsResult = await pool.query(
      `select payload from positioning_market_snapshots where created_at >= $1 order by created_at desc limit 60`,
      [periodStart - windowMs],
    );
    const latest = snapshotsResult.rows
      .map((row) => row.payload)
      .sort((a, b) => Math.abs((b.oiChange4h || 0)) - Math.abs((a.oiChange4h || 0)))
      .slice(0, 2);
    if (latest.length > 0) {
      summaryLines.push(...latest.map((snapshot) => `SETUP: ${snapshot.asset} funding ${formatPct(snapshot.fundingAPR)} · OI ${requestedWindowHours}h ${formatPct(snapshot.oiChange4h ?? snapshot.oiChange1h)}`));
    } else {
      summaryLines.push('No major crowding setups crossed the high-confidence threshold in this window.');
    }
  }

  if (liquidation.length > 0) {
    summaryLines.push(...liquidation.map((alert) => `LIQUIDATION: ${alert.asset} · ${alert.whyItMatters}`));
  } else {
    summaryLines.push('No tracked-book liquidation magnets passed the alert threshold in this window.');
  }

  if (whale) {
    summaryLines.push(`RARE WHALE: ${whale.asset} · ${whale.whyItMatters}`);
  }

  const digest = {
    id: digestId,
    createdAt: now,
    periodStart,
    periodEnd,
    headline: `${scheduledMode ? 'Window' : 'Manual preview'} ${new Date(periodStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${new Date(periodEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    summaryLines,
    alertIds: alerts.map((alert) => alert.id),
    telegramSentAt: null,
    payload: {
      manual: !scheduledMode,
      source: 'scripts/run-positioning-digest.mjs',
      windowHours: requestedWindowHours,
      alertCount: alerts.length,
    },
  };

  const message = buildDigestMessage(digest);
  const messageHash = createHash('sha256').update(message).digest('hex');

  await pool.query(
    `insert into positioning_digest_runs (id, created_at, payload, message_hash, telegram_sent_at)
     values ($1, $2, $3::jsonb, $4, $5)
     on conflict (id) do update set payload = excluded.payload, message_hash = excluded.message_hash, telegram_sent_at = excluded.telegram_sent_at`,
    [digest.id, digest.createdAt, JSON.stringify(digest), messageHash, null],
  );

  if (queueTelegram && TELEGRAM_ENABLED && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    await pool.query(
      `insert into whale_telegram_queue (id, alert_id, created_at, message_hash, payload)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (alert_id) do nothing`,
      [`tg:${digest.id}`, digest.id, now, messageHash, JSON.stringify({ kind: 'positioning-digest', digest, message })],
    );
  }

  console.log(JSON.stringify({
    digest,
    message,
    queuedTelegram: queueTelegram && TELEGRAM_ENABLED && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID,
    windowHours: requestedWindowHours,
    summaryLineCount: summaryLines.length,
    latestAlertCount: alerts.length,
    strongestTrackedMove:
      liquidation[0]?.trackedLiquidationClusterUsd != null
        ? `${liquidation[0].asset} ${formatCompact(liquidation[0].trackedLiquidationClusterUsd)}`
        : null,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
