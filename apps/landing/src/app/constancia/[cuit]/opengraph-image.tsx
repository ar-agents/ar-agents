import { ImageResponse } from "next/og";
import { parseCuit } from "@ar-agents/identity";
import { normalizeCuit } from "@ar-agents/constancia";

export const runtime = "nodejs";
export const alt = "Constancia verificada por ar-agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ cuit: string }>;
}) {
  const { cuit } = await params;
  const parsed = parseCuit(cuit);
  const bare = normalizeCuit(cuit) ?? parsed.normalized;
  const pretty = parsed.formatted ?? bare;
  const valid = parsed.valid;
  const accent = valid ? "#10b981" : "#ef4444";

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
            marginBottom: 16,
          }}
        >
          Constancia Oracle · ar-agents
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 96,
              height: 96,
              padding: "0 22px",
              borderRadius: 24,
              background: valid ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              color: accent,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            {valid ? "OK" : "NO"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 80,
                fontWeight: 600,
                color: "#171717",
                letterSpacing: "-3px",
                lineHeight: 0.98,
              }}
            >
              {valid ? "CUIT válido" : "CUIT no válido"}
            </div>
            <div
              style={{
                fontSize: 40,
                color: "#4d4d4d",
                fontFamily: "ui-monospace, monospace",
                marginTop: 8,
              }}
            >
              {pretty}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 26,
            color: "#4d4d4d",
            lineHeight: 1.4,
            maxWidth: 1000,
            marginTop: 36,
          }}
        >
          {`Dígito verificador ${
            valid ? "verificado" : "rechazado"
          } con el algoritmo mod-11. Resultado firmado (Ed25519), verificable. Badge para embeber.`}
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
          <span>{`ar-agents.ar/constancia/${bare}`}</span>
          <span style={{ fontSize: 16, color: "#999" }}>Verificado por ar-agents</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
