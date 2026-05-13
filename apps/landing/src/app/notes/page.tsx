import type { Metadata } from "next";
import Link from "next/link";

/**
 * /notes, index of long-form posts about ar-agents.
 *
 * Distinct from /changelog (which is auto-pulled from per-package
 * CHANGELOG.md). /notes is hand-written narrative: shipping recaps,
 * design notes, retrospectives, anything that wouldn't fit in a
 * changelog entry.
 */

interface NoteIndex {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

const NOTES: ReadonlyArray<NoteIndex> = [
  {
    slug: "2026-05-11-shipping-spree",
    title: "Shipping spree: 18 rounds in one day",
    date: "2026-05-11",
    summary:
      "Recap of what shipped in the autonomous 18-round series spurred by the Sturzenegger announcement. 5 RFCs, 30 recipes, 32+ public surfaces, all 5 sociedades scoring 100/100 conformance. Plus what's NOT in the work (regulatory plumbing, real customers, operator outreach).",
  },
];

export const metadata: Metadata = {
  title: "/notes · long-form posts · ar-agents",
  description:
    "Hand-written narrative notes about ar-agents, shipping recaps, design rationale, retrospectives. Distinct from /changelog (auto-pulled from package CHANGELOGs).",
  alternates: { canonical: "https://ar-agents.ar/notes" },
};

export default function NotesIndexPage() {
  return (
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
          /notes · long-form
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
          Notes.
        </h1>
        <p style={{ fontSize: 16 }}>
          Long-form narrative posts, shipping recaps, design rationale,
          retrospectives. Different from{" "}
          <Link href="/changelog" style={linkSty}>
            /changelog
          </Link>{" "}
          (auto-pulled per-package) and{" "}
          <Link href="/timeline" style={linkSty}>
            /timeline
          </Link>{" "}
          (the chronological event list). Notes are bigger thoughts that
          take a paragraph or two to express.
        </p>
      </header>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {NOTES.map((n) => (
          <li
            key={n.slug}
            style={{
              padding: 20,
              background: "var(--bg-tint)",
              borderRadius: 8,
              boxShadow: "var(--card-shadow)",
              marginBottom: 14,
            }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                marginBottom: 4,
              }}
            >
              {n.date}
            </p>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 500,
                marginBottom: 8,
                color: "var(--text-strong)",
              }}
            >
              <Link
                href={`/notes/${n.slug}`}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {n.title}
              </Link>
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-body)" }}>{n.summary}</p>
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
        <Link href="/timeline" style={linkSty}>/timeline</Link>{" · "}
        <Link href="/changelog" style={linkSty}>/changelog</Link>{" · "}
        <Link href="/feed.xml" style={linkSty}>/feed.xml</Link>
      </footer>
    </main>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
