import type { Metadata } from "next";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";

/**
 * /dashboard, landing for the dashboard route family. /dashboard/[sessionId]
 * does the actual forensic view; this index explains the sessionId-scoped
 * model and points to the well-known demo session so a cold visitor can
 * see a real dashboard immediately.
 *
 * Created to fix broken `href="/dashboard"` links flagged by the code
 * audit (architecture/audit-log and getting-started both linked here
 * without a sessionId).
 */

const DEMO_SESSION_ID = "ar-agents-sociedad-automatizada";

export const metadata: Metadata = {
  title: "Dashboard · forensic per-session view · ar-agents",
  description:
    "El dashboard forense se navega por sessionId: cada sesión de un agente productivo tiene su propia vista de governance, latencias, verificación HMAC + Ed25519, y timeline. Esta página explica el modelo + linkea al demo público.",
  alternates: { canonical: "https://ar-agents.ar/dashboard" },
};

export default function DashboardIndexPage() {
  return (
    <DocShell
      eyebrow="dashboard · per-session forensics"
      title="Cada sesión tiene su propio dashboard."
      subtitle="Las vistas forenses de ar-agents están scoped por sessionId. Una sesión = una serie coherente de tool-calls compartiendo un mismo contexto de governance. Cada sociedad-IA emite múltiples sessions; cada session tiene su propio dashboard verificable."
    >
      <DocP>
        El dashboard forense vive en{" "}
        <DocCode>/dashboard/&#123;sessionId&#125;</DocCode>. No hay un
        listado global de todas las sessions porque no hay un único
        operador: cada sociedad-IA gestiona sus propias sessions y las
        expone vía su <DocCode>/.well-known/agents.json</DocCode>{" "}
        (definido en RFC-002 § 3.2).
      </DocP>

      <DocH2>Demo público</DocH2>
      <DocP>
        Para ver cómo se ve un dashboard sin tener que constituir una
        sociedad-IA primero, abrí el dashboard de la sesión pública de
        referencia:
      </DocP>
      <p style={{ margin: "12px 0 24px" }}>
        <a
          href={`/dashboard/${DEMO_SESSION_ID}`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            background: "var(--primary-bg)",
            color: "var(--primary-text)",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Abrir /dashboard/{DEMO_SESSION_ID} →
        </a>
      </p>

      <DocH2>Cómo obtener tu sessionId</DocH2>
      <DocP>
        Si sos operador de una sociedad-IA, cada llamada a tu agent loop
        emite entradas con un <DocCode>sessionId</DocCode>. Lo encontrás:
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          En el header <DocCode>X-Session-Id</DocCode> que devuelve tu
          endpoint de agent (recomendación RFC-001 § 9.2).
        </li>
        <li style={liSty}>
          En cada entrada del audit log, campo{" "}
          <DocCode>sessionId</DocCode> (especificación RFC-004 § 2).
        </li>
        <li style={liSty}>
          Si construiste tu sociedad con{" "}
          <a href="/incorporar" style={linkSty}>
            /incorporar
          </a>
         , el wizard te devuelve el sessionId inicial de auditoría
          junto al deploy URL.
        </li>
      </ul>

      <DocH2>Endpoints relacionados</DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <DocCode>GET /api/play/audit/&#123;sessionId&#125;</DocCode>,
          entradas crudas del log.
        </li>
        <li style={liSty}>
          <DocCode>GET /api/play/audit/&#123;sessionId&#125;?verify=1</DocCode>:{" "}
        re-verificación HMAC server-side.
        </li>
        <li style={liSty}>
          <DocCode>GET /api/play/audit/&#123;sessionId&#125;/csv</DocCode>:{" "}
        export CSV RFC-4180 con BOM (Excel-friendly).
        </li>
        <li style={liSty}>
          <DocCode>GET /api/play/audit-stream/&#123;sessionId&#125;</DocCode>:{" "}
        Server-Sent Events para dashboards en vivo.
        </li>
        <li style={liSty}>
          <DocCode>GET /api/audit-summary/&#123;sessionId&#125;</DocCode>:{" "}
        agregados (governance breakdown, latency quantiles).
        </li>
        <li style={liSty}>
          <a href="/verify" style={linkSty}>
            /verify
          </a>:{" "}
        UI para pegar un sessionId y obtener un reporte forense
          independiente.
        </li>
        <li style={liSty}>
          <a href="/audit-explorer/ar-agents-sociedad-automatizada" style={linkSty}>
            /audit-explorer/ar-agents-sociedad-automatizada
          </a>:{" "}
        vista alternativa: governance bar + tool usage + mini-timeline.
        </li>
      </ul>

      <DocH2>Para reguladores: cómo se cita un dashboard en un memo</DocH2>
      <DocP>
        Pegá el sessionId completo dentro del cuerpo del memo + el
        timestamp de la consulta. El servidor sirve el dashboard
        determinísticamente a partir del log; si el operador altera el
        log posterior a la consulta, se rompe la firma HMAC y se detecta
        en{" "}
        <a href="/verify" style={linkSty}>
          /verify
        </a>
        .
      </DocP>
    </DocShell>
  );
}

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const liSty: React.CSSProperties = {
  marginBottom: 8,
  lineHeight: 1.55,
};

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
