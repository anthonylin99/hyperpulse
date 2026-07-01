#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] ??= value;
  }
}

for (const file of [".env.local", ".env", "workers/momentum-alerts/.env"]) loadEnv(file);

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://hyperpulsehl.com").replace(/\/$/, "");
const TELEGRAM_ENABLED = String(process.env.TELEGRAM_ENABLED ?? "true").toLowerCase() !== "false";
const TELEGRAM_BOT_TOKEN = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = cleanEnv(process.env.TELEGRAM_CHAT_ID);
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const STATE_PATH = resolve(process.env.DAILY_SIGNAL_STATE_PATH || "tmp/daily-quality-signal-state.json");
const TIME_ZONE = process.env.DAILY_SIGNAL_TIME_ZONE || "America/New_York";

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function dayKey(time = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

function readState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function normalizeText(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatPct(value, digits = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(digits)}%`;
}

function formatUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "n/a";
  if (parsed >= 1000) return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (parsed >= 1) return `$${parsed.toFixed(2)}`;
  return `$${parsed.toPrecision(4)}`;
}

function setupStatus(setup) {
  if (!setup || setup.status === "no-trade" || setup.coin === "MARKET") return "STAND DOWN";
  if (setup.status === "active") return "ACTIVE";
  if (setup.status === "watch") return "WATCH";
  return String(setup.status || "WATCH").toUpperCase();
}

function setupSide(setup) {
  if (!setup || setup.side === "watch") return "WATCH";
  return String(setup.side || "watch").toUpperCase();
}

function buildMessage({ setupPayload, radarPayload, signalsPayload }) {
  const setup = setupPayload?.setup;
  const status = setupStatus(setup);
  const radar = Array.isArray(radarPayload?.signals) ? radarPayload.signals.slice(0, 3) : [];
  const signals = Array.isArray(signalsPayload?.signals) ? signalsPayload.signals : [];
  const highQuality = signals.find((signal) =>
    signal?.severity === "high" &&
    (signal?.side === "long" || signal?.side === "short") &&
    signal?.family !== "top_mover" &&
    signal?.family !== "vault_operator",
  );

  if (status !== "STAND DOWN") {
    const lines = [
      "HYPERPULSE DAILY SIGNAL",
      `${setup.coin} ${setupSide(setup)} · ${status}`,
      "",
      setup.decisionLabel || setup.title,
      `Now: ${formatUsd(setup.markPx)} · Funding: ${formatPct(setup.fundingApr)} · 24h: ${formatPct(setup.priceChange24h)}`,
      `Trigger: ${formatUsd(setup.trigger)} · Invalid: ${formatUsd(setup.invalidation)} · Target: ${formatUsd(setup.target)}`,
      "",
      "Why:",
      ...(Array.isArray(setup.rationale) ? setup.rationale.slice(0, 3).map((item) => `- ${item}`) : []),
      "",
      `Open: ${APP_URL}/markets?asset=${encodeURIComponent(setup.coin)}`,
    ];
    return normalizeText(lines.join("\n"));
  }

  const radarLines = radar.map((signal) => `- ${signal.asset}: ${signal.label} (${signal.value})`);
  const fallbackLines = highQuality
    ? [
        "",
        "Best intel flag:",
        `${highQuality.asset ?? "MARKET"} ${String(highQuality.side).toUpperCase()} · ${highQuality.title}`,
        highQuality.summary,
      ]
    : [];

  return normalizeText([
    "HYPERPULSE DAILY SIGNAL",
    "STAND DOWN · no A-grade setup",
    "",
    setup?.rationale?.[0] || "No clean setup has both strong flow and clean price confirmation.",
    setup?.guardrails?.[0] || "Do not trade funding alone.",
    "",
    "Radar:",
    ...(radarLines.length ? radarLines : ["- No meaningful radar flags."]),
    ...fallbackLines,
    "",
    `Open: ${APP_URL}/signals`,
  ].join("\n"));
}

async function fetchJson(path) {
  const response = await fetch(`${APP_URL}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    return await fetchJson(path);
  } catch (error) {
    console.warn(`[daily-signal] optional context unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function sendTelegram(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram request failed with ${response.status}`);
  }
  return payload?.result?.message_id ?? null;
}

async function main() {
  const today = dayKey();
  const state = readState();
  if (state.lastSentDay === today && !FORCE) {
    console.log(`[daily-signal] skipped; already sent for ${today}. Use --force to resend.`);
    return;
  }

  const [setupPayload, radarPayload, signalsPayload] = await Promise.all([
    fetchJson("/api/market/daily-setup"),
    fetchOptionalJson("/api/market/radar"),
    fetchOptionalJson("/api/signals?limit=80"),
  ]);
  const text = buildMessage({ setupPayload, radarPayload, signalsPayload });

  if (DRY_RUN || !TELEGRAM_ENABLED) {
    console.log(text);
    return;
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");

  const messageId = await sendTelegram(text);
  writeState({
    ...state,
    lastSentDay: today,
    lastSentAt: Date.now(),
    lastMessageId: messageId,
    appUrl: APP_URL,
  });
  console.log(`[daily-signal] telegram sent day=${today} message_id=${messageId ?? "unknown"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
