#!/usr/bin/env node

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://hyperpulsehl.com").replace(/\/$/, "");
const TELEGRAM_ENABLED = String(process.env.TELEGRAM_ENABLED ?? "true").toLowerCase() !== "false";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DRY_RUN = process.argv.includes("--dry-run");

function normalizeText(text) {
  return text.replace(/[ \t]+\n/g, "\n").trim();
}

async function main() {
  const response = await fetch(`${APP_URL}/api/factors/report`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Market brief request failed with ${response.status}`);
  const payload = await response.json();
  const report = payload?.report;
  if (!report || !Array.isArray(report.telegramSummary)) throw new Error("Market brief payload missing telegramSummary.");

  const lines = [
    ...report.telegramSummary,
    "",
    "Full report:",
    `${APP_URL}/docs/factors`,
  ];
  const text = normalizeText(lines.join("\n"));

  if (DRY_RUN || !TELEGRAM_ENABLED) {
    console.log(text);
    return;
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");

  const telegram = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const telegramPayload = await telegram.json().catch(() => null);
  if (!telegram.ok) throw new Error(telegramPayload?.description || `Telegram request failed with ${telegram.status}`);
  console.log(`[market-brief] telegram sent message_id=${telegramPayload?.result?.message_id ?? "unknown"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
