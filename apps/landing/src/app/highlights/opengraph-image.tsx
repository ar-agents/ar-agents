import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "ar-agents · open-source infrastructure for Argentine sociedades-IA";
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
          padding: "56px 80px",
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
          /highlights · 90-second read
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 500,
            color: "#171717",
            letterSpacing: "-2.4px",
            lineHeight: 1.0,
            marginBottom: 20,
          }}
        >
          Open-source infrastructure
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 400,
            color: "#4d4d4d",
            letterSpacing: "-1.5px",
            lineHeight: 1.0,
            marginBottom: 32,
          }}
        >
          for Argentine sociedades-IA.
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <Stat n="5" l="RFCs" />
          <Stat n="30" l="recipes" />
          <Stat n="17" l="packages" />
          <Stat n="103" l="tests" />
          <Stat n="5/5" l="sociedades A" />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#22c55e",
              padding: "14px 24px",
              border: "3px solid #22c55e",
              borderRadius: 10,
              letterSpacing: "-1px",
            }}
          >
            A · 100/100
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 18,
              color: "#666",
              lineHeight: 1.35,
            }}
          >
            <span>Reference impl self-cert</span>
            <span>against RFC-002 + RFC-004 + RFC-005</span>
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
          <span>ar-agents.ar/highlights</span>
          <span style={{ fontSize: 15, color: "#999" }}>
            MIT + CC-BY-4.0 · 2026-05-11
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#fafafa",
        borderRadius: 8,
        padding: "12px 16px",
        minWidth: 110,
      }}
    >
      <span
        style={{
          fontSize: 32,
          fontWeight: 500,
          color: "#171717",
          letterSpacing: "-0.6px",
          fontFamily: "ui-monospace, monospace",
          lineHeight: 1.0,
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "#666",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginTop: 6,
        }}
      >
        {l}
      </span>
    </div>
  );
}
