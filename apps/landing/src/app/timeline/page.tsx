import type { Metadata } from "next";
import Link from "next/link";

/**
 * /timeline — Visual chronology from the Sturzenegger announcement to
 * the current state of /arg.
 *
 * Useful for any reader who arrives mid-story: a journalist deciding
 * whether to cover this, a regulator deciding whether to engage, a
 * developer deciding whether to invest time. The page answers "what
 * happened, in what order, why does it matter?" in a single scroll.
 */

interface Event {
  date: string;          // ISO yyyy-mm-dd
  kind: "context" | "spec" | "ship" | "milestone";
  title: string;
  detail: string;
  refs?: { label: string; href: string }[];
}

const EVENTS: ReadonlyArray<Event> = [
  {
    date: "2026-04-28",
    kind: "context",
    title: "Ministerio de Desregulación announces sociedad-IA regime",
    detail:
      "Federico Sturzenegger announces Argentina will create a legal personhood for AI-only companies ('sociedades-IA'). No bill text yet. Public debate begins.",
  },
  {
    date: "2026-05-05",
    kind: "milestone",
    title: "Initial launch · 17 npm packages + landing site",
    detail:
      "/arg published as open-source infrastructure: 17 packages covering MercadoPago, AFIP/ARCA, banking, WhatsApp, factura, shipping, GDE/TAD, BCRA, IGJ, BO, ML. Landing site + first wave of demos live.",
    refs: [
      { label: "Repo", href: "https://github.com/ar-agents/ar-agents" },
      { label: "npm org", href: "https://www.npmjs.com/org/ar-agents" },
    ],
  },
  {
    date: "2026-05-05",
    kind: "spec",
    title: "RFC-001 published — three-layer liability framework",
    detail:
      "First normative document: operator / sociedad-IA / model-provider layered civil liability. § 9 specifies the audit-log probative-value contract.",
    refs: [{ label: "RFC-001", href: "/rfcs/001" }],
  },
  {
    date: "2026-05-05",
    kind: "spec",
    title: "RFC-002 published — agent-discovery-by-default",
    detail:
      "/.well-known/agents.json convention. No central registry. Every sociedad-IA publishes its endpoints at a fixed location.",
    refs: [{ label: "RFC-002", href: "/rfcs/002" }],
  },
  {
    date: "2026-05-10",
    kind: "ship",
    title: "Round 1 · /architecture/audit-log + /walkthrough + /embed + CSV + recipe 23",
    detail:
      "11-section audit-log deep-dive. Annotated demo walkthrough. Badge embed playground. CSV export endpoint. Cookbook recipe 23. Astro merge readiness review.",
  },
  {
    date: "2026-05-10",
    kind: "ship",
    title: "Round 2 · /data-room + /codegen + /architecture/security + RFC-003 + recipe 24",
    detail:
      "Live npm + GitHub numbers at /data-room. Multi-language snippets at /codegen. Security threat walkthrough. RFC-003 cross-jurisdictional reciprocity envelope. Disaster recovery recipe.",
    refs: [{ label: "RFC-003", href: "/rfcs/003" }],
  },
  {
    date: "2026-05-11",
    kind: "spec",
    title: "RFC-004 published — operational-log normative wire format",
    detail:
      "The document legislation can cite. Pins down: entry shape MUST/SHOULD/MAY fields, HMAC computation, append-only invariants, retention boundaries, conformance test vectors.",
    refs: [{ label: "RFC-004", href: "/rfcs/004" }],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 3 · /auditor + RFC-004 + cookbook recipe 25",
    detail:
      "Spanish-first 1-page regulator brief. Quarterly compliance report generator (recipe 25).",
    refs: [{ label: "/auditor", href: "/auditor" }],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 4 · /test-vectors + /legislación + /registro + OpenAPI 3.1",
    detail:
      "7 deterministic conformance vectors with hex-exact HMAC values. Spanish synthesis for legislators with suggested cite-by-reference text. Public registry of known implementations. OpenAPI 3.1 schema at /api/openapi.",
    refs: [
      { label: "/test-vectors", href: "/test-vectors" },
      { label: "/legislación", href: "/legislacion" },
      { label: "/registro", href: "/registro" },
    ],
  },
  {
    date: "2026-05-11",
    kind: "milestone",
    title: "/certifier launches — reference impl self-scores 100/100",
    detail:
      "Anyone can verify any sociedad-IA's RFC conformance in seconds. Paste URL → score 0-100 + per-check report. Reference implementation passes 10/10 checks at Rating A.",
    refs: [
      { label: "/certifier", href: "/certifier" },
      { label: "API", href: "/api/certifier?url=https://ar-agents.vercel.app" },
    ],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 5 · /certifier + recipe 26 + GitHub Actions template + llms.txt",
    detail:
      "Compliance certifier web flow + API. Reusable TS function (recipe 26) with CLI exit-code gate. Drop-in GH Actions workflow for downstream quarterly compliance. /llms.txt rewritten to expose all new endpoints.",
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 6 · cert-badge SVG + 4 JSON schemas + custom OG images",
    detail:
      "Embeddable shields-style badge showing live RFC-002+004 score for any URL. 4 published JSON schemas (operational-log, agents, certification, cross-jurisdiction). Custom Open Graph images for /auditor, /legislacion, /certifier.",
    refs: [{ label: "Badge demo", href: "/api/cert-badge?url=https://ar-agents.vercel.app" }],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 7 · /en/legislation + /feed.xml + /status badge + /sociedades-ia",
    detail:
      "English synthesis for international press + scholars. Atom feed for subscribers. Live cert-badge on operational /status page. Updated /sociedades-ia with links to every artifact.",
    refs: [
      { label: "/en/legislation", href: "/en/legislation" },
      { label: "/feed.xml", href: "/feed.xml" },
    ],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 8 · /glossary + /share + RFC-003 envelope generator",
    detail:
      "21 alphabetized term definitions. 6 prepared outreach templates (Twitter, LinkedIn, regulator email, journalist email). Live RFC-003 envelope generator at /api/rfc-003-envelope.",
    refs: [
      { label: "/glossary", href: "/glossary" },
      { label: "/share", href: "/share" },
    ],
  },
  {
    date: "2026-05-11",
    kind: "ship",
    title: "Round 9 · RFC-004 § 5 key-possession + /refs + /timeline + live registry badges",
    detail:
      "Challenge-response key-possession endpoint at /.well-known/sociedad-ia/verify-key. /refs with BibTeX/APA/Chicago citation entries. This /timeline page. Each /registro entry now shows its live cert-badge.",
  },
];

const KIND_COLOR: Record<Event["kind"], string> = {
  context: "#737373",
  spec: "#0a72ef",
  ship: "#22c55e",
  milestone: "#a855f7",
};

const KIND_LABEL: Record<Event["kind"], string> = {
  context: "Context",
  spec: "Spec",
  ship: "Ship",
  milestone: "Milestone",
};

export const metadata: Metadata = {
  title: "/timeline · chronology of /arg, from Sturzenegger announcement onwards · ar-agents",
  description:
    "Visual timeline of every event in the /arg story so far: the Sturzenegger sociedad-IA announcement (28-abr-2026), the initial launch (05-may), the RFCs (001-004), the shipping rounds, the certifier reaching 100/100. Helps any reader arriving mid-story get oriented in one scroll.",
  alternates: { canonical: "https://ar-agents.vercel.app/timeline" },
};

export default function TimelinePage() {
  return (
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
          /arg · /timeline · chronology · 2026-04-28 → present
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
          Timeline.
        </h1>
        <p style={{ fontSize: 16 }}>
          Every event in the /arg story so far. For any reader arriving
          mid-narrative — journalists, regulators, developers. One scroll
          to get oriented.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(["context", "spec", "ship", "milestone"] as Event["kind"][]).map((k) => (
            <span key={k} style={{ fontSize: 11, color: KIND_COLOR[k], padding: "3px 8px", background: `${KIND_COLOR[k]}22`, borderRadius: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </header>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, position: "relative" }}>
        {EVENTS.map((e, i) => (
          <li
            key={i}
            style={{
              marginBottom: 20,
              paddingLeft: 28,
              position: "relative",
              borderLeft: "2px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -7,
                top: 4,
                width: 12,
                height: 12,
                borderRadius: 6,
                background: KIND_COLOR[e.kind],
                boxShadow: "0 0 0 3px var(--bg)",
              }}
            />
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
              <code
                style={{
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {e.date}
              </code>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: KIND_COLOR[e.kind],
                  padding: "2px 7px",
                  background: `${KIND_COLOR[e.kind]}22`,
                  borderRadius: 4,
                  fontWeight: 500,
                  textTransform: "uppercase",
                }}
              >
                {KIND_LABEL[e.kind]}
              </span>
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--text-strong)",
                marginBottom: 6,
                marginTop: 0,
              }}
            >
              {e.title}
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-body)", marginBottom: 6 }}>{e.detail}</p>
            {e.refs && e.refs.length > 0 && (
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
            )}
          </li>
        ))}
      </ol>

      <footer
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        ar-agents.vercel.app ·{" "}
        <Link href="/" style={linkSty}>/</Link>{" · "}
        <Link href="/feed.xml" style={linkSty}>/feed.xml</Link>{" · "}
        <Link href="/glossary" style={linkSty}>/glossary</Link>
      </footer>
    </main>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
