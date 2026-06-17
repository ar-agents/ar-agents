import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ar-agents, built with eve. An agent that incorporates automated companies in Argentina.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview for the eve launch share (X / Vercel crowd). Leads with the
// concrete artifact and puts the one-line hook, needsApproval: always(), at
// the center as a code chip.
export default function EveOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: "70px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: brand mark + eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 18,
            color: "#717171",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            fontWeight: 500,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#00bcff",
              color: "#000000",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-1.5px",
              fontFamily: "sans-serif",
              textTransform: "none",
            }}
          >
            ar
          </div>
          <span>ar-agents · built with eve</span>
        </div>

        {/* Middle: headline + the one-line hook as a code chip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 62,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-3.2px",
              color: "#ededed",
            }}
          >
            <span>An agent that incorporates</span>
            <span>automated companies</span>
            <span>in Argentina.</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                display: "flex",
                background: "rgba(0,188,255,0.14)",
                color: "#00bcff",
                fontFamily: "monospace",
                fontSize: 30,
                fontWeight: 600,
                padding: "12px 20px",
                borderRadius: 10,
                letterSpacing: "-0.5px",
              }}
            >
              needsApproval: always()
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "#a1a1a1",
                letterSpacing: "-0.5px",
              }}
            >
              art. 102, in one line.
            </div>
          </div>
        </div>

        {/* Bottom: proof strip + domain, cyan rule */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 18,
            color: "#717171",
            paddingTop: 22,
            borderTop: "2px solid #00bcff",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            <span>eve</span>
            <span>·</span>
            <span>MCP</span>
            <span>·</span>
            <span>human-in-the-loop</span>
            <span>·</span>
            <span>durable</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: 18,
              fontWeight: 600,
              color: "#ededed",
            }}
          >
            ar-agents.ar/eve
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
