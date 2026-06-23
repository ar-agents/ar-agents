import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ar-agents · infraestructura abierta para sociedades de IA en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "80px 88px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#666666",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            fontWeight: 500,
          }}
        >
          ar-agents · Argentina
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 96,
              fontWeight: 600,
              lineHeight: 1.0,
              letterSpacing: "-5.76px",
              color: "#171717",
            }}
          >
            <span>Infraestructura abierta</span>
            <span>para sociedades de IA.</span>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#4d4d4d",
              lineHeight: 1.4,
              maxWidth: 1024,
              letterSpacing: "-0.5px",
            }}
          >
            RFCs, SDKs, registro público y logs auditables para agentes que
            operan sobre rieles argentinos.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 18,
            color: "#666666",
            paddingTop: 24,
            boxShadow: "inset 0 1px 0 rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 18,
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            <span>Edge Runtime</span>
            <span>·</span>
            <span>Vercel KV</span>
            <span>·</span>
            <span>OpenTelemetry</span>
            <span>·</span>
            <span>HITL</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            ar-agents.ar
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
