import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/play · sociedad-IA argentina en vivo";
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
          play · sociedad-IA en vivo
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
          Una sociedad-IA argentina,
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 600,
            color: "#0a72ef",
            letterSpacing: "-3.52px",
            lineHeight: 0.95,
            marginBottom: 32,
          }}
        >
          operando en tiempo real.
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#4d4d4d",
            lineHeight: 1.4,
            letterSpacing: "-0.5px",
            maxWidth: 1000,
          }}
        >
          12 tools mockeados pero realistas (CUIT validate, padrón ARCA, BCRA Central de Deudores, factura electrónica, MP, WhatsApp, Boletín Oficial). Cada tool call queda HMAC-firmado en un audit log persistido a Vercel KV.
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
          <span>ar-agents.ar/play</span>
          <span style={{ fontSize: 16, color: "#999" }}>30 segundos · zero setup</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
