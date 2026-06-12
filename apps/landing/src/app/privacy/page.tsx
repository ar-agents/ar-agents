import type { Metadata } from "next";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What ar-agents.ar collects (signed audit-log entries for tool calls, session ids), what it does not (no tracking cookies, no ads, no sale of data), retention windows, and how to reach us.",
  alternates: { canonical: "https://ar-agents.ar/privacy" },
};

export default function PrivacyPage() {
  return (
    <DocShell
      eyebrow="privacy · 2026-06"
      title="Privacy policy"
      subtitle="Short version: this site exists to make agent activity auditable, not to track humans. We keep signed logs of tool calls because that is the product. We keep nothing else."
    >
      <DocH2>What we collect</DocH2>
      <DocP>
        The hosted endpoints on this site (the playground at /play, the remote
        MCP endpoint at /api/mcp, the x402-priced APIs, and the Auditor) write
        each tool call to an append-only audit log. An entry contains: a
        timestamp, the tool name, the inputs and outputs exactly as provided
        in the call, a session id, and a cryptographic signature
        (HMAC-SHA256, optionally Ed25519). That is the whole record. If you
        send personal data as a tool input (for example a CUIT you type into
        the playground), it lands in that log as provided.
      </DocP>
      <DocP>
        We do not use cookies for tracking, analytics trackers, or
        fingerprinting. Standard server logs (IP addresses, request metadata)
        are handled by our hosting provider, Vercel, under its own retention.
        Audit entries are stored in Vercel KV (Upstash).
      </DocP>

      <DocH2>Retention</DocH2>
      <DocP>
        Playground and public demo sessions expire automatically after 7
        days. Paid Auditor sessions are business records and are retained, by
        design: a public proof link that disappears would defeat the product.
        In-memory rate-limit counters live only for the duration of a
        serverless instance.
      </DocP>

      <DocH2>What we never do</DocH2>
      <DocP>
        We do not sell data. We do not share it with advertisers. There are
        no third-party ads on this site. Audit logs are used for exactly what
        the documentation says: forensic verification of agent activity, by
        you or by anyone you hand a session link to.
      </DocP>

      <DocH2>Your choices</DocH2>
      <DocP>
        Do not submit real personal data to the public demos; synthetic data
        works just as well. To ask about or request deletion of a specific
        audit session, write to{" "}
        <a href="mailto:naza@naza.ar">naza@naza.ar</a> with the session id.
        Note that durable (paid) sessions may be retained where they
        constitute business records.
      </DocP>

      <DocH2>Governing law</DocH2>
      <DocP>
        This site is operated from Argentina and governed by Argentine law,
        including Ley 25.326 de Protección de los Datos Personales.
      </DocP>
      <DocP>
        <em>
          Nota en español: este sitio guarda registros firmados de las
          llamadas a herramientas (timestamps, nombre de la herramienta,
          inputs y outputs, session id) porque ese registro auditable es el
          producto. No usamos cookies de tracking, no vendemos datos, no hay
          publicidad de terceros. Sesiones de demo expiran a los 7 días; las
          sesiones pagas del Auditor se conservan. Contacto:{" "}
          <a href="mailto:naza@naza.ar">naza@naza.ar</a>.
        </em>
      </DocP>

      <DocH2>Scope</DocH2>
      <DocP>
        This policy covers <DocCode>ar-agents.ar</DocCode> and its hosted API
        endpoints. The open-source <DocCode>@ar-agents/*</DocCode> npm
        packages run on your own infrastructure and send us nothing.
      </DocP>
    </DocShell>
  );
}
