import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * /registro — Public registry of known RFC-001-to-004 implementations.
 *
 * Honestly scoped: today (2026-05-11) there's one reference impl + a
 * handful of demo deployments. Tomorrow there may be productive
 * sociedades. The page makes the distinction explicit. The point is to
 * give a regulator/journalist a single URL that answers "who actually
 * runs this?"
 *
 * Each entry includes only PUBLIC metadata. No customer counts, no
 * revenue, no PII. Operators self-list by opening a PR.
 */

interface RegistryEntry {
  /** Display name. */
  name: string;
  /** Type of deployment. */
  type:
    | "reference-implementation"
    | "demo"
    | "productive-sociedad-ia"
    | "library-only";
  /** Jurisdiction. */
  jurisdiction: string;
  /** Operator name (publicly disclosed; "—" if anonymous). */
  operator: string;
  /** CUIT of the operator (publicly disclosed for productive sociedades). */
  operatorCuit?: string;
  /** Primary URL where the agents.json + audit endpoints live. */
  publicUrl: string;
  /** Which RFCs the entry claims conformance to. */
  rfcConformance: string[];
  /** Brief disclosure of what this entity does. */
  disclosure: string;
  /** Status: "live" if all endpoints respond + tests pass; "draft" if WIP. */
  status: "live" | "draft" | "deprecated";
  /** Listed since (ISO date). */
  listedSince: string;
}

const REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    name: "ar-agents (this site, reference implementation)",
    type: "reference-implementation",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    operatorCuit: "20-41758101-5",
    publicUrl: "https://ar-agents.vercel.app",
    rfcConformance: ["rfc-001-v1", "rfc-002-v1", "rfc-003-draft", "rfc-004-draft"],
    disclosure:
      "Reference implementation of the spec. Hosts /play (interactive demo), /verify (HMAC verification), /api/play/audit/* (audit endpoints), /test-vectors (conformance vectors). Not a productive sociedad — i.e. does not transact with real customers, does not emit facturas, does not cobrar. Source of truth for the spec.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "mp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    operatorCuit: "20-41758101-5",
    publicUrl: "https://ar-agents-mp-hello.vercel.app",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "Mercado Pago Subscriptions integration demo. Wired to a real MP sandbox + production app 178743372667921. Shows the @ar-agents/mercadopago lib end-to-end. Not a productive sociedad.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "cuit-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    operatorCuit: "20-41758101-5",
    publicUrl: "https://ar-agents-cuit-hello.vercel.app",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "AFIP/ARCA padron lookup + CUIT validation demo. Uses a real AFIP cert (homo for safety; prod cert available). Shows the @ar-agents/identity lib end-to-end. Not a productive sociedad.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "whatsapp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    operatorCuit: "20-41758101-5",
    publicUrl: "https://ar-agents-whatsapp-hello.vercel.app",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "WhatsApp Business Cloud API demo combining identity + MP + WhatsApp libs. Webhook handler + chat UI. Limited by Meta verification 5-recipient dev cap until business verification passes.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "bridge-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    operatorCuit: "20-41758101-5",
    publicUrl: "https://ar-agents-bridge-hello.vercel.app",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "Agentic Commerce Bridge demo. AP2 + ACP + MCP protocol surfaces wired to MP. Shows how a foreign agent (Wyoming DAO LLC) interacts with an AR sociedad-IA per cookbook recipe 21.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "(your sociedad-IA here)",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "—",
    publicUrl: "—",
    rfcConformance: [],
    disclosure:
      "Open a PR adding your sociedad-IA's metadata to apps/landing/src/app/registro/page.tsx in github.com/ar-agents/ar-agents. Provide: name, operator name + CUIT, public URL, RFCs you conform to, plain-English disclosure. The PR will be reviewed for honest claims (e.g. claimed RFC-001 conformance must include a /.well-known/agents.json that resolves).",
    status: "draft",
    listedSince: "—",
  },
];

const TYPE_COLOR: Record<RegistryEntry["type"], string> = {
  "reference-implementation": "#a855f7",
  demo: "#06b6d4",
  "productive-sociedad-ia": "#22c55e",
  "library-only": "#eab308",
};

const TYPE_LABEL: Record<RegistryEntry["type"], string> = {
  "reference-implementation": "Reference impl",
  demo: "Demo",
  "productive-sociedad-ia": "Productive sociedad",
  "library-only": "Library only",
};

const STATUS_COLOR: Record<RegistryEntry["status"], string> = {
  live: "#22c55e",
  draft: "#737373",
  deprecated: "#ef4444",
};

export const metadata: Metadata = {
  title: "/registro · public registry of known sociedad-IA implementations · ar-agents",
  description:
    "Cada sociedad-IA argentina (o demo) que implementa RFC-001..004 puede listarse aquí. Metadata pública únicamente. Auto-suscripción vía PR a github.com/ar-agents/ar-agents. Hoy: 1 reference impl + 4 demos.",
  alternates: { canonical: "https://ar-agents.vercel.app/registro" },
  openGraph: {
    title: "/registro · public registry of known sociedad-IA implementations",
    description:
      "Cada sociedad-IA argentina (o demo) que implementa RFC-001..004 puede listarse aquí. Metadata pública únicamente.",
    url: "https://ar-agents.vercel.app/registro",
    type: "article",
  },
};

export default function RegistroPage() {
  const counts = REGISTRY.reduce(
    (acc, e) => {
      if (e.status === "live") acc[e.type]++;
      return acc;
    },
    {
      "reference-implementation": 0,
      demo: 0,
      "productive-sociedad-ia": 0,
      "library-only": 0,
    } as Record<RegistryEntry["type"], number>,
  );

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Registry of known AR sociedad-IA implementations",
          url: "https://ar-agents.vercel.app/registro",
          numberOfItems: REGISTRY.filter((e) => e.status === "live").length,
          itemListElement: REGISTRY.filter((e) => e.status === "live").map(
            (e, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "SoftwareApplication",
                name: e.name,
                url: e.publicUrl,
                applicationCategory: TYPE_LABEL[e.type],
                description: e.disclosure,
              },
            }),
          ),
        }}
      />

      <main
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            /arg · /registro · public · self-listed · 2026-05-11
          </p>
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            Registro público de implementaciones.
          </h1>
          <p style={{ fontSize: 16 }}>
            Cada sociedad-IA o demo argentina que implementa RFC-001..004
            puede listarse aquí. <strong>Metadata pública únicamente</strong>:
            sin números de clientes, sin facturación, sin PII. Auto-suscripción
            vía PR a{" "}
            <a
              href="https://github.com/ar-agents/ar-agents"
              style={linkStyle}
            >
              github.com/ar-agents/ar-agents
            </a>
            .
          </p>
        </header>

        {/* Counters */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <Counter n={counts["reference-implementation"]} label="Reference impl" color={TYPE_COLOR["reference-implementation"]} />
          <Counter n={counts["demo"]} label="Demos live" color={TYPE_COLOR["demo"]} />
          <Counter n={counts["productive-sociedad-ia"]} label="Productive sociedades" color={TYPE_COLOR["productive-sociedad-ia"]} />
          <Counter n={REGISTRY.filter(e => e.status === "live").length} label="Total live" color="#737373" />
        </section>

        <p style={{ marginBottom: 24, color: "var(--text-muted)", fontSize: 14 }}>
          <strong>Disclosure honesto.</strong> Hoy (2026-05-11) hay 1 reference
          implementation + 4 demos. Cero (0) sociedades-IA productivas
          (i.e. que transaccionan con clientes reales, emiten facturas
          reales, cobran). Esto cambia el día que la verificación de Meta
          Business + el acceso a producción de MP terminan. El registro se
          actualiza solo: el dueño del proyecto abre un PR cuando aplica.
        </p>

        {/* Registry table */}
        <section>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {REGISTRY.map((entry) => (
              <Entry key={entry.name} entry={entry} />
            ))}
          </ul>
        </section>

        <section style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border-subtle)" }}>
          <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 500, color: "var(--text-strong)" }}>
            Cómo agregar tu sociedad-IA
          </h2>
          <ol style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={liStyle}>
              Asegurate de que tu sociedad-IA serve{" "}
              <code style={codeStyle}>/.well-known/agents.json</code> con
              metadata pública (RFC-002).
            </li>
            <li style={liStyle}>
              Asegurate de que tu endpoint de auditoría retorna entradas
              firmadas que pasan los vectores de conformidad RFC-004 (
              <Link href="/test-vectors" style={linkStyle}>
                /test-vectors
              </Link>
              ).
            </li>
            <li style={liStyle}>
              Abrí un PR a{" "}
              <a href="https://github.com/ar-agents/ar-agents" style={linkStyle}>
                github.com/ar-agents/ar-agents
              </a>{" "}
              modificando{" "}
              <code style={codeStyle}>apps/landing/src/app/registro/page.tsx</code>{" "}
              con tu entrada.
            </li>
            <li style={liStyle}>
              El PR se aprueba si los endpoints declarados responden + el
              disclosure es honesto. Sin más requisitos.
            </li>
          </ol>
        </section>

        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.vercel.app ·{" "}
          <Link href="/rfcs/002" style={linkStyle}>RFC-002</Link>{" · "}
          <Link href="/test-vectors" style={linkStyle}>/test-vectors</Link>{" · "}
          <Link href="/auditor" style={linkStyle}>/auditor</Link>{" · "}
          <Link href="/" style={linkStyle}>/</Link>
        </footer>
      </main>
    </>
  );
}

function Counter({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 300,
          color: "var(--text-strong)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          lineHeight: 1.1,
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: RegistryEntry }) {
  return (
    <li
      style={{
        padding: 16,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        marginBottom: 12,
        borderLeft: `3px solid ${TYPE_COLOR[entry.type]}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>
            {entry.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {entry.jurisdiction} · {entry.operator}
            {entry.operatorCuit ? ` · CUIT ${entry.operatorCuit}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <Badge text={TYPE_LABEL[entry.type]} color={TYPE_COLOR[entry.type]} />
          <Badge text={entry.status} color={STATUS_COLOR[entry.status]} />
        </div>
      </div>

      <p style={{ fontSize: 13.5, marginBottom: 8, color: "var(--text-body)" }}>
        {entry.disclosure}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
        {entry.publicUrl !== "—" && (
          <a href={entry.publicUrl} style={linkStyle}>
            {entry.publicUrl}
          </a>
        )}
        {entry.rfcConformance.length > 0 && (
          <span>
            · RFCs: <code style={codeStyle}>{entry.rfcConformance.join(", ")}</code>
          </span>
        )}
        {entry.listedSince !== "—" && <span>· listed since {entry.listedSince}</span>}
      </div>
    </li>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 8px",
        background: `${color}22`,
        color,
        borderRadius: 4,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 12,
  padding: "1px 4px",
  background: "var(--bg)",
  borderRadius: 3,
};

const liStyle: React.CSSProperties = {
  marginBottom: 6,
  lineHeight: 1.55,
};
