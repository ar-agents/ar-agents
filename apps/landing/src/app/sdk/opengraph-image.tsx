import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "/sdk · @ar-agents/incorporate";
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
          /arg · sdk · npm
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.2px",
            lineHeight: 0.95,
            marginBottom: 24,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          @ar-agents/incorporate
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#4d4d4d",
            lineHeight: 1.4,
            letterSpacing: "-0.6px",
            maxWidth: 1000,
            marginBottom: 36,
          }}
        >
          Zero-dependency TypeScript client for /api/auto-incorporate. One async call → an Argentine sociedad-IA's full incorporation kit.
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            background: "#171717",
            color: "#fff",
            padding: "20px 24px",
            borderRadius: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 22,
          }}
        >
          $ pnpm add @ar-agents/incorporate
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
          <span>ar-agents.vercel.app/sdk</span>
          <span style={{ fontSize: 16, color: "#999" }}>~4 KB · MIT · SLSA v1</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
