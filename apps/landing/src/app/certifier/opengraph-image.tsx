import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/certifier · verify any sociedad-IA's RFC conformance in seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: "64px 80px",
          color: "#171717",
          fontFamily: "Geist, Arial, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          /arg · /certifier · live · no install
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.52px",
            lineHeight: 0.95,
            marginBottom: 16,
          }}
        >
          Conformance score, en segundos.
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#4d4d4d",
            lineHeight: 1.4,
            letterSpacing: "-0.5px",
            maxWidth: 1040,
            marginBottom: 40,
          }}
        >
          Pegá cualquier URL. El certifier corre ~9 checks contra los
          endpoints públicos + scorea 0-100 contra RFC-002 + RFC-004.
          Sin install, sin setup. Cualquiera puede verificar lo que
          cualquier sociedad-IA dice de sí misma.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#22c55e",
              padding: "20px 32px",
              border: "3px solid #22c55e",
              borderRadius: 12,
              letterSpacing: "-1.5px",
            }}
          >
            A · 100/100
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 18, color: "#666", lineHeight: 1.4 }}>
            <span>(self-score of the</span>
            <span>reference implementation)</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            fontSize: 22,
            color: "#666",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span>ar-agents.vercel.app/certifier</span>
          <span style={{ fontSize: 16, color: "#999" }}>+ /api/certifier · + /api/cert-badge</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
