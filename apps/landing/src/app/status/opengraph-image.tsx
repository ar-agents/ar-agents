import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/status · ar-agents operational state";
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
          /arg · status · live
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.52px",
            lineHeight: 0.95,
            marginBottom: 32,
          }}
        >
          Operational state
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#4d4d4d",
            lineHeight: 1.4,
            letterSpacing: "-0.5px",
            maxWidth: 1000,
            marginBottom: 40,
          }}
        >
          What is wired right now: Vercel KV (audit log), HMAC signing, AI Gateway, ARCA cert, Mercado Pago, WhatsApp, BCRA. Refresh 30s. Public.
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "kv", value: "wired", color: "#0a72ef" },
            { label: "hmac", value: "wired", color: "#0a72ef" },
            { label: "gateway", value: "wired", color: "#0a72ef" },
            { label: "endpoints", value: "4", color: "#171717" },
          ].map((t) => (
            <div
              key={t.label}
              style={{
                flex: 1,
                background: "#fafafa",
                padding: "20px 24px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: "#666",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {t.label}
              </span>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  color: t.color,
                  letterSpacing: "-1.28px",
                }}
              >
                {t.value}
              </span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 22, color: "#666" }}>
          ar-agents.vercel.app/status
        </div>
      </div>
    ),
    { ...size },
  );
}
