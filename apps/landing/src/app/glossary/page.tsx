import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * /glossary, Define every term used across ar-agents in one searchable page.
 *
 * Audience: journalists writing first piece about sociedades-IA,
 * legislators reading the RFCs cold, developers integrating the libs.
 * Each entry has: term, type (concept/protocol/spec/tool), short
 * definition, longer explanation, and links to the canonical reference
 * on the site.
 *
 * Sorted alphabetically for skim-ability. Renders as a DefinedTerm-typed
 * JSON-LD list for AI crawlers.
 */

interface Entry {
  term: string;
  type: "concept" | "protocol" | "spec" | "tool" | "endpoint" | "regime";
  short: string;
  long: string;
  refs: { label: string; href: string }[];
  related?: string[];
}

const ENTRIES: ReadonlyArray<Entry> = [
  {
    term: "Agent",
    type: "concept",
    short: "An autonomous software entity that takes actions on behalf of a human or a sociedad-IA.",
    long: "In ar-agents, an agent is the runtime that calls tools (MercadoPago, AFIP, WhatsApp, etc.) on behalf of an operator. Built on top of Vercel AI SDK 6 Experimental_Agent. Each tool-call lands in an audit log entry, signed with HMAC-SHA256 + classified by governance class.",
    refs: [
      { label: "Reference impl", href: "/architecture" },
      { label: "Demo", href: "/play" },
    ],
  },
  {
    term: "agents.json",
    type: "spec",
    short: "Discovery manifest at /.well-known/agents.json.",
    long: "Per RFC-002 + the agents.md v1 convention, every sociedad-IA publishes capabilities + audit endpoints + jurisdiction at this URL. Two compatible shapes accepted: strict map (RFC-002 v1) and array (agents.md v1).",
    refs: [
      { label: "JSON schema", href: "/schemas/agents.v1.json" },
      { label: "RFC-002", href: "/rfcs/002" },
      { label: "Live example", href: "/.well-known/agents.json" },
    ],
    related: ["RFC-002", "Discovery"],
  },
  {
    term: "AP2",
    type: "protocol",
    short: "Agent Payments Protocol. Mandate-based, signed.",
    long: "Originated in the Google AP2 spec. In ar-agents, an AP2 mandate is a signed promise to pay (e.g. a Wyoming DAO LLC mandates $X to AR-CUIT-Y, payable for T+24h). The AR sociedad verifies the signature, emits the factura, lands the cobro. Recipe 21 walks through the full cross-jurisdictional flow.",
    refs: [
      { label: "Cookbook recipe 21", href: "/examples" },
      { label: "Package @ar-agents/ap2", href: "https://www.npmjs.com/package/@ar-agents/ap2" },
    ],
  },
  {
    term: "Append-only",
    type: "concept",
    short: "Property of a log where existing entries cannot be modified or deleted, only new entries appended.",
    long: "RFC-004 § 4 pins this down concretely: the library exposes exactly one mutation primitive (appendAudit), no update/delete; the backing store uses RPUSH/LRANGE; entry IDs are timestamp-prefixed so textual sort = temporal order; HMAC over the whole entry catches any post-hoc mutation. The only permitted destructive action is TTL-based retention purge.",
    refs: [
      { label: "RFC-004 § 4", href: "/rfcs/004" },
      { label: "Reference impl", href: "/architecture/audit-log" },
    ],
  },
  {
    term: "Audit log",
    type: "concept",
    short: "Append-only HMAC-SHA256-signed record of every action a sociedad-IA takes.",
    long: "The legal-and-technical primitive that makes a sociedad-IA's operating history reconstructible after the fact. Every tool-call → one entry. Each entry has id, sessionId, ts, tool, governance, input, output, hmac. Stored in Vercel KV (Upstash, sa-east-1) with 7-day TTL in dev; production sociedades configure 180d-to-5y retention per RFC-004 § 7.",
    refs: [
      { label: "Deep-dive", href: "/architecture/audit-log" },
      { label: "RFC-004", href: "/rfcs/004" },
      { label: "Verify any session", href: "/verify" },
    ],
    related: ["HMAC", "RFC-004", "Canonical-JSON"],
  },
  {
    term: "Canonical-JSON",
    type: "spec",
    short: "Deterministic JSON serialization with sorted object keys.",
    long: "JSON.stringify in JavaScript follows object insertion order, different runtimes can produce different bytes for semantically-equivalent objects. The HMAC of a canonical-JSON form is stable across runtimes + re-serializations. RFC-004 § 3 specifies the algorithm: keys sorted lexicographically at every depth, arrays preserve order. Test-vectors 1-2 prove the implementation.",
    refs: [
      { label: "RFC-004 § 3", href: "/rfcs/004" },
      { label: "Test vectors", href: "/test-vectors" },
    ],
  },
  {
    term: "Certifier",
    type: "tool",
    short: "Web flow + API that scores any URL 0-100 against RFC-002 + RFC-004.",
    long: "Runs ~9 HTTP checks against a target's public endpoints (agents.json, audit-read, verify, CSV, OpenAPI, security headers) and returns a deterministic Certification JSON. Anyone can verify any sociedad-IA's claims from a single HTTP call with no install.",
    refs: [
      { label: "Web UI", href: "/certifier" },
      { label: "API", href: "/api/certifier?url=https://ar-agents.ar" },
      { label: "Recipe 26", href: "/examples" },
    ],
  },
  {
    term: "CUIT",
    type: "concept",
    short: "Clave Única de Identificación Tributaria, Argentine tax-ID format XX-XXXXXXXX-X.",
    long: "Issued by AFIP/ARCA. Required to invoice (factura electrónica), open a bank account, register as monotributista. The @ar-agents/identity package validates + does padron lookups against the live ARCA WSAA service.",
    refs: [
      { label: "@ar-agents/identity", href: "https://www.npmjs.com/package/@ar-agents/identity" },
      { label: "cuit-hello demo", href: "https://cuit-hello.ar-agents.ar" },
    ],
  },
  {
    term: "Discovery",
    type: "concept",
    short: "The convention that lets a third party find a sociedad-IA's endpoints without prior knowledge.",
    long: "RFC-002 specifies discovery via /.well-known/agents.json. RFC-002-v1.1 adds discovery via DNS TXT (planned). A regulator inspecting a sociedad-IA's URL never has to ask the operator where the audit endpoints are, they're at a fixed location.",
    refs: [
      { label: "RFC-002", href: "/rfcs/002" },
      { label: "Live manifest", href: "/.well-known/agents.json" },
    ],
  },
  {
    term: "Governance class",
    type: "concept",
    short: "One of four tags on each audit entry: algorithm-only, audit-logged, mocked-upstream, requires-confirmation.",
    long: "Determines RFC-001 liability layer. algorithm-only = pure deterministic code, operator liable. audit-logged = LLM call ran with output logged, operator + recorded model provider share. mocked-upstream = demo-tier, no productive effect. requires-confirmation = human-in-the-loop, the confirming human absorbs liability for the action.",
    refs: [
      { label: "RFC-001 § 4", href: "/rfcs/001" },
      { label: "RFC-004 § 6", href: "/rfcs/004" },
    ],
  },
  {
    term: "HMAC-SHA256",
    type: "spec",
    short: "Keyed cryptographic hash. RFC 2104 / FIPS 198-1.",
    long: "Each audit entry's HMAC is computed over the canonical-JSON of the entry (with the hmac field stripped) using a shared secret. The signature can be re-computed and verified by anyone holding the key. Even without the key, anyone can fetch the entries + the verify endpoint to confirm tamper-free state. RFC-004 v1 uses symmetric HMAC; v2 will add asymmetric Ed25519 signatures.",
    refs: [
      { label: "RFC-004 § 3", href: "/rfcs/004" },
      { label: "Web Crypto reference", href: "/architecture/audit-log" },
    ],
  },
  {
    term: "Incorporate",
    type: "tool",
    short: "Auto-incorporation flow: name + capital + objeto + representante → generated sociedad-IA + Vercel deploy.",
    long: "Public wizard at /incorporar. Underneath, calls POST /api/auto-incorporate which generates: source files (Next.js app per sociedad-IA-starter), env-var manifest, legal+operational checklist, audit-log session reference. npm package @ar-agents/incorporate ships the typed TS client.",
    refs: [
      { label: "Wizard", href: "/incorporar" },
      { label: "API", href: "/api/auto-incorporate" },
      { label: "@ar-agents/incorporate", href: "https://www.npmjs.com/package/@ar-agents/incorporate" },
    ],
  },
  {
    term: "MCP",
    type: "protocol",
    short: "Model Context Protocol. Anthropic / open spec for AI-agent tool servers.",
    long: "@ar-agents/mcp wraps every ar-agents library (identity, mercadopago, whatsapp, banking, facturacion, shipping, igj, gde-tad, boletin-oficial, mi-argentina, firma-digital, identity-attest, mercadolibre) as MCP tools so Claude Desktop / Claude Code / ChatGPT MCP users can call them directly.",
    refs: [
      { label: "@ar-agents/mcp", href: "https://www.npmjs.com/package/@ar-agents/mcp" },
      { label: "Repo", href: "https://github.com/ar-agents/ar-agents/tree/main/packages/mcp" },
    ],
  },
  {
    term: "Operator",
    type: "concept",
    short: "The human (or legal entity) responsible for a specific sociedad-IA.",
    long: "Per RFC-001 § 4, the operator absorbs Layer 1 liability, actions tagged algorithm-only or requires-confirmation flow to them. CUIT-identified in the sociedad's well-known manifest. The operator does NOT necessarily code the sociedad; they configure it + accept its operating obligations.",
    refs: [{ label: "RFC-001 § 4", href: "/rfcs/001" }],
  },
  {
    term: "RFC-001",
    type: "spec",
    short: "Three-layer civil-liability framework for sociedades-IA.",
    long: "Operator (Layer 1) → sociedad-IA (Layer 2) → model provider (Layer 3). § 9 specifies the audit-log probative-value contract; § 4 defines governance classes. The keystone document for the regime.",
    refs: [{ label: "Full spec", href: "/rfcs/001" }],
    related: ["Governance class", "Operator"],
  },
  {
    term: "RFC-002",
    type: "spec",
    short: "Agent-discovery-by-default convention.",
    long: "Every sociedad-IA publishes /.well-known/agents.json with issuer, endpoints, rfcConformance. No central registry, no permission. A regulator finds anyone's audit endpoints by going to their domain + /.well-known/agents.json.",
    refs: [{ label: "Full spec", href: "/rfcs/002" }, { label: "Schema", href: "/schemas/agents.v1.json" }],
  },
  {
    term: "RFC-003",
    type: "spec",
    short: "Cross-jurisdictional audit-log reciprocity envelope.",
    long: "Portable JSON envelope for sociedad-IA audit logs crossing jurisdictional boundaries. AR ↔ Wyoming DAO LLC ↔ MIDAO ↔ Estonia OÜ. Each side keeps its own log; the envelope makes them mutually verifiable.",
    refs: [{ label: "Full spec", href: "/rfcs/003" }, { label: "Schema", href: "/schemas/cross-jurisdiction-audit.v1.json" }],
  },
  {
    term: "RFC-004",
    type: "spec",
    short: "Normative operational-log wire format.",
    long: "Pins down what RFC-001 § 9 left open: entry shape, HMAC computation, append-only invariants, verification interface, retention boundaries, conformance test vectors. The document legislation can cite to anchor enforcement.",
    refs: [{ label: "Full spec", href: "/rfcs/004" }, { label: "Schema", href: "/schemas/operational-log-entry.v1.json" }, { label: "Vectors", href: "/test-vectors" }],
  },
  {
    term: "Session",
    type: "concept",
    short: "A coherent series of tool-calls sharing a single governance context.",
    long: "Identified by sessionId (8-64 chars [A-Za-z0-9_-]). Typically corresponds to one customer interaction, one business day, or one HITL-confirmed flow. Each session has its own audit timeline, downloadable as JSON or CSV. The /verify page operates per-session.",
    refs: [{ label: "Verify page", href: "/verify" }],
  },
  {
    term: "Sociedad Automatizada",
    type: "regime",
    short: "The legal name (art. 14) for an AI-run company under Argentina's Anteproyecto de Ley General de Sociedades. \"Sociedad-IA\" is this project's umbrella nickname for it.",
    long: "Art. 14 of the anteproyecto (text dated 28-may-2026, sent to the Senate 1-jun-2026, not yet law) calls it a Sociedad Automatizada: any company type (SRL, SA, SAS) whose object is carried out through autonomous algorithmic systems or AI agents, without requiring employees or human resources for ordinary operation. The declaration must be stated in the estatuto and the denominación must include \"Automatizada\". It is not a cero-humanos figure: it keeps an administrator (art. 88) and answers with its own assets for damage caused by its systems. Throughout this site \"sociedad-IA\" is used as the umbrella nickname; the legal term is Sociedad Automatizada. Comparable in scope to a Wyoming DAO LLC or a Marshall Islands MIDAO foundation: signs contracts, cobra, pays taxes. Its legal personhood is what ar-agents's infrastructure underwrites.",
    refs: [{ label: "Political context", href: "/sociedades-ia" }, { label: "Manifiesto", href: "/manifiesto" }],
    related: ["DAO"],
  },
  {
    term: "DAO",
    type: "regime",
    short: "Sociedad Descentralizada Autónoma Operativa (DAO), the on-chain company type in the anteproyecto (arts. 258-265). \"DAO\" is the bill's own official sigla.",
    long: "A dedicated company type in the Anteproyecto de Ley General de Sociedades (Sección V, arts. 258-265): the Sociedad Descentralizada Autónoma Operativa, abbreviated DAO. Participations are represented by cryptographic tokens on distributed-ledger networks (art. 259) and may lack par value. It is not human-free: art. 260 requires legal representation by one or more human persons, and art. 261 inc. 7 requires a KYC mechanism so only previously-identified members can hold or transfer. Art. 263 requires digital records that are publicly verifiable, reproducible in legible form, and sufficient to reconstruct the entity's patrimonial state, the anteproyecto's anchor for the audit-log thesis in RFC-004 and RFC-006. SAS rules apply supletoriamente. Distinct from a Wyoming DAO LLC or a Marshall Islands MIDAO.",
    refs: [
      { label: "RFC-003", href: "/rfcs/003" },
      { label: "Political context", href: "/sociedades-ia" },
    ],
    related: ["Sociedad Automatizada"],
  },
  {
    term: "Test vectors",
    type: "spec",
    short: "Deterministic JSON vectors any RFC-004 library implementation must produce byte-for-byte.",
    long: "7 vectors at /test-vectors/rfc-004-v1.json with hex-exact HMAC expected values. Frozen per spec version so legislation referencing v1 has a stable target. Reference implementation passes all 7 (96 vitest tests total).",
    refs: [{ label: "Vectors page", href: "/test-vectors" }, { label: "JSON file", href: "/test-vectors/rfc-004-v1.json" }],
  },
];

export const metadata: Metadata = {
  title: "/glossary · every term used across ar-agents, defined · ar-agents",
  description:
    "Definitions of every term used in the ar-agents infrastructure + RFCs: agent, agents.json, AP2, append-only, audit log, canonical-JSON, certifier, CUIT, DAO, discovery, governance class, HMAC, incorporate, MCP, operator, RFCs 001-004, session, Sociedad Automatizada (the legal sociedad-IA figure), test vectors. Cross-linked + searchable.",
  alternates: { canonical: "https://ar-agents.ar/glossary" },
};

export default function GlossaryPage() {
  const sorted = [...ENTRIES].sort((a, b) => a.term.localeCompare(b.term));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DefinedTermSet",
          name: "ar-agents glossary",
          inLanguage: ["en-US", "es-AR"],
          url: "https://ar-agents.ar/glossary",
          hasDefinedTerm: sorted.map((e) => ({
            "@type": "DefinedTerm",
            name: e.term,
            description: `${e.short} ${e.long}`,
            url: `https://ar-agents.ar/glossary#${slug(e.term)}`,
          })),
        }}
      />
      <main
        style={{
          maxWidth: 800,
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
            /glossary · {sorted.length} terms · alphabetical
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
            Glossary.
          </h1>
          <p style={{ fontSize: 16 }}>
            Every term used across ar-agents, in one searchable page. For
            journalists writing their first piece, legislators reading
            the RFCs cold, developers integrating the libraries. Each
            entry links to its canonical reference on the site.
          </p>
        </header>

        {/* Quick index */}
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: 12,
            background: "var(--bg-tint)",
            borderRadius: 8,
            boxShadow: "var(--card-shadow)",
            marginBottom: 32,
            fontSize: 13,
          }}
        >
          {sorted.map((e) => (
            <a
              key={e.term}
              href={`#${slug(e.term)}`}
              style={{
                color: "var(--accent)",
                textDecoration: "none",
                padding: "3px 8px",
                borderRadius: 4,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 12,
              }}
            >
              {e.term}
            </a>
          ))}
        </nav>

        {/* Entries */}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sorted.map((e) => (
            <li
              key={e.term}
              id={slug(e.term)}
              style={{
                marginBottom: 28,
                paddingBottom: 20,
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                <a
                  href={`#${slug(e.term)}`}
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    color: "var(--text-strong)",
                    textDecoration: "none",
                  }}
                >
                  {e.term}
                </a>
                <TypeBadge t={e.type} />
              </div>
              <p style={{ fontSize: 14.5, color: "var(--text-strong)", marginBottom: 8, fontWeight: 500 }}>
                {e.short}
              </p>
              <p style={{ fontSize: 14, color: "var(--text-body)", marginBottom: 10 }}>
                {e.long}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12.5 }}>
                {e.refs.map((r) => {
                  const external = r.href.startsWith("http");
                  if (external) {
                    return (
                      <a key={r.href} href={r.href} style={linkSty}>
                        → {r.label}
                      </a>
                    );
                  }
                  return (
                    <Link key={r.href} href={r.href} style={linkSty}>
                      → {r.label}
                    </Link>
                  );
                })}
              </div>
              {e.related && e.related.length > 0 && (
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
                  Related:{" "}
                  {e.related.map((rel, i) => (
                    <span key={rel}>
                      <a href={`#${slug(rel)}`} style={{ color: "var(--text-muted)", textDecoration: "underline" }}>
                        {rel}
                      </a>
                      {i < e.related!.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>

        <footer
          style={{
            marginTop: 32,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.ar ·{" "}
          <Link href="/" style={linkSty}>/</Link>{" · "}
          <Link href="/rfcs/004" style={linkSty}>RFC-004</Link>{" · "}
          <Link href="/auditor" style={linkSty}>/auditor</Link>
        </footer>
      </main>
    </>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

const TYPE_COLOR: Record<Entry["type"], string> = {
  concept: "#737373",
  protocol: "#a855f7",
  spec: "#0a72ef",
  tool: "#22c55e",
  endpoint: "#eab308",
  regime: "#06b6d4",
};

function TypeBadge({ t }: { t: Entry["type"] }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        background: `${TYPE_COLOR[t]}22`,
        color: TYPE_COLOR[t],
        borderRadius: 4,
        fontWeight: 500,
        textTransform: "uppercase",
      }}
    >
      {t}
    </span>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
