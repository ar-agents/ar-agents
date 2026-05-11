import type { Metadata } from "next";
import Link from "next/link";

/**
 * /refs — Academic citation entries for /arg artifacts.
 *
 * Audience: researchers, legal scholars, comparative-law academics
 * writing about AI agent regimes. They want BibTeX (or APA, Chicago,
 * MLA) entries for the RFCs + the test vectors. Saves them 20 minutes
 * of guessing.
 */

interface Ref {
  id: string;
  title: string;
  type: "rfc" | "dataset" | "software" | "website";
  bibtex: string;
  apa: string;
  chicago: string;
  url: string;
}

const REFS: ReadonlyArray<Ref> = [
  {
    id: "rfc-001-v1",
    type: "rfc",
    url: "https://ar-agents.vercel.app/rfcs/001",
    title: "RFC-001: Three-layer civil liability framework for Argentine sociedades-IA",
    bibtex: `@techreport{clemente2026rfc001,
  author      = {Clemente, Nazareno},
  title       = {{RFC-001}: Three-layer civil liability framework for Argentine sociedades-IA},
  institution = {ar-agents},
  year        = {2026},
  type        = {{Request for Comments}},
  number      = {001},
  version     = {v1},
  url         = {https://ar-agents.vercel.app/rfcs/001},
  note        = {CC-BY-4.0}
}`,
    apa: `Clemente, N. (2026). RFC-001: Three-layer civil liability framework for Argentine sociedades-IA (Request for Comments No. 001, Version 1). ar-agents. https://ar-agents.vercel.app/rfcs/001`,
    chicago: `Clemente, Nazareno. "RFC-001: Three-layer civil liability framework for Argentine sociedades-IA." Request for Comments 001, ar-agents, 2026. https://ar-agents.vercel.app/rfcs/001.`,
  },
  {
    id: "rfc-002-v1",
    type: "rfc",
    url: "https://ar-agents.vercel.app/rfcs/002",
    title: "RFC-002: Agent-discovery-by-default convention",
    bibtex: `@techreport{clemente2026rfc002,
  author      = {Clemente, Nazareno},
  title       = {{RFC-002}: Agent-discovery-by-default convention},
  institution = {ar-agents},
  year        = {2026},
  type        = {{Request for Comments}},
  number      = {002},
  version     = {v1},
  url         = {https://ar-agents.vercel.app/rfcs/002},
  note        = {CC-BY-4.0}
}`,
    apa: `Clemente, N. (2026). RFC-002: Agent-discovery-by-default convention (Request for Comments No. 002, Version 1). ar-agents. https://ar-agents.vercel.app/rfcs/002`,
    chicago: `Clemente, Nazareno. "RFC-002: Agent-discovery-by-default convention." Request for Comments 002, ar-agents, 2026. https://ar-agents.vercel.app/rfcs/002.`,
  },
  {
    id: "rfc-003-draft",
    type: "rfc",
    url: "https://ar-agents.vercel.app/rfcs/003",
    title: "RFC-003: Cross-jurisdictional audit-log reciprocity",
    bibtex: `@techreport{clemente2026rfc003,
  author      = {Clemente, Nazareno},
  title       = {{RFC-003}: Cross-jurisdictional audit-log reciprocity},
  institution = {ar-agents},
  year        = {2026},
  type        = {{Request for Comments}},
  number      = {003},
  version     = {draft},
  url         = {https://ar-agents.vercel.app/rfcs/003},
  note        = {CC-BY-4.0, draft}
}`,
    apa: `Clemente, N. (2026). RFC-003: Cross-jurisdictional audit-log reciprocity (Request for Comments No. 003, Draft). ar-agents. https://ar-agents.vercel.app/rfcs/003`,
    chicago: `Clemente, Nazareno. "RFC-003: Cross-jurisdictional audit-log reciprocity." Request for Comments 003 (draft), ar-agents, 2026. https://ar-agents.vercel.app/rfcs/003.`,
  },
  {
    id: "rfc-004-draft",
    type: "rfc",
    url: "https://ar-agents.vercel.app/rfcs/004",
    title: "RFC-004: Operational-log specification for AR sociedades-IA",
    bibtex: `@techreport{clemente2026rfc004,
  author      = {Clemente, Nazareno},
  title       = {{RFC-004}: Operational-log specification for AR sociedades-IA},
  institution = {ar-agents},
  year        = {2026},
  type        = {{Request for Comments}},
  number      = {004},
  version     = {draft},
  url         = {https://ar-agents.vercel.app/rfcs/004},
  note        = {CC-BY-4.0, draft}
}`,
    apa: `Clemente, N. (2026). RFC-004: Operational-log specification for AR sociedades-IA (Request for Comments No. 004, Draft). ar-agents. https://ar-agents.vercel.app/rfcs/004`,
    chicago: `Clemente, Nazareno. "RFC-004: Operational-log specification for AR sociedades-IA." Request for Comments 004 (draft), ar-agents, 2026. https://ar-agents.vercel.app/rfcs/004.`,
  },
  {
    id: "test-vectors-rfc-004-v1",
    type: "dataset",
    url: "https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json",
    title: "RFC-004 v1 conformance test vectors",
    bibtex: `@misc{clemente2026testvectors,
  author       = {Clemente, Nazareno},
  title        = {{RFC-004 v1} conformance test vectors},
  year         = {2026},
  publisher    = {ar-agents},
  howpublished = {\\url{https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json}},
  note         = {Dataset, CC-BY-4.0}
}`,
    apa: `Clemente, N. (2026). RFC-004 v1 conformance test vectors [Dataset]. ar-agents. https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json`,
    chicago: `Clemente, Nazareno. "RFC-004 v1 conformance test vectors." Dataset, ar-agents, 2026. https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json.`,
  },
  {
    id: "ar-agents-toolkit",
    type: "software",
    url: "https://github.com/ar-agents/ar-agents",
    title: "ar-agents: Open-source infrastructure for Argentine sociedades-IA",
    bibtex: `@software{clemente2026aragents,
  author       = {Clemente, Nazareno},
  title        = {{ar-agents}: Open-source infrastructure for {Argentine} sociedades-{IA}},
  year         = {2026},
  publisher    = {GitHub},
  url          = {https://github.com/ar-agents/ar-agents},
  note         = {MIT license}
}`,
    apa: `Clemente, N. (2026). ar-agents: Open-source infrastructure for Argentine sociedades-IA [Computer software]. GitHub. https://github.com/ar-agents/ar-agents`,
    chicago: `Clemente, Nazareno. ar-agents: Open-source infrastructure for Argentine sociedades-IA. v0.x, 2026. https://github.com/ar-agents/ar-agents.`,
  },
];

export const metadata: Metadata = {
  title: "/refs · academic citation entries · ar-agents",
  description:
    "BibTeX, APA, and Chicago citation entries for the four RFCs, the test-vectors dataset, and the open-source toolkit. For comparative-law scholars, AI-governance researchers, and anyone citing this work in academic literature.",
  alternates: { canonical: "https://ar-agents.vercel.app/refs" },
};

export default function RefsPage() {
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
          /arg · /refs · BibTeX · APA · Chicago
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
          Academic references.
        </h1>
        <p style={{ fontSize: 16 }}>
          Pre-formatted citation entries for every published artifact:
          the four RFCs, the test-vectors dataset, the open-source toolkit.
          For comparative-law scholars + AI-governance researchers + anyone
          citing this work in literature. All under CC-BY-4.0 (specs) or
          MIT (code) — re-use freely with attribution.
        </p>
      </header>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {REFS.map((r) => (
          <li
            key={r.id}
            style={{
              marginBottom: 32,
              paddingBottom: 24,
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  color: "var(--text-strong)",
                  marginBottom: 4,
                }}
              >
                <a href={r.url} style={{ color: "inherit", textDecoration: "none" }}>
                  {r.title}
                </a>
              </h2>
              <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.id}</code>{" · "}
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {r.type}
              </span>
            </div>

            <Format label="BibTeX" content={r.bibtex} />
            <Format label="APA" content={r.apa} />
            <Format label="Chicago" content={r.chicago} />
          </li>
        ))}
      </ul>

      <section style={{ marginTop: 16, paddingTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12, fontWeight: 500, color: "var(--text-strong)" }}>
          Notes on citation
        </h2>
        <ul style={{ paddingLeft: 24, fontSize: 14, marginBottom: 16 }}>
          <li style={{ marginBottom: 6 }}>
            Cite the RFC by version (v1) if you reference the stable release;
            by &quot;draft&quot; if the document is still in active revision (currently
            RFC-003 + RFC-004). The frozen v1 vectors at /test-vectors stay
            stable so legislation referencing them has a consistent target.
          </li>
          <li style={{ marginBottom: 6 }}>
            For replication studies of the conformance vectors, cite the
            specific JSON file URL + the publishedAt date inside the file.
          </li>
          <li style={{ marginBottom: 6 }}>
            For software citation, prefer{" "}
            <a href="https://citation-file-format.github.io/" style={linkSty}>
              CITATION.cff
            </a>{" "}
            (planned next at github.com/ar-agents/ar-agents/CITATION.cff).
          </li>
        </ul>
      </section>

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
        <Link href="/rfcs/004" style={linkSty}>RFC-004</Link>{" · "}
        <Link href="/test-vectors" style={linkSty}>/test-vectors</Link>
      </footer>
    </main>
  );
}

function Format({ label, content }: { label: string; content: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <pre
        style={{
          padding: 10,
          background: "var(--bg-tint)",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          color: "var(--text-body)",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}
      >
        {content}
      </pre>
    </div>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
