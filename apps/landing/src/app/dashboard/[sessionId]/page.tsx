import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type AuditEntry,
  backend as auditBackend,
  isSessionIdValid,
  readAudit,
  verifySession,
} from "@/lib/audit";
import { GOVERNANCE_COLOR, GOVERNANCE_LABEL } from "@/app/play/scenarios";

// Server-rendered Node.js runtime (vs. Edge) because @vercel/kv + its
// transitive deps push the function over the 1MB Edge cap. Cold start is
// ~100-200ms heavier but still acceptable for a page that's hit once
// per session-share. Switch to Edge if you ever drop the KV adapter.
export const runtime = "nodejs";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px";
const SITE_URL = "https://ar-agents.vercel.app";

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

        {entries.length === 0 ? (
          <EmptyTimeline sessionId={sessionId} />
        ) : (
          <Timeline entries={entries} hmacWired={verification.hmacWired} />
        )}

        <ShareBar sessionId={sessionId} />
        <Footer />
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
        /arg · dashboard · forensic timeline
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
      "Los tool calls en /play o /api/auto-incorporate van a aparecer acá. La sesión expira automáticamente en 7 días.";
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
              : "—"
          }
        />
        <Metric
          label="tampered"
          value={
            verification.hmacWired ? String(verification.tampered) : "—"
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

function EmptyTimeline({ sessionId }: { sessionId: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        padding: 32,
        borderRadius: 8,
        boxShadow: SHADOW_CARD,
        textAlign: "center",
        color: "#4d4d4d",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: 0, color: "#171717", fontWeight: 500 }}>
        Esta sesión no tiene entradas aún.
      </p>
      <p style={{ margin: "8px 0 0" }}>
        Probá un escenario en{" "}
        <a href={`/play`} style={{ color: "#0072f5" }}>
          /play
        </a>{" "}
        o llamá{" "}
        <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
          POST /api/auto-incorporate
        </code>{" "}
        con{" "}
        <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
          {`"sessionId": "${sessionId}"`}
        </code>{" "}
        para que las entradas aparezcan acá.
      </p>
    </div>
  );
}

function Timeline({ entries, hmacWired }: { entries: AuditEntry[]; hmacWired: boolean }) {
  // Sort newest-first for skim; most operators read top-down looking for
  // recent changes.
  const sorted = entries
    .slice()
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sorted.map((e) => (
        <TimelineEntry key={e.id} entry={e} hmacWired={hmacWired} />
      ))}
    </div>
  );
}

function TimelineEntry({
  entry,
  hmacWired,
}: {
  entry: AuditEntry;
  hmacWired: boolean;
}) {
  const govColor =
    GOVERNANCE_COLOR[entry.governance] ?? { fg: "#666", bg: "#f5f5f5" };
  const govLabel = GOVERNANCE_LABEL[entry.governance] ?? entry.governance;
  const date = new Date(entry.ts);
  const ts = `${date.toISOString().slice(11, 19)}Z`;
  const ymd = date.toISOString().slice(0, 10);
  return (
    <article
      style={{
        background: "#ffffff",
        padding: 14,
        borderRadius: 8,
        boxShadow: SHADOW_CARD,
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: "#666",
          letterSpacing: "0.04em",
        }}
      >
        <div style={{ color: "#171717", fontWeight: 500 }}>{ts}</div>
        <div style={{ marginTop: 2 }}>{ymd}</div>
        {typeof entry.durationMs === "number" && (
          <div style={{ marginTop: 6 }}>{entry.durationMs}ms</div>
        )}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <code
            style={{
              fontFamily: FONT_MONO,
              fontSize: 14,
              color: "#171717",
              fontWeight: 600,
            }}
          >
            {entry.tool}
          </code>
          <Pill color={govColor.fg} bg={govColor.bg}>
            {govLabel}
          </Pill>
          {entry.errored && (
            <Pill color="#ff5b4f" bg="#fff1f0">
              ERRORED
            </Pill>
          )}
        </div>

        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: "#666",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            input / output
          </summary>
          <pre
            style={{
              background: "#fafafa",
              padding: 10,
              borderRadius: 4,
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: "#4d4d4d",
              margin: "6px 0 0",
              overflowX: "auto",
              boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
{JSON.stringify({ input: entry.input, output: entry.output }, null, 2)}
          </pre>
        </details>

        {hmacWired && entry.hmac && (
          <code
            style={{
              display: "inline-block",
              marginTop: 8,
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: "#7928ca",
              background: "#f5edfd",
              padding: "2px 8px",
              borderRadius: 4,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={entry.hmac}
          >
            {entry.hmac.slice(0, 26)}…
          </code>
        )}
      </div>
    </article>
  );
}

function Pill({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color,
        borderRadius: 9999,
        padding: "1px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
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

function Footer() {
  return (
    <footer
      style={{
        marginTop: 32,
        fontSize: 13,
        color: "#666",
        lineHeight: 1.6,
      }}
    >
      Esta página es la implementación de RFC-001 § 9.2 — el log es legalmente
      probatorio cuando el HMAC está cableado y el backend es persistente
      (Vercel KV en producción). Cualquier tercero puede{" "}
      <a href={`/api/play/audit/${"sessionId"}?verify=1`} style={{ color: "#0072f5" }}>
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
