import { ImageResponse } from "next/og";
import { backend as auditBackend, readAudit, verifySession } from "@/lib/audit";

// Dynamic OG image for /dashboard/[sessionId]. When the URL is shared in
// Slack, WhatsApp, Twitter, etc., the preview shows the audit log's
// verification state right in the message, green when clean, red when
// tampered. Visually communicates the forensic proof before the recipient
// even clicks.

export const runtime = "nodejs";
export const alt = "Audit timeline · ar-agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  // Fetch + verify in parallel via the lib (same primitives the page uses).
  const [entries, verification] = await Promise.all([
    readAudit(sessionId).catch(() => []),
    verifySession(sessionId).catch(() => ({
      total: 0,
      verified: 0,
      tampered: 0,
      hmacWired: false,
    })),
  ]);
  const backend = auditBackend();

  // Pick the headline color + label.
  const { headline, sub, headlineColor } = headlineFor(verification);

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
        {/* Eyebrow */}
        <div
          style={{
            fontSize: 18,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "1px",
            fontWeight: 500,
            marginBottom: 8,
          }}
        >
          dashboard · forensic timeline
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            color: headlineColor,
            letterSpacing: "-2.88px",
            lineHeight: 1.0,
            marginBottom: 16,
          }}
        >
          {headline}
        </div>

        {/* Sub */}
        <div
          style={{
            fontSize: 28,
            color: "#4d4d4d",
            lineHeight: 1.3,
            letterSpacing: "-0.5px",
            maxWidth: 1000,
          }}
        >
          {sub}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Metric strip */}
        <div style={{ display: "flex", gap: 16 }}>
          <Metric label="entradas" value={String(entries.length)} />
          <Metric
            label="verificadas"
            value={
              verification.hmacWired
                ? `${verification.verified}/${verification.total}`
                : "-"
            }
          />
          <Metric
            label="tampered"
            value={
              verification.hmacWired ? String(verification.tampered) : "-"
            }
            highlight={verification.tampered > 0 ? "danger" : "neutral"}
          />
          <Metric
            label="backend"
            value={backend}
            highlight={backend === "vercel-kv" ? "ok" : "warn"}
          />
        </div>

        {/* URL footer */}
        <div
          style={{
            fontSize: 22,
            color: "#666",
            marginTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span>ar-agents.ar/dashboard/{sessionId.slice(0, 8)}…</span>
          <span style={{ fontSize: 14, color: "#999" }}>RFC-001 § 9.2</span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

function headlineFor(v: {
  total: number;
  verified: number;
  tampered: number;
  hmacWired: boolean;
}): { headline: string; sub: string; headlineColor: string } {
  if (!v.hmacWired) {
    return {
      headline: "Sin firma",
      sub: "AUDIT_HMAC_SECRET no configurado en este deploy. La verificación queda sin contenido.",
      headlineColor: "#666",
    };
  }
  if (v.tampered > 0) {
    return {
      headline: `${v.tampered} entrada${v.tampered === 1 ? "" : "s"} tamper­ed`,
      sub: "Una o más entradas fueron modificadas después de la firma. Mecánicamente detectable vía HMAC-SHA256.",
      headlineColor: "#ff5b4f",
    };
  }
  if (v.total === 0) {
    return {
      headline: "Sin entradas",
      sub: "Esta sesión no tiene tool calls registrados. Probá un escenario en /play o llamá /api/auto-incorporate.",
      headlineColor: "#666",
    };
  }
  return {
    headline: `${v.verified}/${v.total} verificadas`,
    sub: "Cada entrada firmada con HMAC-SHA256 al momento de la escritura. Log limpio, log probatorio.",
    headlineColor: "#0a72ef",
  };
}

function Metric({
  label,
  value,
  highlight = "neutral",
}: {
  label: string;
  value: string;
  highlight?: "ok" | "danger" | "warn" | "neutral";
}) {
  const color =
    highlight === "ok"
      ? "#0a72ef"
      : highlight === "danger"
        ? "#ff5b4f"
        : highlight === "warn"
          ? "#eab308"
          : "#171717";
  return (
    <div
      style={{
        flex: 1,
        background: "#fafafa",
        padding: "16px 20px",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
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
        {label}
      </span>
      <span
        style={{
          fontSize: 32,
          fontWeight: 600,
          color,
          letterSpacing: "-1.28px",
        }}
      >
        {value}
      </span>
    </div>
  );
}
