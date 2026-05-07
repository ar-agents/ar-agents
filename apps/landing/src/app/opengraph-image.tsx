import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Mercado Pago Agent Toolkit — Built on Vercel";
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
          @ar-agents/mercadopago · v0.15.1
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
            <span>Mercado Pago Agent Toolkit.</span>
            <span>Built on Vercel.</span>
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
            87 typed tools across the agent-relevant Mercado Pago API surface,
            for the Vercel AI SDK 6.
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
            ar-agents.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
