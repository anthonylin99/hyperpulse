import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 680;
const PLOT = { x: 72, y: 118, width: 1016, height: 454 };

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
    .slice(-96);
}

function lineLabel({ y, text, color, x = PLOT.x + PLOT.width }) {
  return `
    <line x1="${PLOT.x}" y1="${y}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="2" stroke-dasharray="7 7" opacity="0.82" />
    <rect x="${x + 8}" y="${y - 18}" width="118" height="36" rx="8" fill="${color}" opacity="0.9" />
    <text x="${x + 67}" y="${y + 6}" fill="#06110f" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700">${escapeXml(text)}</text>
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
  const xFor = (index) => PLOT.x + (index / Math.max(rows.length - 1, 1)) * PLOT.width;
  const yFor = (price) => PLOT.y + ((yMax - price) / (yMax - yMin)) * PLOT.height;
  const candleWidth = Math.max(4, Math.min(10, PLOT.width / rows.length * 0.56));

  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = PLOT.y + (PLOT.height / 4) * i;
    const price = yMax - ((yMax - yMin) / 4) * i;
    grid.push(`<line x1="${PLOT.x}" y1="${y}" x2="${PLOT.x + PLOT.width}" y2="${y}" stroke="#1f2937" stroke-width="1" opacity="0.85" />`);
    grid.push(`<text x="${PLOT.x + PLOT.width + 16}" y="${y + 6}" fill="#8b949e" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16">${escapeXml(formatPrice(price).replace("$", ""))}</text>`);
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
  const title = `${alert.asset} ${direction} · ${alert.triggerKind === "momentum_ignition" ? (isShort ? "Breakdown" : "Breakout") : "Momentum continuation"}`;
  const subtitle = `1h ${formatPct(alert.return1hPct)} · 4h ${formatPct(alert.return4hPct)} · 24h ${formatPct(alert.return24hPct)} · vol ${Number(alert.volumeVsBaseline || 0).toFixed(1)}x`;

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
    <text x="72" y="72" fill="#ecfdf5" font-family="Inter, Geist, Arial, sans-serif" font-size="34" font-weight="800">${escapeXml(title)}</text>
    <text x="72" y="104" fill="#9ca3af" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18">${escapeXml(subtitle)}</text>
    <text x="${WIDTH - 72}" y="78" fill="#34d399" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" font-weight="800">HyperPulse</text>
    <rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.width}" height="${PLOT.height}" rx="18" fill="#080b0f" stroke="#1f2937" />
    ${grid.join("")}
    ${alertY ? `<line x1="${PLOT.x}" y1="${alertY}" x2="${PLOT.x + PLOT.width}" y2="${alertY}" stroke="#f8fafc" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.75" />` : ""}
    ${targetY ? lineLabel({ y: targetY, text: "TARGET", color: targetColor }) : ""}
    ${invalidY ? lineLabel({ y: invalidY, text: "INVALID", color: invalidColor }) : ""}
    ${candleSvg}
    <line x1="${PLOT.x}" y1="${currentY}" x2="${PLOT.x + PLOT.width}" y2="${currentY}" stroke="#e5e7eb" stroke-width="1.4" stroke-dasharray="4 6" opacity="0.8" />
    <rect x="${PLOT.x + PLOT.width + 8}" y="${currentY - 18}" width="118" height="36" rx="8" fill="#e5e7eb" />
    <text x="${PLOT.x + PLOT.width + 67}" y="${currentY + 6}" fill="#0a0c10" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="800">${escapeXml(formatPrice(last.close).replace("$", ""))}</text>
    <text x="${PLOT.x}" y="${PLOT.y + PLOT.height + 34}" fill="#8b949e" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16">${escapeXml(startLabel)} EST</text>
    <text x="${PLOT.x + PLOT.width}" y="${PLOT.y + PLOT.height + 34}" fill="#8b949e" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16">${escapeXml(endLabel)} EST</text>
    <rect x="72" y="610" width="1056" height="38" rx="14" fill="#0f172a" stroke="#1f2937" />
    <text x="92" y="635" fill="#cbd5e1" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16">Alert price ${escapeXml(formatPrice(alertPrice))} · Target ${escapeXml(formatPrice(targetPrice))} · Invalidation ${escapeXml(formatPrice(invalidationPrice))}</text>
  </svg>`;
}

export async function renderMomentumChartPng({ alert, candles }) {
  const svg = buildMomentumChartSvg({ alert, candles });
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}
