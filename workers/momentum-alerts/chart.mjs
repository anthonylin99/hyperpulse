import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 560;
const PLOT = { x: 64, y: 104, width: 1032, height: 350 };
const RIGHT_CANDLE_PAD = 74;
const FONT_SANS = "DejaVu Sans, Arial, sans-serif";
const FONT_MONO = "DejaVu Sans Mono, Menlo, monospace";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatTimeEst(time) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(time));
}

function normalizedCandles(candles) {
  return candles
    .map((candle) => ({
      time: parseNumber(candle.time ?? candle.t),
      open: parseNumber(candle.open ?? candle.o),
      high: parseNumber(candle.high ?? candle.h),
      low: parseNumber(candle.low ?? candle.l),
      close: parseNumber(candle.close ?? candle.c),
    }))
    .filter((candle) => candle.time && [candle.open, candle.high, candle.low, candle.close].every((value) => value && value > 0))
    .sort((a, b) => a.time - b.time)
    .slice(-72);
}

function levelLine({ y, color, dash = "7 7", width = 1.6 }) {
  return `
    <line x1="${PLOT.x}" y1="${y}" x2="${PLOT.x + PLOT.width}" y2="${y}" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.74" />
  `;
}

function buildMomentumChartSvg({ alert, candles }) {
  const rows = normalizedCandles(candles);
  if (rows.length < 5) throw new Error("Not enough candle data for Telegram chart.");

  const direction = alert.payload?.direction === "short" ? "SHORT" : "LONG";
  const isShort = direction === "SHORT";
  const alertPrice = parseNumber(alert.alertPrice);
  const targetPrice = parseNumber(alert.targetPrice);
  const invalidationPrice = parseNumber(alert.invalidationPrice);
  const allPrices = rows.flatMap((row) => [row.high, row.low]);
  for (const value of [alertPrice, targetPrice, invalidationPrice]) {
    if (Number.isFinite(value)) allPrices.push(value);
  }
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const pad = Math.max((maxPrice - minPrice) * 0.08, maxPrice * 0.002);
  const yMin = minPrice - pad;
  const yMax = maxPrice + pad;
  const drawableWidth = PLOT.width - RIGHT_CANDLE_PAD;
  const xFor = (index) => PLOT.x + (index / Math.max(rows.length - 1, 1)) * drawableWidth;
  const yFor = (price) => PLOT.y + ((yMax - price) / (yMax - yMin)) * PLOT.height;
  const candleWidth = Math.max(5, Math.min(12, drawableWidth / rows.length * 0.62));

  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = PLOT.y + (PLOT.height / 4) * i;
    const price = yMax - ((yMax - yMin) / 4) * i;
    grid.push(`<line x1="${PLOT.x}" y1="${y}" x2="${PLOT.x + PLOT.width}" y2="${y}" stroke="#1f2937" stroke-width="1" opacity="0.85" />`);
    grid.push(`<text x="${PLOT.x + PLOT.width - 10}" y="${y + 6}" fill="#8b949e" text-anchor="end" font-family="${FONT_MONO}" font-size="15">${escapeXml(formatPrice(price).replace("$", ""))}</text>`);
  }
  for (let i = 0; i <= 5; i += 1) {
    const x = PLOT.x + (PLOT.width / 5) * i;
    grid.push(`<line x1="${x}" y1="${PLOT.y}" x2="${x}" y2="${PLOT.y + PLOT.height}" stroke="#111827" stroke-width="1" opacity="0.9" />`);
  }

  const candleSvg = rows.map((row, index) => {
    const x = xFor(index);
    const up = row.close >= row.open;
    const color = up ? "#34d399" : "#fb7185";
    const highY = yFor(row.high);
    const lowY = yFor(row.low);
    const openY = yFor(row.open);
    const closeY = yFor(row.close);
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 2);
    return `
      <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="2" />
      <rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyH}" rx="1.5" fill="${color}" opacity="0.96" />
    `;
  }).join("");

  const last = rows[rows.length - 1];
  const targetColor = isShort ? "#fb7185" : "#34d399";
  const invalidColor = isShort ? "#34d399" : "#fb7185";
  const currentY = yFor(last.close);
  const alertY = Number.isFinite(alertPrice) ? yFor(alertPrice) : null;
  const targetY = Number.isFinite(targetPrice) ? yFor(targetPrice) : null;
  const invalidY = Number.isFinite(invalidationPrice) ? yFor(invalidationPrice) : null;
  const startLabel = formatTimeEst(rows[0].time);
  const endLabel = formatTimeEst(last.time);
  const title = `${alert.asset} ${isShort ? "SHORT BIAS" : "LONG"}`;
  const subtitle = `${formatPrice(alertPrice)} · 1h ${formatPct(alert.return1hPct)} · 4h ${formatPct(alert.return4hPct)} · 24h ${formatPct(alert.return24hPct)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07110f" />
        <stop offset="46%" stop-color="#0a0c10" />
        <stop offset="100%" stop-color="#13171f" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" rx="34" fill="url(#bg)" />
    <rect x="28" y="28" width="${WIDTH - 56}" height="${HEIGHT - 56}" rx="26" fill="#0a0c10" stroke="#23312f" stroke-width="1.5" />
    <text x="64" y="72" fill="#ecfdf5" font-family="${FONT_SANS}" font-size="34" font-weight="800">${escapeXml(title)}</text>
    <text x="${WIDTH - 64}" y="72" fill="#9ca3af" text-anchor="end" font-family="${FONT_MONO}" font-size="18">${escapeXml(subtitle)}</text>
    <rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.width}" height="${PLOT.height}" rx="18" fill="#080b0f" stroke="#1f2937" />
    ${grid.join("")}
    ${alertY ? levelLine({ y: alertY, color: "#f8fafc", dash: "4 7", width: 1.4 }) : ""}
    ${targetY ? levelLine({ y: targetY, color: targetColor }) : ""}
    ${invalidY ? levelLine({ y: invalidY, color: invalidColor }) : ""}
    ${candleSvg}
    <circle cx="${xFor(rows.length - 1)}" cy="${currentY}" r="4.5" fill="#f8fafc" stroke="#0a0c10" stroke-width="2" />
    <text x="${PLOT.x}" y="${PLOT.y + PLOT.height + 32}" fill="#8b949e" font-family="${FONT_MONO}" font-size="15">${escapeXml(startLabel)} EST</text>
    <text x="${PLOT.x + PLOT.width}" y="${PLOT.y + PLOT.height + 32}" fill="#8b949e" text-anchor="end" font-family="${FONT_MONO}" font-size="15">${escapeXml(endLabel)} EST</text>
    <rect x="64" y="500" width="1072" height="34" rx="12" fill="#0f172a" stroke="#1f2937" />
    <circle cx="88" cy="517" r="5" fill="#f8fafc" />
    <text x="104" y="522" fill="#cbd5e1" font-family="${FONT_MONO}" font-size="14">Entry ${escapeXml(formatPrice(alertPrice))}</text>
    <circle cx="300" cy="517" r="5" fill="${targetColor}" />
    <text x="316" y="522" fill="#cbd5e1" font-family="${FONT_MONO}" font-size="14">${isShort ? "Cover" : "Trim"} ${escapeXml(formatPrice(targetPrice))}</text>
    <circle cx="540" cy="517" r="5" fill="${invalidColor}" />
    <text x="556" y="522" fill="#cbd5e1" font-family="${FONT_MONO}" font-size="14">Invalid ${isShort ? "above" : "below"} ${escapeXml(formatPrice(invalidationPrice))}</text>
  </svg>`;
}

export async function renderMomentumChartPng({ alert, candles }) {
  const svg = buildMomentumChartSvg({ alert, candles });
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}
