#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { getPooledDatabaseUrl } from "./database-url.mjs";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnv(".env.local");
loadEnv(".env");
loadEnv("workers/momentum-alerts/.env");

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://hyperpulsehl.com").replace(/\/$/, "");
const TELEGRAM_ENABLED = String(process.env.TELEGRAM_ENABLED ?? "true").toLowerCase() !== "false";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID ?? "").trim().replace(/^["']|["']$/g, "");
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function normalizeCaption(lines) {
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").trim();
}

async function readDeliveryState(pool, reportId) {
  if (!pool) return null;
  const result = await pool.query(
    `select payload->>'telegramSentAt' as sent_at, payload->>'telegramMessageId' as message_id
     from sentiment_report_snapshots
     where report_id = $1
     limit 1`,
    [reportId],
  );
  return result.rows[0] ?? null;
}

async function markDelivered(pool, reportId, messageId) {
  if (!pool) return;
  await pool.query(
    `
    update sentiment_report_snapshots
    set payload = payload || jsonb_build_object(
      'telegramSentAt', $2::bigint,
      'telegramMessageId', $3::text
    )
    where report_id = $1
    `,
    [reportId, Date.now(), String(messageId ?? "")],
  );
}

async function main() {
  const response = await fetch(`${APP_URL}/api/sentiment/report`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Sentiment report request failed with ${response.status}`);
  const payload = await response.json();
  const report = payload?.report;
  if (!report?.id) throw new Error("Sentiment report payload missing report id.");

  const databaseUrl = getPooledDatabaseUrl();
  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 1 }) : null;
  try {
    const delivery = await readDeliveryState(pool, report.id);
    if (delivery?.sent_at && !FORCE) {
      console.log(`[sentiment-report] skipped; ${report.id} already sent message_id=${delivery.message_id || "unknown"}. Use --force to resend.`);
      return;
    }

    const caption = normalizeCaption([
      ...report.telegramSummary,
      "",
      "Share card:",
      `${APP_URL}/docs/sentiment`,
    ]);
    const photo = `${APP_URL}/docs/sentiment/report-card?v=${encodeURIComponent(report.id)}-${report.generatedAt}`;

    if (DRY_RUN || !TELEGRAM_ENABLED) {
      console.log(caption);
      console.log(`photo=${photo}`);
      return;
    }
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");

    const telegram = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        photo,
        caption,
      }),
    });
    const telegramPayload = await telegram.json().catch(() => null);
    if (!telegram.ok || telegramPayload?.ok === false) {
      throw new Error(telegramPayload?.description || `Telegram request failed with ${telegram.status}`);
    }
    await markDelivered(pool, report.id, telegramPayload?.result?.message_id);
    console.log(`[sentiment-report] telegram sent report_id=${report.id} message_id=${telegramPayload?.result?.message_id ?? "unknown"}`);
  } finally {
    await pool?.end().catch(() => null);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
