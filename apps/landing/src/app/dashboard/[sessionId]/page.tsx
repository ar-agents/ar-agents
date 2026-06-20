import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type AuditEntry,
  backend as auditBackend,
  isSessionIdValid,
  readAudit,
  verifySession,
} from "@/lib/audit";
import { readAnchors, readHead } from "@/lib/ledger";
import { ApprovalsCard } from "./approvals-card";
import { LiveTimeline } from "./live-timeline";
import { TamperDemo } from "./tamper-demo";

// Server-rendered Node.js runtime (vs. Edge) because @vercel/kv + its
// transitive deps push the function over the 1MB Edge cap. Cold start is
// ~100-200ms heavier but still acceptable for a page that's hit once
// per session-share. Switch to Edge if you ever drop the KV adapter.
export const runtime = "nodejs";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px";
const SITE_URL = "https://ar-agents.ar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  return {
    title: `Audit timeline · ${sessionId.slice(0, 8)}…`,
    description:
      "Forensic timeline for an /play sociedad-IA session. HMAC-SHA256-signed audit entries, verifiable end-to-end.",
    robots: { index: false, follow: false },
    alternates: { canonical: `${SITE_URL}/dashboard/${sessionId}` },
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!isSessionIdValid(sessionId)) notFound();

  const entries = await readAudit(sessionId);
  const verification = await verifySession(sessionId);
  const backend = auditBackend();
  const [anchors, head] = await Promise.all([
    readAnchors().catch(() => []),
    readHead().catch(() => null),
  ]);
  const lastAnchor = anchors.length ? anchors[anchors.length - 1] : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#171717",
        padding: "32px 24px 80px",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <div style={{ maxWidth: 1024, margin: "0 auto" }}>
        <Header sessionId={sessionId} />

        <VerificationCard
          backend={backend}
          verification={verification}
          entryCount={entries.length}
        />

        <ProofBundle
          sessionId={sessionId}
          anchorCount={anchors.length}
          headSeq={head?.seq ?? null}
          lastAnchorTs={lastAnchor?.ts ?? null}
        />

        <h2
          style={{
            fontSize: 13,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "36px 0 12px",
            fontWeight: 600,
          }}
        >
          Timeline
        </h2>

        <LiveTimeline
          sessionId={sessionId}
          initialEntries={entries}
          hmacWired={verification.hmacWired}
        />

        <ApprovalsCard sessionId={sessionId} />

        <TamperDemo />

        <ShareBar sessionId={sessionId} />
        <Footer sessionId={sessionId} />
      </div>

      {/* JSON-LD for crawlers + AI assistants summarizing the URL */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `Audit timeline ${sessionId}`,
            description:
              "Forensic timeline of tool calls in a sociedad-IA session, RFC-001 § 9.2 conformant.",
            url: `${SITE_URL}/dashboard/${sessionId}`,
            license: "https://opensource.org/licenses/MIT",
            isAccessibleForFree: true,
            distribution: [
              {
                "@type": "DataDownload",
                contentUrl: `${SITE_URL}/api/play/audit/${sessionId}?verify=1`,
                encodingFormat: "application/json",
              },
            ],
            variableMeasured: [
              "tool_name",
              "governance_class",
              "input",
              "output",
              "duration_ms",
              "hmac_sha256",
            ],
          }),
        }}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({ sessionId }: { sessionId: string }) {
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 24,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
        }}
      >
        dashboard · forensic timeline
      </p>
      <h1
        style={{
          fontSize: 36,
          fontWeight: 600,
          color: "#171717",
          letterSpacing: "-1.8px",
          lineHeight: 1.05,
          margin: 0,
        }}
      >
        Audit timeline
      </h1>
      <code
        style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          color: "#4d4d4d",
          marginTop: 4,
          wordBreak: "break-all",
        }}
      >
        sessionId: {sessionId}
      </code>
    </header>
  );
}

function VerificationCard({
  backend,
  verification,
  entryCount,
}: {
  backend: "vercel-kv" | "in-memory";
  verification: {
    total: number;
    verified: number;
    tampered: number;
    hmacWired: boolean;
  };
  entryCount: number;
}) {
  // The headline status that frames the page for the regulator.
  let title: string;
  let detail: string;
  let titleColor: string;
  let bg: string;
  if (!verification.hmacWired) {
    title = "AUDIT_HMAC_SECRET no configurado";
    detail =
      "Las entradas no están firmadas. En producción, set AUDIT_HMAC_SECRET (32+ chars) en Vercel → Settings → Environment Variables. Ver docs/launch/audit-log-setup.md.";
    titleColor = "#666";
    bg = "#f5f5f5";
  } else if (verification.tampered > 0) {
    title = `${verification.tampered} entradas con tampering detectado`;
    detail =
      "Una o más entradas fueron modificadas después de la firma. Las ediciones server-side dejan huella mecánica gracias al HMAC-SHA256.";
    titleColor = "#ff5b4f";
    bg = "#fff1f0";
  } else if (verification.total === 0) {
    title = "Sin entradas todavía";
    detail =
      "Los tool calls en /play o /api/auto-incorporate van a aparecer acá. Las sesiones del playground expiran a los 7 días; las de El Auditor (pagas) se retienen sin vencimiento.";
    titleColor = "#666";
    bg = "#fafafa";
  } else {
    title = `${verification.verified} de ${verification.total} entradas verificadas`;
    detail =
      "Cada entrada lleva HMAC-SHA256 sobre canonical-JSON de los campos públicos. Verificable end-to-end vía /api/play/audit/{sessionId}?verify=1.";
    titleColor = "#0a72ef";
    bg = "#ebf5ff";
  }

  return (
    <article
      style={{
        background: bg,
        padding: 20,
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.96px",
          color: titleColor,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <p style={{ margin: "8px 0 14px", fontSize: 14, color: "#4d4d4d", lineHeight: 1.5 }}>
        {detail}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <Metric label="entradas" value={String(entryCount)} />
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
          tone={verification.tampered > 0 ? "danger" : undefined}
        />
        <Metric
          label="backend"
          value={backend}
          tone={backend === "vercel-kv" ? "ok" : "muted"}
        />
        <Metric
          label="hmac"
          value={verification.hmacWired ? "wired" : "missing"}
          tone={verification.hmacWired ? "ok" : "muted"}
        />
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger" | "muted" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "#0a72ef"
      : tone === "danger"
        ? "#ff5b4f"
        : tone === "muted"
          ? "#666"
          : "#171717";
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "10px 14px",
        borderRadius: 6,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color,
          fontFamily: FONT_MONO,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProofBundle({
  sessionId,
  anchorCount,
  headSeq,
  lastAnchorTs,
}: {
  sessionId: string;
  anchorCount: number;
  headSeq: number | null;
  lastAnchorTs: string | null;
}) {
  const bundle = `${SITE_URL}/api/audit/${sessionId}/bundle`;
  const attestation = `${SITE_URL}/api/audit/${sessionId}/attestation`;
  const cmd = `curl -s ${bundle} > bundle.json
curl -s ${SITE_URL}/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs bundle bundle.json`;
  return (
    <section
      style={{
        marginTop: 24,
        padding: 20,
        background: "#fafafa",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        Verificá vos mismo (RFC-006)
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "#4d4d4d", lineHeight: 1.5 }}>
        Cada decisión queda en una cadena de hash sellada en anchors firmados.
        Bajá el bundle y verificalo offline con el verificador independiente. La
        firma Ed25519 se chequea con la clave pública, sin confiar en este
        servidor. Y una vez que guardás un anchor de{" "}
        <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>/api/audit/anchor</code>,
        no podemos reescribir nada por debajo de ese punto sin que tu copia lo
        delate.
      </p>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: anchorCount > 0 ? "#067a3e" : "#9a6700",
          background: anchorCount > 0 ? "rgba(6,122,62,0.08)" : "rgba(154,103,0,0.08)",
          borderRadius: 6,
          padding: "8px 12px",
        }}
      >
        {anchorCount > 0
          ? `anclado · cadena sellada hasta seq ${headSeq ?? "?"} · ${anchorCount} anchor${anchorCount === 1 ? "" : "s"}${lastAnchorTs ? ` · último ${lastAnchorTs}` : ""}`
          : "sin anclar todavía · POST /api/audit/anchor sella el head actual"}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 14,
          background: "#0a0a0a",
          color: "#ededed",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          fontFamily: FONT_MONO,
          overflowX: "auto",
        }}
      >
        {cmd}
      </pre>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <a href={bundle} style={{ color: "#0072f5", fontFamily: FONT_MONO }}>
          export bundle (§8)
        </a>
        <a href={attestation} style={{ color: "#0072f5", fontFamily: FONT_MONO }}>
          attestation (Ed25519)
        </a>
        <a href={`${SITE_URL}/api/audit/anchor`} style={{ color: "#0072f5", fontFamily: FONT_MONO }}>
          anchor chain
        </a>
        <a href={`${SITE_URL}/api/audit/verify`} style={{ color: "#0072f5", fontFamily: FONT_MONO }}>
          chain verify
        </a>
      </div>
    </section>
  );
}

function ShareBar({ sessionId }: { sessionId: string }) {
  const url = `${SITE_URL}/dashboard/${sessionId}`;
  const json = `${SITE_URL}/api/play/audit/${sessionId}?verify=1`;
  return (
    <section
      style={{
        marginTop: 32,
        padding: 16,
        background: "#fafafa",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        Compartir
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a
          href={url}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            color: "#171717",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {url}
        </a>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#666", fontFamily: FONT_MONO }}>
          JSON crudo:
        </span>
        <a
          href={json}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: "#0072f5",
            wordBreak: "break-all",
          }}
        >
          {json}
        </a>
      </div>
    </section>
  );
}

function Footer({ sessionId }: { sessionId: string }) {
  return (
    <footer
      style={{
        marginTop: 32,
        fontSize: 13,
        color: "#666",
        lineHeight: 1.6,
      }}
    >
      Esta página es la implementación de RFC-001 § 9.2, el log es legalmente
      probatorio cuando el HMAC está cableado y el backend es persistente
      (Vercel KV en producción). Cualquier tercero puede{" "}
      <a href={`/api/play/audit/${sessionId}?verify=1`} style={{ color: "#0072f5" }}>
        re-verificarlo
      </a>{" "}
      sin acceso a la clave. Más:{" "}
      <a href="/rfcs/001" style={{ color: "#0072f5" }}>
        /rfcs/001
      </a>{" "}
      ·{" "}
      <a href="/security" style={{ color: "#0072f5" }}>
        /security
      </a>
      .
    </footer>
  );
}
