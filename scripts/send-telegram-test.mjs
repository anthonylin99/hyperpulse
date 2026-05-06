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
loadEnv("workers/whale-indexer/.env");

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatId = process.env.TELEGRAM_CHAT_ID || "";
const text = process.argv.slice(2).join(" ") || [
  "🧪 HyperPulse momentum alert smoke test",
  "This proves Telegram delivery through the same TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env path.",
  `Time: ${new Date().toISOString()}`,
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
