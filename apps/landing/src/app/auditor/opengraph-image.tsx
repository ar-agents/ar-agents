import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/auditor · 1-page Spanish-first regulator brief";
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
          /auditor · español · 1-page
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.36px",
            lineHeight: 0.95,
            marginBottom: 16,
          }}
        >
          Auditar una sociedad-IA, en una hoja.
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
          Para periodistas, legisladores, inspectores AAIP/AFIP/BCRA.
          Cómo verificar, sin pedir permiso al operador, qué hizo una
          sociedad-IA durante un período de tiempo determinado.
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            background: "#fafafa",
            padding: "14px 18px",
            borderRadius: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 16,
            color: "#171717",
          }}
        >
          Tiempo de lectura: 7 min · Sin glosa · Cada afirmación enlaza a su prueba
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
          <span>ar-agents.ar/auditor</span>
          <span style={{ fontSize: 16, color: "#999" }}>RFC-001 · 002 · 003 · 004 · 005 · 006</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
