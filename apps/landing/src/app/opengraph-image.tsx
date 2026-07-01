import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "ar-agents · infraestructura abierta para sociedades automatizadas en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark, on-brand link preview (X / WhatsApp / LinkedIn). Black canvas + cyan
// accent matches the site identity and stands out in feeds. Leads with the
// sociedad automatizada standard, names the open-core + El Auditor model.
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
          background: "#000000",
          padding: "72px 80px",
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
          <span>ar-agents · open infrastructure · MIT + CC-BY-4.0</span>
        </div>

        {/* Middle: headline + sub */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 90,
              fontWeight: 600,
              lineHeight: 1.0,
              letterSpacing: "-5.4px",
              color: "#ededed",
            }}
          >
            <span>Infraestructura abierta</span>
            <span>para sociedades automatizadas.</span>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 27,
              color: "#a1a1a1",
              lineHeight: 1.4,
              maxWidth: 1010,
              letterSpacing: "-0.5px",
            }}
          >
            Una Sociedad Automatizada opera con agentes de IA, no con empleados.
            El código es abierto. El Auditor, la prueba firmada de que opera
            bien, es el producto pago.
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
            <span>37 packages</span>
            <span>·</span>
            <span>243 tools</span>
            <span>·</span>
            <span>6 RFCs</span>
            <span>·</span>
            <span>HMAC + Ed25519</span>
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
            ar-agents.ar
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
