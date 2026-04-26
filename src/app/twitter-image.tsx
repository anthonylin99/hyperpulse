import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "HyperPulse — Hyperliquid intelligence workspace";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at top left, rgba(45,212,191,0.18), transparent 30%), linear-gradient(135deg, #081015 0%, #05080d 45%, #0a1117 100%)",
          color: "#f4f4f5",
          padding: "56px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "999px",
                background: "#5eead4",
                boxShadow: "0 0 24px rgba(45,212,191,0.6)",
              }}
            />
            <div style={{ fontSize: 28, letterSpacing: "-0.04em", fontWeight: 700 }}>HyperPulse</div>
          </div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "999px",
              padding: "10px 16px",
              fontSize: 18,
              color: "#a1a1aa",
            }}
          >
            Read-only demo
          </div>
        </div>

        <div style={{ display: "flex", gap: "36px", alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", flex: 1 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                fontSize: 72,
                lineHeight: 1,
                letterSpacing: "-0.06em",
                fontWeight: 700,
              }}
            >
              <span>Hyperliquid-native</span>
              <span>market intelligence.</span>
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.4, color: "#a1a1aa", maxWidth: 620 }}>
              Live markets, cleaner portfolio review, and trader-facing context in one workspace.
            </div>
            <div style={{ display: "flex", gap: "14px" }}>
              {["Markets", "Portfolio", "Docs"].map((chip) => (
                <div
                  key={chip}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "999px",
                    padding: "10px 16px",
                    fontSize: 18,
                    color: "#d4d4d8",
                    background: "rgba(10,12,16,0.75)",
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              width: 380,
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(8,12,16,0.84)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 18, letterSpacing: "0.18em", textTransform: "uppercase", color: "#71717a" }}>
              Public demo scope
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Mode", "Read-only by default"],
                ["Focus", "Markets + Portfolio"],
                ["Shell", "Persistent nav + trust cues"],
                ["Data", "Hyperliquid-native"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 18,
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    background: "rgba(10,13,18,0.82)",
                  }}
                >
                  <div style={{ fontSize: 15, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</div>
                  <div style={{ fontSize: 24, color: "#fafafa", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
