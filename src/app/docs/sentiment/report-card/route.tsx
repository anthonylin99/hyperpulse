import { ImageResponse } from "next/og";
import { buildHyperpulseSentimentReport } from "@/lib/sentimentReport";
import type { SentimentAsset, SentimentReport } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 1200 };

const colors = {
  bg: "#070a0f",
  panel: "#0f151d",
  border: "#25313d",
  muted: "#87919d",
  faint: "#56616c",
  text: "#f4f7f8",
  emerald: "#45e0ad",
  emeraldDark: "#0d4f3e",
  rose: "#fb7185",
  roseDark: "#5f1725",
  cyan: "#55d6f2",
  amber: "#f7cf63",
};

function formatPct(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

function compactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function toneColor(side: "long" | "short") {
  return side === "long" ? colors.emerald : colors.rose;
}

function confidenceColor(confidence: SentimentAsset["confidence"]) {
  if (confidence === "high") return colors.emerald;
  if (confidence === "medium") return colors.amber;
  return colors.muted;
}

function SentimentRow({ asset, side }: { asset: SentimentAsset; side: "long" | "short" }) {
  const fill = side === "long" ? "rgba(69,224,173,0.34)" : "rgba(251,113,133,0.34)";
  const border = side === "long" ? "rgba(69,224,173,0.42)" : "rgba(251,113,133,0.42)";
  const width = Math.max(20, Math.min(98, asset.displayPct));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: 88,
        border: `1px solid ${border}`,
        borderRadius: 18,
        background: "#0a0f15",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          ...(side === "long" ? { left: 0 } : { right: 0 }),
          top: 0,
          bottom: 0,
          width: `${width}%`,
          background: fill,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", padding: "0 22px", position: "relative" }}>
        <div style={{ display: "flex", width: 66, height: 66, borderRadius: 999, background: side === "long" ? colors.emeraldDark : colors.roseDark, alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: colors.text }}>
          {asset.symbol.slice(0, 2)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 950, color: colors.text }}>{asset.symbol}</div>
            <div style={{ fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: confidenceColor(asset.confidence), border: `1px solid ${confidenceColor(asset.confidence)}`, borderRadius: 999, padding: "4px 9px" }}>
              {asset.confidence}
            </div>
          </div>
          <div style={{ fontSize: 17, color: colors.muted }}>{asset.reason}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: toneColor(side) }}>{formatPct(asset.displayPct, 0)}</div>
          <div style={{ fontSize: 15, color: colors.muted }}>{`${compactUsd(asset.openInterestUsd)} OI`}</div>
        </div>
      </div>
    </div>
  );
}

function EmptySentimentCard({ side }: { side: "long" | "short" }) {
  const color = toneColor(side);
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        minHeight: 88,
        border: `1px dashed ${colors.border}`,
        borderRadius: 18,
        background: "rgba(10,15,21,0.72)",
        padding: "20px 22px",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 18, color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{`No clean inferred ${side}s`}</div>
      <div style={{ fontSize: 16, lineHeight: 1.35, color: colors.muted }}>Aggregate tilt still includes weaker reads, but noisy asset-level signals are hidden.</div>
    </div>
  );
}

function ReportCard({ report }: { report: SentimentReport }) {
  const tiltColor = report.totalLongPct >= report.totalShortPct ? colors.emerald : colors.rose;
  const sourceLine = `Snapshot ${new Date(report.generatedAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET · ${report.coverage.trackedAssetCount} HL perps`;

  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        display: "flex",
        flexDirection: "column",
        padding: 54,
        color: colors.text,
        background:
          "radial-gradient(circle at 20% 15%, rgba(69,224,173,0.20), transparent 26%), radial-gradient(circle at 90% 35%, rgba(251,113,133,0.16), transparent 26%), linear-gradient(135deg, #06080c 0%, #0a1118 100%)",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `2px solid ${colors.border}`, paddingBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 999, border: `2px solid ${colors.emerald}`, alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: colors.emerald }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: "-0.04em" }}>HyperPulse</div>
            <div style={{ fontSize: 14, color: colors.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>Inferred Retail Sentiment Index</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{report.periodLabel}</div>
          <div style={{ fontSize: 14, color: colors.muted }}>Public-flow proxy · not exact positions</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 30 }}>
        <div style={{ fontSize: 54, lineHeight: 1, fontWeight: 950, letterSpacing: "-0.055em" }}>Who is crowded long or short?</div>
        <div style={{ fontSize: 25, lineHeight: 1.3, color: "#d6e2e2", maxWidth: 980 }}>{report.summary}</div>
      </div>

      <div style={{ display: "flex", marginTop: 28, border: `1px solid ${colors.border}`, borderRadius: 22, overflow: "hidden", background: "#0a0f15" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: report.totalLongPct, padding: "20px 24px", background: "rgba(69,224,173,0.16)", gap: 5 }}>
          <div style={{ fontSize: 14, color: colors.emerald, textTransform: "uppercase", letterSpacing: "0.16em" }}>Total inferred long</div>
          <div style={{ fontSize: 42, fontWeight: 950, color: colors.emerald }}>{formatPct(report.totalLongPct)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: report.totalShortPct, padding: "20px 24px", background: "rgba(251,113,133,0.16)", alignItems: "flex-end", gap: 5 }}>
          <div style={{ fontSize: 14, color: colors.rose, textTransform: "uppercase", letterSpacing: "0.16em" }}>Total inferred short</div>
          <div style={{ fontSize: 42, fontWeight: 950, color: colors.rose }}>{formatPct(report.totalShortPct)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 30 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <div style={{ fontSize: 18, color: colors.emerald, letterSpacing: "0.18em", textTransform: "uppercase" }}>Inferred longs</div>
          {report.topLongs.length > 0 ? report.topLongs.map((asset) => <SentimentRow key={`long-${asset.symbol}`} asset={asset} side="long" />) : <EmptySentimentCard side="long" />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <div style={{ fontSize: 18, color: colors.rose, letterSpacing: "0.18em", textTransform: "uppercase" }}>Inferred shorts</div>
          {report.topShorts.length > 0 ? report.topShorts.map((asset) => <SentimentRow key={`short-${asset.symbol}`} asset={asset} side="short" />) : <EmptySentimentCard side="short" />}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 28, gap: 18 }}>
        <div style={{ display: "flex", flex: 1, border: `1px solid ${colors.border}`, borderRadius: 18, padding: 20, flexDirection: "column", gap: 8, background: "rgba(15,21,29,0.9)" }}>
          <div style={{ fontSize: 14, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>Confidence</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: confidenceColor(report.confidence) }}>{report.confidence.toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", flex: 1, border: `1px solid ${colors.border}`, borderRadius: 18, padding: 20, flexDirection: "column", gap: 8, background: "rgba(15,21,29,0.9)" }}>
          <div style={{ fontSize: 14, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>Net tilt</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: tiltColor }}>{`${report.netTiltPct >= 0 ? "+" : ""}${report.netTiltPct.toFixed(0)} pts`}</div>
        </div>
        <div style={{ display: "flex", flex: 1.4, border: `1px solid ${colors.border}`, borderRadius: 18, padding: 20, flexDirection: "column", gap: 8, background: "rgba(15,21,29,0.9)" }}>
          <div style={{ fontSize: 14, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>Method</div>
          <div style={{ fontSize: 18, lineHeight: 1.3, color: "#d8dee5" }}>Taker flow · OI change · funding · volume · Reaction Map zones</div>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "auto", borderTop: `1px solid ${colors.border}`, paddingTop: 20, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, color: colors.muted }}>{sourceLine}</div>
        <div style={{ display: "flex", gap: 5, fontSize: 15, color: colors.muted }}><span style={{ color: colors.text, fontWeight: 800 }}>Informational only.</span><span>Not investment advice.</span></div>
      </div>
    </div>
  );
}

export async function GET() {
  const report = await buildHyperpulseSentimentReport();
  return new ImageResponse(<ReportCard report={report} />, {
    ...size,
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
