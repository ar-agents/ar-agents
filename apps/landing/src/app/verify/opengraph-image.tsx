import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/verify · independent HMAC verification";
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
          verify · forensic check
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.84px",
            lineHeight: 0.95,
            marginBottom: 16,
          }}
        >
          Verificá un audit log
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
          Pegá el ID de una sesión, el servidor recomputa HMAC-SHA256 sobre el cuerpo canonical-JSON. RFC-001 § 9.2, log probatorio, mecánicamente.
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
          curl ar-agents.ar/api/play/audit/&#123;sessionId&#125;?verify=1
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
          <span>ar-agents.ar/verify</span>
          <span style={{ fontSize: 16, color: "#999" }}>RFC-001 § 9.2</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
