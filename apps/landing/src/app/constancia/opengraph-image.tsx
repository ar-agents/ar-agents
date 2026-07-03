import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Constancia Oracle · verificá cualquier CUIT, firmada";
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
          Constancia Oracle · ar-agents
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.5px",
            lineHeight: 0.98,
            marginBottom: 20,
          }}
        >
          <span>Verificá cualquier CUIT.</span>
          <span>Firmada.</span>
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#4d4d4d",
            lineHeight: 1.4,
            letterSpacing: "-0.6px",
            maxWidth: 1000,
            marginBottom: 40,
          }}
        >
          Validación instantánea del dígito verificador, gratis, y un badge
          &quot;Verificado por ar-agents&quot; para embeber donde quieras.
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            background: "#fafafa",
            padding: "16px 20px",
            borderRadius: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            color: "#171717",
          }}
        >
          curl ar-agents.ar/api/constancia/lookup?cuit=20-12345678-6
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
          <span>ar-agents.ar/constancia</span>
          <span style={{ fontSize: 16, color: "#999" }}>Verificado por ar-agents</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
