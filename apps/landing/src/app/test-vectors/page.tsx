import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonLd } from "../json-ld";

/**
 * /test-vectors — Human-browsable index of the RFC conformance vectors.
 *
 * Server-rendered with revalidate so the page reflects whatever is
 * committed to /public/test-vectors/. The actual vectors live as static
 * JSON files alongside this page — library authors fetch them at test
 * time, this page is the human-discoverable index pointing to those
 * files + showing the conformance status of each known impl.
 */

export const dynamic = "force-static";
export const revalidate = 86400; // 24h
export const runtime = "nodejs";

interface VectorsFile {
  spec: string;
  version: string;
  publishedAt: string;
  notes: string;
  vectors: Array<{ id: string; description: string }>;
  conformance: { vectorsCount: number; referenceImplementation: { language: string; file: string; testFile: string; repo: string } };
}

export const metadata: Metadata = {
  title: "/test-vectors · normative conformance vectors for RFC-004 · ar-agents",
  description:
    "Deterministic JSON test vectors any sociedad-IA library author can run against their implementation to claim RFC-004 v1 conformance. Vectors are versioned + frozen per spec version; this page is the human-browsable index.",
  alternates: { canonical: "https://ar-agents.vercel.app/test-vectors" },
};

function loadVectors(): VectorsFile | null {
  try {
    const p = resolve(process.cwd(), "public/test-vectors/rfc-004-v1.json");
    return JSON.parse(readFileSync(p, "utf8")) as VectorsFile;
  } catch {
    return null;
  }
}

export default function TestVectorsPage() {
  const v = loadVectors();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "RFC-004 v1 conformance test vectors",
          description:
            "Deterministic JSON test vectors for the AR sociedad-IA operational-log specification (RFC-004 v1). Versioned and frozen per spec revision.",
          url: "https://ar-agents.vercel.app/test-vectors",
          license: "https://creativecommons.org/licenses/by/4.0/",
          creator: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@helloastro.co",
          },
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: "https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json",
            },
          ],
        }}
      />

      <main
        style={{
          maxWidth: 880,
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
            /arg · /test-vectors · conformance · index
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
            Conformance test vectors.
          </h1>
          <p style={{ fontSize: 16, color: "var(--text-body)" }}>
            Deterministic JSON files any library author can fetch + run
            against their implementation. Versioned + frozen per spec
            revision so legislation referencing a vector set has a stable
            target. Each vector is reproducible: given the same inputs,
            every conformant implementation must produce the same outputs
            byte-for-byte.
          </p>
        </header>

        <section style={sectionStyle}>
          <h2 style={h2Style}>RFC-004 v1 · sociedad-IA operational-log</h2>
          <p style={{ marginBottom: 12 }}>
            <strong>Spec:</strong>{" "}
            <Link href="/rfcs/004" style={linkStyle}>
              /rfcs/004
            </Link>{" "}
            · <strong>Status:</strong> {v ? "draft" : "(vectors not loaded)"} ·{" "}
            <strong>Published:</strong> {v?.publishedAt ?? "—"} ·{" "}
            <strong>Vectors:</strong> {v?.conformance?.vectorsCount ?? "—"}
          </p>

          <div
            style={{
              padding: 16,
              background: "var(--bg-tint)",
              borderRadius: 8,
              boxShadow: "var(--card-shadow)",
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Download</p>
            <p>
              <a
                href="/test-vectors/rfc-004-v1.json"
                style={{ ...linkStyle, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
              >
                /test-vectors/rfc-004-v1.json
              </a>
            </p>
            <p style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13 }}>
              Application/json · CC-BY-4.0 · frozen at v1 publication
            </p>
          </div>

          {v?.notes && (
            <p style={{ marginBottom: 16, color: "var(--text-muted)", fontSize: 13.5 }}>
              {v.notes}
            </p>
          )}

          <h3 style={h3Style}>Vectors index</h3>
          {v ? (
            <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
              {v.vectors.map((vec) => (
                <li key={vec.id} style={{ marginBottom: 6, lineHeight: 1.5 }}>
                  <code style={codeInlineStyle}>{vec.id}</code> — {vec.description}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>
              Vectors file not found at build time. This is expected during
              the initial deploy if the file post-dates the build cache.
            </p>
          )}

          <h3 style={h3Style}>Reference implementation</h3>
          <p>
            The TypeScript reference impl + its conformance proof live in
            the same repo:
          </p>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>Library:</strong>{" "}
              <code style={codeInlineStyle}>apps/landing/src/lib/audit.ts</code>
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Conformance tests:</strong>{" "}
              <code style={codeInlineStyle}>
                apps/landing/test/rfc-004-vectors.test.ts
              </code>
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Repo:</strong>{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={linkStyle}
              >
                github.com/ar-agents/ar-agents
              </a>
            </li>
          </ul>

          <h3 style={h3Style}>How to claim conformance</h3>
          <ol style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={{ marginBottom: 6 }}>
              Fetch the JSON file:{" "}
              <code style={codeInlineStyle}>curl -sL https://ar-agents.vercel.app/test-vectors/rfc-004-v1.json</code>
            </li>
            <li style={{ marginBottom: 6 }}>
              Run every vector through your library. Compare{" "}
              <code style={codeInlineStyle}>expectedCanonical</code> +{" "}
              <code style={codeInlineStyle}>expectedHmac</code> byte-for-byte.
            </li>
            <li style={{ marginBottom: 6 }}>
              All 7 vectors must match exactly. <code style={codeInlineStyle}>mustDifferFrom</code> +{" "}
              <code style={codeInlineStyle}>mustEqual</code> cross-checks must
              also hold.
            </li>
            <li style={{ marginBottom: 6 }}>
              Open a PR to{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={linkStyle}
              >
                github.com/ar-agents/ar-agents
              </a>{" "}
              adding your library to the conformance registry with a link
              to your passing test suite.
            </li>
          </ol>

          <h3 style={h3Style}>Conformance registry</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={thStyle}>Library</th>
                <th style={thStyle}>Language</th>
                <th style={thStyle}>Version</th>
                <th style={thStyle}>RFC-004 v1</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>
                  <code style={codeInlineStyle}>apps/landing/src/lib/audit</code>
                </td>
                <td style={tdStyle}>TypeScript</td>
                <td style={tdStyle}>(reference)</td>
                <td style={{ ...tdStyle, color: "#22c55e", fontWeight: 500 }}>
                  ✓ passing (7/7)
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>(your library here)</td>
                <td style={tdStyle}>—</td>
                <td style={tdStyle}>—</td>
                <td style={tdStyle}>open a PR</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Versioning policy</h2>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>Spec version = vectors version.</strong> When
              RFC-004 publishes v2, a parallel{" "}
              <code style={codeInlineStyle}>rfc-004-v2.json</code> appears.
              v1 stays frozen so legislation citing v1 remains stable.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>v1 finalization checkpoint.</strong> Vectors marked{" "}
              <em>draft</em> may change one more time before v1 final.
              After that, the hex values are locked.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>License.</strong> CC-BY-4.0 on the vectors + MIT on
              the reference impl. Use anywhere; attribute the spec.
            </li>
          </ul>
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
          <Link href="/rfcs/004" style={linkStyle}>
            RFC-004
          </Link>{" "}
          ·{" "}
          <Link href="/auditor" style={linkStyle}>
            /auditor
          </Link>{" "}
          ·{" "}
          <Link href="/" style={linkStyle}>
            /
          </Link>
        </footer>
      </main>
    </>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 40,
  paddingBottom: 32,
  borderBottom: "1px solid var(--border-subtle)",
};

const h2Style: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 500,
  color: "var(--text-strong)",
  marginBottom: 12,
  letterSpacing: "-0.005em",
};

const h3Style: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: "var(--text-strong)",
  marginTop: 24,
  marginBottom: 12,
};

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const codeInlineStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
  padding: "1px 5px",
  background: "var(--bg-tint)",
  borderRadius: 4,
  color: "var(--text-strong)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  fontWeight: 500,
  fontSize: 12,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-body)",
  fontSize: 13.5,
};
