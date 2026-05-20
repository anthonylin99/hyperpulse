import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { buildHyperpulseFactorReport } from "@/lib/factorReport";
import type { FactorReport, MarketBriefAsset, MarketBriefTheme, MarketBriefPoint } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = {
  width: 1200,
  height: 1800,
};

const colors = {
  bg: "#070a0f",
  panel: "#0f141c",
  panel2: "#111820",
  border: "#27313d",
  muted: "#8a949f",
  faint: "#55606b",
  text: "#f4f7f8",
  emerald: "#45e0ad",
  emerald2: "#2ab98c",
  rose: "#fb7185",
  amber: "#f8d46c",
  cyan: "#54d9f2",
};

const divBase = { display: "flex" as const };

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatMultiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value > 20) return ">20x";
  return `${value.toFixed(value >= 10 ? 0 : 1)}x`;
}

function textColor(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return colors.muted;
  return value >= 0 ? colors.emerald : colors.rose;
}

function stripSummaryLabel(line: string) {
  const parts = line.split(" — ");
  return parts.length > 1 ? parts.slice(1).join(" — ") : line;
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function kpi(title: string, value: string, sub: string, tone: "neutral" | "good" | "bad" | "accent" = "neutral") {
  const valueColor = tone === "good" ? colors.emerald : tone === "bad" ? colors.rose : tone === "accent" ? colors.cyan : colors.text;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${colors.border}`,
        background: "rgba(15,20,28,0.9)",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ ...divBase, fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>{title}</div>
      <div style={{ ...divBase, fontSize: 36, lineHeight: 1, fontWeight: 800, color: valueColor }}>{value}</div>
      <div style={{ ...divBase, fontSize: 17, color: colors.muted, lineHeight: 1.25 }}>{sub}</div>
    </div>
  );
}

function ChartPanel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        border: `1px solid ${colors.border}`,
        background: colors.panel,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ ...divBase, fontSize: 22, fontWeight: 800, color: colors.text }}>{title}</div>
        <div style={{ ...divBase, fontSize: 15, lineHeight: 1.3, color: colors.muted }}>{caption}</div>
      </div>
      {children}
    </div>
  );
}

function BarRows({ assets, mode }: { assets: MarketBriefAsset[]; mode: "winners" | "losers" }) {
  const max = Math.max(...assets.map((asset) => Math.abs(asset.returnPct ?? 0)), 1);
  return (
    <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 11 }}>
      {assets.map((asset, index) => {
        const value = asset.returnPct ?? 0;
        const width = Math.max(8, Math.min(100, (Math.abs(value) / max) * 100));
        const fill = mode === "winners" ? colors.emerald2 : colors.rose;
        return (
          <div key={`${mode}-${asset.symbol}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ ...divBase, width: 34, fontSize: 14, color: colors.faint, fontWeight: 700 }}>{`#${index + 1}`}</div>
            <div style={{ ...divBase, width: 72, fontSize: 21, color: colors.text, fontWeight: 800 }}>{asset.symbol}</div>
            <div style={{ ...divBase, flex: 1, height: 14, background: "#080b10", display: "flex", alignItems: "stretch" }}>
              <div style={{ ...divBase, width: `${width}%`, background: fill }} />
            </div>
            <div style={{ ...divBase, width: 88, textAlign: "right", fontSize: 20, color: textColor(value), fontWeight: 800 }}>{formatPct(value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ThemeBars({ themes }: { themes: MarketBriefTheme[] }) {
  const max = Math.max(...themes.map((theme) => Math.abs(theme.averageReturnPct ?? 0)), 1);
  return (
    <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 13 }}>
      {themes.slice(0, 5).map((theme) => {
        const value = theme.averageReturnPct ?? 0;
        const width = Math.max(8, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={theme.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ ...divBase, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ ...divBase, fontSize: 18, color: colors.text, fontWeight: 750 }}>{truncate(theme.name, 28)}</div>
              <div style={{ ...divBase, fontSize: 18, color: textColor(value), fontWeight: 800 }}>{formatPct(value)}</div>
            </div>
            <div style={{ ...divBase, height: 13, background: "#080b10", display: "flex" }}>
              <div style={{ ...divBase, width: `${width}%`, background: value >= 0 ? colors.emerald2 : colors.rose }} />
            </div>
            <div style={{ ...divBase, fontSize: 13, color: colors.muted }}>{theme.leaders.join(" · ")}</div>
          </div>
        );
      })}
    </div>
  );
}

function RelativeRows({ assets }: { assets: MarketBriefAsset[] }) {
  return (
    <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 12 }}>
      {assets.slice(0, 5).map((asset) => (
        <div key={`relative-${asset.symbol}`} style={{ borderBottom: `1px solid rgba(39,49,61,0.6)`, paddingBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ ...divBase, width: 74, fontSize: 21, color: colors.text, fontWeight: 800 }}>{asset.symbol}</div>
          <div style={{ ...divBase, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ ...divBase, fontSize: 14, color: colors.muted }}>{truncate(asset.theme, 34)}</div>
            <div style={{ ...divBase, display: "flex", gap: 10 }}>
              <div style={{ ...divBase, display: "flex", gap: 4, fontSize: 15, color: colors.muted }}><span>vs BTC</span><span style={{ color: textColor(asset.btcRelativePct), fontWeight: 800 }}>{formatPct(asset.btcRelativePct)}</span></div>
              <div style={{ ...divBase, display: "flex", gap: 4, fontSize: 15, color: colors.muted }}><span>vs basket</span><span style={{ color: textColor(asset.basketRelativePct), fontWeight: 800 }}>{formatPct(asset.basketRelativePct)}</span></div>
            </div>
          </div>
          <div style={{ ...divBase, width: 76, textAlign: "right", fontSize: 16, color: colors.cyan, fontWeight: 800 }}>{formatMultiple(asset.volumeVsAverage)}</div>
        </div>
      ))}
    </div>
  );
}

function sparklinePath(series: MarketBriefPoint[], width: number, height: number) {
  if (series.length < 2) return "";
  const values = series.map((point) => point.value).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  return series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MiniLines({ assets }: { assets: MarketBriefAsset[] }) {
  const width = 470;
  const height = 150;
  const palette = [colors.emerald, colors.cyan, colors.amber];
  return (
    <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 12 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <rect x="0" y="0" width={width} height={height} fill="#080b10" />
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} stroke="#1d2733" strokeWidth="1" />
        ))}
        {assets.slice(0, 3).map((asset, index) => (
          <path key={asset.symbol} d={sparklinePath(asset.series, width, height)} fill="none" stroke={palette[index]} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div style={{ ...divBase, display: "flex", gap: 18, flexWrap: "wrap" }}>
        {assets.slice(0, 3).map((asset, index) => (
          <div key={`legend-${asset.symbol}`} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ ...divBase, width: 11, height: 11, borderRadius: 999, background: palette[index] }} />
            <div style={{ ...divBase, fontSize: 15, color: colors.muted }}>{asset.symbol}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function summaryBullets(report: FactorReport) {
  return report.summary.slice(0, 4).map(stripSummaryLabel);
}

function ReportCard({ report }: { report: FactorReport }) {
  const top = report.leaderboard[0];
  const worst = report.losers[0];
  const strongestTheme = report.themes[0];
  const volumeConfirmed = report.leaderboard.filter((asset) => (asset.volumeVsAverage ?? 0) >= 1.2).length;
  const thesis = `${stripSummaryLabel(report.summary[0] ?? "Leadership was mixed.")} ${stripSummaryLabel(report.summary[2] ?? "The regime was asset-specific rather than simple beta.")}`;
  const sourceLine = `Source: Hyperliquid perp candles. Snapshot ${new Date(report.generatedAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET.`;

  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(circle at top left, rgba(45,224,173,0.18), transparent 27%), radial-gradient(circle at 88% 7%, rgba(84,217,242,0.11), transparent 24%), linear-gradient(180deg, #070a0f 0%, #090d13 100%)",
        color: colors.text,
        padding: "56px 58px 42px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div style={{ ...divBase, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `2px solid ${colors.border}`, paddingBottom: 24 }}>
        <div style={{ ...divBase, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ ...divBase, width: 42, height: 42, borderRadius: 999, border: `2px solid ${colors.emerald}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ ...divBase, width: 18, height: 18, borderRadius: 999, background: colors.emerald }} />
          </div>
          <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ ...divBase, fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em" }}>HyperPulse</div>
            <div style={{ ...divBase, fontSize: 14, color: colors.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>Research · Crypto Market Pulse</div>
          </div>
        </div>
        <div style={{ ...divBase, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ ...divBase, fontSize: 20, fontWeight: 800 }}>{report.periodLabel}</div>
          <div style={{ ...divBase, fontSize: 14, color: colors.muted }}>{`HL perps only · ${report.coverage.trackedAssetCount} tracked`}</div>
        </div>
      </div>

      <div style={{ ...divBase, marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...divBase, fontSize: 54, lineHeight: 1, fontWeight: 950, letterSpacing: "-0.055em" }}>Hyperliquid Market Pulse</div>
        <div style={{ ...divBase, borderLeft: `6px solid ${colors.emerald}`, background: "rgba(45,224,173,0.08)", padding: "20px 24px", fontSize: 26, lineHeight: 1.34, color: "#d7ffef" }}>
          {truncate(thesis, 205)}
        </div>
      </div>

      <div style={{ ...divBase, display: "flex", marginTop: 22 }}>
        {kpi("Tracked", `${report.coverage.trackedAssetCount}`, "liquid HL perps", "neutral")}
        {kpi("Leader", top ? top.symbol : "n/a", top ? formatPct(top.returnPct) : "no data", "good")}
        {kpi("Laggard", worst ? worst.symbol : "n/a", worst ? formatPct(worst.returnPct) : "none negative", worst ? "bad" : "neutral")}
        {kpi("Theme", strongestTheme ? truncate(strongestTheme.name, 14) : "n/a", strongestTheme ? formatPct(strongestTheme.averageReturnPct) : "no cluster", "accent")}
        {kpi("Volume", `${volumeConfirmed}`, "leaders > 1.2x avg", "good")}
      </div>

      <div style={{ ...divBase, display: "flex", gap: 20, marginTop: 26 }}>
        <div style={{ ...divBase, flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <ChartPanel title="Top winners" caption="Period return from Hyperliquid 1d candles.">
            <BarRows assets={report.leaderboard.slice(0, 5)} mode="winners" />
          </ChartPanel>
          <ChartPanel title="Theme leadership" caption="Average return of winning themes in the current tape.">
            <ThemeBars themes={report.themes} />
          </ChartPanel>
        </div>
        <div style={{ ...divBase, flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <ChartPanel title="Biggest losers" caption="Negative performers only; no fake laggards.">
            <BarRows assets={report.losers.slice(0, 5)} mode="losers" />
          </ChartPanel>
          <ChartPanel title="Relative read" caption="Outperformance versus BTC and the tracked perp basket. Right side shows volume vs prior baseline.">
            <RelativeRows assets={report.leaderboard.slice(0, 5)} />
          </ChartPanel>
        </div>
      </div>

      <div style={{ ...divBase, display: "flex", gap: 20, marginTop: 20 }}>
        <div style={{ ...divBase, flex: 1 }}>
          <ChartPanel title="Leader paths" caption="Cumulative return lines for the top three assets.">
            <MiniLines assets={report.leaderboard.slice(0, 3)} />
          </ChartPanel>
        </div>
        <div style={{ ...divBase, flex: 1 }}>
          <ChartPanel title="What mattered" caption="Desk read; informational only.">
            <div style={{ ...divBase, display: "flex", flexDirection: "column", gap: 12 }}>
              {summaryBullets(report).map((line, index) => (
                <div key={`bullet-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ ...divBase, marginTop: 8, width: 8, height: 8, borderRadius: 999, background: index === 0 ? colors.emerald : colors.cyan }} />
                  <div style={{ ...divBase, fontSize: 17, lineHeight: 1.38, color: "#d2d8df" }}>{truncate(line, 146)}</div>
                </div>
              ))}
            </div>
          </ChartPanel>
        </div>
      </div>

      <div style={{ ...divBase, marginTop: "auto", borderTop: `1px solid ${colors.border}`, paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ ...divBase, fontSize: 15, color: colors.muted }}>{sourceLine}</div>
        <div style={{ ...divBase, display: "flex", gap: 5, fontSize: 15, color: colors.muted }}><span style={{ color: colors.text, fontWeight: 800 }}>Informational only.</span><span>Not investment advice.</span></div>
      </div>
    </div>
  );
}

export async function GET() {
  const report = await buildHyperpulseFactorReport();
  return new ImageResponse(<ReportCard report={report} />, {
    ...size,
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
