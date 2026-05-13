import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/legislación · síntesis técnica para legisladores";
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
          /legislación · síntesis para legisladores
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
          Cite-by-reference, no reinventar.
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
          Cuatro RFCs publicados (responsabilidad, descubrimiento,
          reciprocidad, log operativo) con texto sugerido para el
          articulado. La ley fija v1; los RFCs evolucionan en su propio
          gobierno público. Para quien esté redactando la ley de
          sociedades-IA.
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            fontFamily: "ui-monospace, monospace",
            fontSize: 16,
            color: "#171717",
          }}
        >
          <div style={{ background: "#fafafa", padding: "10px 14px", borderRadius: 6 }}>RFC-001</div>
          <div style={{ background: "#fafafa", padding: "10px 14px", borderRadius: 6 }}>RFC-002</div>
          <div style={{ background: "#fafafa", padding: "10px 14px", borderRadius: 6 }}>RFC-003</div>
          <div style={{ background: "#fafafa", padding: "10px 14px", borderRadius: 6 }}>RFC-004</div>
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
          <span>ar-agents.ar/legislacion</span>
          <span style={{ fontSize: 16, color: "#999" }}>MIT + CC-BY-4.0</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
