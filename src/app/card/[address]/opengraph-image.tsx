import { ImageResponse } from "next/og";
import { loadTradeReviewCard } from "@/lib/server/tradeReviewData";
import { formatSignedPct } from "@/lib/tradeReviewCard";

export const runtime = "nodejs";
export const alt = "HyperPulse — trade review";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The public X-unfurl card. Always %-only — dollar amounts never leave the
// owner's own view, honoring the privacy default.
export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  let card = null;
  try {
    card = (await loadTradeReviewCard(address)).card;
  } catch {
    card = null;
  }

  const win = card?.tone === "win";
  const accent = !card ? "#5eead4" : win ? "#34d399" : card.tone === "loss" ? "#fb7185" : "#a1a1aa";
  const glow = !card ? "rgba(45,212,191,0.18)" : win ? "rgba(52,211,153,0.20)" : card.tone === "loss" ? "rgba(251,113,133,0.18)" : "rgba(161,161,170,0.12)";

  const startBal = card?.startingBalanceUsd ?? 0;
  const pctOf = (usd: number) => (startBal > 0 ? (usd / startBal) * 100 : 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `radial-gradient(circle at top right, ${glow}, transparent 38%), linear-gradient(135deg, #081015 0%, #05080d 45%, #0a1117 100%)`,
          color: "#f4f4f5",
          padding: "56px 64px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: 20, height: 20, borderRadius: 999, background: "#5eead4", boxShadow: "0 0 24px rgba(45,212,191,0.6)" }} />
            <div style={{ fontSize: 30, letterSpacing: "-0.04em", fontWeight: 700 }}>HyperPulse</div>
            <div style={{ fontSize: 22, color: "#71717a" }}>· trade review</div>
          </div>
          <div style={{ fontSize: 20, color: "#a1a1aa" }}>
            {card ? `${card.handleShort} · ${card.period}` : "Hyperliquid"}
          </div>
        </div>

        {card ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
            {/* Hero */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: "-0.05em", color: accent }}>
                {card.heroValue}
              </div>
              <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa", letterSpacing: "0.02em" }}>{card.heroLabel}</div>
            </div>

            {/* Stat row */}
            <div style={{ display: "flex", gap: "48px", alignItems: "flex-end" }}>
              {card.returnConfident ? (
                <>
                  <Stat label="Win rate" value={`${card.winRatePct.toFixed(0)}%`} />
                  <Stat label="Trades" value={`${card.totalTrades}`} />
                  {card.biggestWin && (
                    <Stat label={`Biggest W · ${card.biggestWin.coin}`} value={formatSignedPct(pctOf(card.biggestWin.usd))} color="#34d399" />
                  )}
                  {card.biggestLoss && (
                    <Stat label={`Biggest L · ${card.biggestLoss.coin}`} value={formatSignedPct(pctOf(card.biggestLoss.usd))} color="#fb7185" />
                  )}
                </>
              ) : (
                <>
                  <Stat label="Trades" value={`${card.totalTrades}`} />
                  <Stat label="Profit factor" value={`${card.profitFactor.toFixed(2)}x`} />
                  <Stat label="Net" value={card.tone === "win" ? "positive" : card.tone === "loss" ? "negative" : "flat"} color={accent} />
                </>
              )}
            </div>

            {/* Verdict + footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: "#e4e4e7", fontStyle: "italic" }}>
                {`“${card.verdict}”`}
              </div>
              <div style={{ display: "flex", fontSize: 22, color: "#52525b" }}>hyperpulsehl.com</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#e4e4e7" }}>No closed trades yet</div>
            <div style={{ fontSize: 28, color: "#a1a1aa" }}>Connect a Hyperliquid wallet on hyperpulsehl.com to build your trade review.</div>
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "240px", flexShrink: 0 }}>
      <div style={{ display: "flex", fontSize: 18, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: color ?? "#f4f4f5", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
