import fs from "node:fs";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
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
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--env=")) loadEnv(arg.slice("--env=".length));
}

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
const customText = process.argv.slice(2).filter((arg) => !arg.startsWith("--env=")).join(" ");
const text = customText || [
  "HYPERPULSE · TEST",
  "ZEC LONG · BREAKOUT",
  "Now: $602.10 · 1h +2.8% · 4h +4.7%",
  "Broke: $594.03",
  "Trim: $612.28 · Invalid < $569.20",
  "Context: vol 2.6x · funding rich +99.1%",
  "Chart: https://hyperpulsehl.com/markets?asset=ZEC",
].join("\n");

if (!token || !chatId) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.ok === false) {
  console.error(payload?.description || `Telegram request failed with ${response.status}`);
  process.exit(1);
}
console.log("telegram smoke sent");
