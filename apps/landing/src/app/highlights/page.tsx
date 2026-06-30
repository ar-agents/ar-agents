import type { Metadata } from "next";
import { NOINDEX } from "../noindex";
import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * /highlights, single-page "what ar-agents is" for anyone arriving cold.
 *
 * Different from:
 *   - /auditor (regulators / journalists, Spanish-first, audit-focused)
 *   - /legislacion (legislators, regime-design-focused)
 *   - /sociedades-ia (political context)
 *   - /sdk, /reference, /architecture (developer-focused)
 *
 * /highlights is for ANYONE, investor, recruiter, ally, friend asking
 * "what's ar-agents, in 90 seconds?" The page is short, image-heavy
 * (cert badge embedded), CTA-rich.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "/highlights · what ar-agents is, in 90 seconds · ar-agents",
  description:
    "What ar-agents is, in 90 seconds: open-source infrastructure to create and run an autonomous company (sociedad automatizada) in Argentina. 6 RFCs, 30 cookbook recipes, public certifier scoring 100/100. For anyone arriving cold, investor, recruiter, journalist, ally.",
  alternates: { canonical: "https://ar-agents.ar/highlights" },
};

export default function HighlightsPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "/highlights, what ar-agents is in 90 seconds",
          url: "https://ar-agents.ar/highlights",
          inLanguage: ["en-US", "es-AR"],
          isPartOf: {
            "@type": "WebSite",
            name: "ar-agents",
            url: "https://ar-agents.ar",
          },
        }}
      />
      <main
        style={{
          maxWidth: 840,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 16,
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
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            }}
          >
            /highlights · 90-second read · 2026-05-11
          </p>
          <h1
            style={{
              fontSize: 40,
              lineHeight: 1.08,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Infrastructure to create and run
            <br />
            an autonomous company in Argentina.
          </h1>
          <p style={{ fontSize: 18, color: "var(--text-body)" }}>
            Open-source rails to create and register a sociedad
            automatizada, a company operated by AI agents. The draft
            Ley General de Sociedades that enables it was sent to the
            Argentine Senate on <strong>1 June 2026</strong> and is not
            yet law. We built the technical scaffolding so the
            legislation has something to cite. Six RFCs, 30 cookbook
            recipes, a public certifier, test vectors with deterministic
            signatures, a registry where every implementation scores
            100/100.
          </p>
        </header>

        {/* Conformance hero badge */}
        <section
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 32,
            background: "var(--bg-tint)",
            borderRadius: 12,
            marginBottom: 32,
            boxShadow: "var(--card-shadow)",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <a
            href="/certifier?url=https://ar-agents.ar"
            style={{ display: "block", textDecoration: "none" }}
            title="Run live RFC-002+004 conformance check"
          >
            <img
              src="/api/cert-badge?url=https://ar-agents.ar"
              alt="RFC-002+004: A · 100/100"
              width="240"
              height="30"
              style={{ display: "block", borderRadius: 4 }}
            />
          </a>
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 540 }}>
            The reference implementation self-certifies in real time
            against RFC-002 (discovery) + RFC-004 (operational log) +
            RFC-005 (Ed25519 upgrade path). Click the badge to run the
            check yourself.
          </p>
        </section>

        {/* Key numbers */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
            marginBottom: 40,
          }}
        >
          <Stat n="6" l="RFCs" href="/rfcs/001" />
          <Stat n="30" l="Recipes" href="/examples" />
          <Stat n="33" l="npm packages" href="https://www.npmjs.com/org/ar-agents" />
          <Stat n="103" l="vitest tests" />
          <Stat n="14" l="HTTP APIs" />
          <Stat n="5/5" l="Sociedades A" href="/registro" />
        </section>

        <Section title="What it solves">
          <P>
            Three concrete problems for the proposed regime:
          </P>
          <ul style={ulSty}>
            <li style={liSty}>
              <strong>Civil liability</strong>, RFC-001 specifies a
              three-layer framework (operator / sociedad-IA / model
              provider) anchored to the governance class tag on each
              action.{" "}
              <A href="/rfcs/001">Read RFC-001</A>
            </li>
            <li style={liSty}>
              <strong>Operational evidence</strong>, RFC-004 pins
              down the wire format of the audit log every sociedad
              must keep. With 7 hex-exact test vectors. The reference
              impl passes byte-for-byte.{" "}
              <A href="/rfcs/004">Read RFC-004</A> ·{" "}
              <A href="/test-vectors">View vectors</A>
            </li>
            <li style={liSty}>
              <strong>Public verifiability</strong>, anyone can paste
              any URL into the certifier and get a 0-100 score in
              seconds. No install. No auth.{" "}
              <A href="/certifier">Open /certifier</A>
            </li>
          </ul>
        </Section>

        <Section title="Three URLs to bookmark">
          <ul style={ulSty}>
            <li style={liSty}>
              <A href="/auditor">/auditor</A>, Spanish-first 1-page
              regulator brief. Print-friendly. For journalists,
              inspectors, asesores who arrive cold.
            </li>
            <li style={liSty}>
              <A href="/legislacion">/legislación</A>{" / "}
              <A href="/en/legislation">/en/legislation</A>, Bilingual
              synthesis with suggested cite-by-reference legislative
              text. For ministry staff drafting the bill.
            </li>
            <li style={liSty}>
              <A href="/registro">/registro</A>, Public list of
              implementations with live cert badges + conformance
              sparklines. For anyone who wants proof we ship.
            </li>
          </ul>
        </Section>

        <Section title="If you want to dig in">
          <ul style={ulSty}>
            <li style={liSty}>
              <strong>Operators (you want your own sociedad-IA listed):</strong>{" "}
              <A href="/operator-quickstart">/operator-quickstart</A>{" "}
              (15-min zero-to-listed),{" "}
              <A href="/incorporar">/incorporar</A> (wizard).
            </li>
            <li style={liSty}>
              <strong>Developers:</strong>{" "}
              <A href="/sdk">/sdk</A>,{" "}
              <A href="/examples">/examples</A>,{" "}
              <A href="https://github.com/ar-agents/ar-agents">repo</A>.
            </li>
            <li style={liSty}>
              <strong>Researchers:</strong>{" "}
              <A href="/refs">/refs</A> (BibTeX/APA/Chicago),{" "}
              <code style={codeSty}>CITATION.cff</code> at repo root,{" "}
              <A href="/glossary">/glossary</A>.
            </li>
            <li style={liSty}>
              <strong>Press:</strong>{" "}
              <A href="/auditor">/auditor</A>,{" "}
              <A href="/timeline">/timeline</A>,{" "}
              <A href="/notes/2026-05-11-shipping-spree">shipping-spree note</A>,{" "}
              <A href="/share">/share</A> (outreach templates).
            </li>
            <li style={liSty}>
              <strong>Other jurisdictions (Wyoming / Estonia / Delaware):</strong>{" "}
              <A href="/en/legislation">/en/legislation</A>{" + "}
              <A href="/rfcs/003">RFC-003</A> (cross-jurisdictional
              reciprocity envelope).
            </li>
          </ul>
        </Section>

        <Section title="What's NOT here">
          <P>
            <strong>Honest scoping.</strong> The work covers technical
            infrastructure + evidence format. It does NOT cover:
          </P>
          <ul style={ulSty}>
            <li style={liSty}>
              Tax doctrine (monotributo, IVA, ganancias, ganancia mínima).
            </li>
            <li style={liSty}>Labor (can a sociedad-IA be an employer?).</li>
            <li style={liSty}>Bankruptcy / quiebra (what happens to keys in concurso?).</li>
            <li style={liSty}>Penal (mens rea of an entity without consciousness).</li>
            <li style={liSty}>
              <strong>Productive sociedades.</strong> Today (2026-05-11)
              the registry has 1 reference + 4 demos. Zero productive
              entities transacting with real customers.
            </li>
            <li style={liSty}>
              <strong>Distribution.</strong> The work is shipped but not
              yet promoted. Outreach is the next step.
            </li>
          </ul>
        </Section>

        <Section title="Contact">
          <P>
            <strong>Nazareno Clemente</strong> · author + maintainer ·
            Monte Grande, BA, Argentina.
          </P>
          <P>
            <A href="mailto:naza@naza.ar">naza@naza.ar</A>{" · "}
            <A href="https://github.com/ar-agents/ar-agents/discussions">
              github discussions
            </A>
            . No fees for ministry / regulator / scholar conversations.
          </P>
        </Section>

        <footer
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.ar · MIT (code) + CC-BY-4.0 (specs) ·{" "}
          <Link href="/" style={linkSty}>/</Link>{" · "}
          <Link href="/timeline" style={linkSty}>/timeline</Link>{" · "}
          <Link href="/feed.xml" style={linkSty}>/feed.xml</Link>
        </footer>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginBottom: 32,
        paddingBottom: 24,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: "var(--text-strong)",
          marginBottom: 14,
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 12 }}>{children}</p>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} style={linkSty}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} style={linkSty}>
      {children}
    </Link>
  );
}

function Stat({ n, l, href }: { n: string; l: string; href?: string }) {
  const content = (
    <>
      <div
        style={{
          fontSize: 28,
          fontWeight: 300,
          color: "var(--text-strong)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          lineHeight: 1.05,
          marginBottom: 4,
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {l}
      </div>
    </>
  );
  if (href) {
    const external = href.startsWith("http");
    const inner = (
      <div
        style={{
          padding: 14,
          background: "var(--bg-tint)",
          borderRadius: 8,
          boxShadow: "var(--card-shadow)",
          textAlign: "center",
        }}
      >
        {content}
      </div>
    );
    if (external) {
      return (
        <a href={href} style={{ textDecoration: "none" }}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {inner}
      </Link>
    );
  }
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        textAlign: "center",
      }}
    >
      {content}
    </div>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const codeSty: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
  padding: "1px 5px",
  background: "var(--bg-tint)",
  borderRadius: 4,
  color: "var(--text-strong)",
};

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 12,
};

const liSty: React.CSSProperties = {
  marginBottom: 8,
  lineHeight: 1.55,
};
