import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../json-ld";

export const metadata: Metadata = {
  title: "Shipping spree: 18 rounds in one day · ar-agents notes",
  description:
    "Recap of what shipped in the autonomous 18-round series after the Sturzenegger sociedad-IA announcement: 6 RFCs, 30 cookbook recipes, 32+ public surfaces, all 5 sociedades at 100/100 conformance. Plus a list of what's deliberately NOT in the work.",
  alternates: {
    canonical:
      "https://ar-agents.ar/notes/2026-05-11-shipping-spree",
  },
  openGraph: {
    title: "Shipping spree: 18 rounds in one day",
    description:
      "6 RFCs, 30 recipes, 32+ surfaces, all 5 sociedades 100/100 conformance, in one continuous day.",
    type: "article",
  },
};

export default function NotePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: "Shipping spree: 18 rounds in one day",
          datePublished: "2026-05-11",
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@naza.ar",
          },
          url: "https://ar-agents.ar/notes/2026-05-11-shipping-spree",
          inLanguage: "en-US",
        }}
      />
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 15.5,
          lineHeight: 1.65,
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
            2026-05-11 · ar-agents · /notes
          </p>
          <h1
            style={{
              fontSize: 34,
              lineHeight: 1.1,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 12,
              letterSpacing: "-0.015em",
            }}
          >
            Shipping spree: 18 rounds in one day.
          </h1>
          <p style={{ fontSize: 17, color: "var(--text-muted)", marginBottom: 12 }}>
            What shipped on 11 May 2026, in 18 autonomous rounds.
          </p>
        </header>

        <P>
          On 28 April 2026 Argentina&apos;s Ministerio de Desregulación
          announced a regime for <em>sociedades-IA</em>, AI-only
          companies that can transact autonomously. By 5 May the npm
          packages, the landing site, and RFC-001 (three-layer civil
          liability) were live. The first reaction from the technical
          community was: &quot;OK, the basic libraries are there. Now
          what does it actually mean to operationalize one of these?&quot;
        </P>
        <P>
          The 13 days between then and now (today, 11 May) have answered
          that question by shipping the missing pieces. Today alone, in
          18 distinct shipping rounds, the work jumped from &quot;has
          libraries + has a vision RFC&quot; to &quot;has 6 RFCs, 30
          recipes, 32 public surfaces, a working certifier, a frozen
          conformance test-vectors corpus, a one-page regulator brief, a
          legislative synthesis in Spanish and English, a public
          registry with 5 deployments each scoring 100/100.&quot;
        </P>
        <P>
          This note is the recap.
        </P>

        <H2>What shipped</H2>
        <P>
          The 18 rounds layered concrete artifacts on top of the
          existing libraries. Each round took 30 to 90 minutes; cumulative
          inventory at the end of round 18:
        </P>
        <ul style={ulStyle}>
          <Li>
            <strong>6 RFCs</strong>{" "}(<A href="/rfcs/001">001</A>,{" "}
            <A href="/rfcs/002">002</A>, <A href="/rfcs/003">003</A>,{" "}
            <A href="/rfcs/004">004</A>, <A href="/rfcs/005">005</A>)
            covering civil liability, agent discovery,
            cross-jurisdictional reciprocity, normative operational-log wire
            format, and the Ed25519 asymmetric upgrade path. CC-BY-4.0,
            ready for legislation to <em>cite-by-reference</em>.
          </Li>
          <Li>
            <strong>2 frozen test-vectors files</strong>:{" "}
            <A href="/test-vectors/rfc-004-v1.json">RFC-004 v1 (7 vectors)</A>{" "}
            + <A href="/test-vectors/rfc-005-v1.json">RFC-005 v1 (3 vectors)</A>{" "}
            with hex-exact deterministic HMAC + Ed25519 signatures.
            Reference impl passes all 10 (103 vitest tests across 6 files).
          </Li>
          <Li>
            <strong>Public certifier</strong> at{" "}
            <A href="/certifier">/certifier</A>, paste any URL, get a
            0-100 score across ~11 checks in seconds. Honors{" "}
            <code style={codeSty}>rfcConformance</code> claims: SKIPs
            checks the manifest doesn&apos;t claim, FAILs only on
            overclaim. Reference impl + all 4 demos score 100/100 A.
          </Li>
          <Li>
            <strong>14 HTTP APIs</strong> + <strong>3 well-known
            endpoints</strong>, audit (read/verify/csv/stream), badge,
            cert-badge, openapi (JSON + YAML), discovery, certifier,
            conformance-history (KV time-series), auto-monitor (daily
            cron), auto-incorporate, rfc-003-envelope, audit-summary,
            well-known/verify-key (RFC-004 § 5), well-known/sociedad-ia/keys
            (RFC-005 § 4).
          </Li>
          <Li>
            <strong>Bilingual narrative</strong>:{" "}
            <A href="/legislacion">/legislación</A> (Spanish, for the
            actual legislator) and{" "}
            <A href="/en/legislation">/en/legislation</A> (English, for
            international press + comparative-law scholars). Both with
            suggested cite-by-reference articles.
          </Li>
          <Li>
            <strong>Regulator brief</strong>:{" "}
            <A href="/auditor">/auditor</A>, 1-page Spanish-first,
            print-friendly summary. 7-minute read. Every claim links to
            evidence.
          </Li>
          <Li>
            <strong>Public registry</strong>:{" "}
            <A href="/registro">/registro</A>, 5 entries, each with
            live cert-badge + conformance sparkline. All 5 currently
            score 100/100 A. Self-listing via PR (recipe 30).
          </Li>
          <Li>
            <strong>30 cookbook recipes</strong> at{" "}
            <A href="/examples">/examples</A>. Highlights:
            <ul style={ulInnerStyle}>
              <Li>25, quarterly compliance report generator (the
              answer to a regulator request, generated from the audit
              log alone).</Li>
              <Li>26, single-shot certifier function (also backs the
              web /certifier UI).</Li>
              <Li>27, live monitoring loop with drift detection +
              alerting.</Li>
              <Li>28, operator pre-launch readiness checklist.</Li>
              <Li>29, Ed25519 keypair generation + publication
              walkthrough (RFC-005 § 4).</Li>
              <Li>30, registry-submission PR-body generator with
              honesty heuristics + pre-flight checks.</Li>
            </ul>
          </Li>
          <Li>
            <strong>4 published JSON schemas</strong> at{" "}
            <A href="/schemas/operational-log-entry.v1.json">/schemas/*</A>,
            operational-log entry (RFC-004), agents.json (RFC-002),
            certification (the /certifier output), cross-jurisdiction
            envelope (RFC-003).
          </Li>
          <Li>
            <strong>Operator tooling</strong>:{" "}
            <A href="/glossary">/glossary</A> (21 alphabetized terms),{" "}
            <A href="/refs">/refs</A> (BibTeX/APA/Chicago citations),{" "}
            <A href="/share">/share</A> (6 prepared social + email
            templates),{" "}
            <A href="/timeline">/timeline</A> (visual chronology),{" "}
            <A href="/audit-explorer/ar-agents-sociedad-automatizada">/audit-explorer/{`{sessionId}`}</A>{" "}
            (forensic per-session view),{" "}
            <A href="/feed.xml">/feed.xml</A> (Atom feed of shipping
            rounds),{" "}
            <code style={codeSty}>CITATION.cff</code> at the repo root.
          </Li>
        </ul>

        <H2>What&apos;s NOT in the work</H2>
        <P>
          Honest scoping. The 18 rounds covered the technical
          infrastructure layer. They do <em>not</em> cover:
        </P>
        <ul style={ulStyle}>
          <Li>
            <strong>Tax doctrine.</strong> Does a sociedad-IA pay
            monotributo, IVA, ganancias, ganancia mínima presunta? Each
            requires its own political decision. The RFCs are silent.
          </Li>
          <Li>
            <strong>Labor.</strong> Can a sociedad-IA be an employer? Is
            it joint-and-several with the humans it instructs? Out of
            scope.
          </Li>
          <Li>
            <strong>Bankruptcy.</strong> How is a sociedad-IA liquidated?
            What happens to cryptographic keys in concurso preventivo?
            Out of scope.
          </Li>
          <Li>
            <strong>Penal.</strong> Mens rea of an entity without
            consciousness. Imputability of the operator for dolo or
            culpa of the agent. Out of scope.
          </Li>
          <Li>
            <strong>Real productive sociedades.</strong> Today (2026-05-11)
            the registry has 1 reference implementation + 4 demos. Zero
            productive sociedades transacting with real customers.
            That&apos;s honest. It changes the day Meta Business
            Verification + MP production access land for the existing
            Astro/Publi projects, or the day a third party deploys
            their own and lists it.
          </Li>
          <Li>
            <strong>Outreach.</strong> The artifacts are done; getting
            them in front of Sturzenegger&apos;s asesores, AAIP/AFIP
            staff, international press, and comparative-law scholars
            is the manual next step. <A href="/share">/share</A> has
            templates ready.
          </Li>
          <Li>
            <strong>IETF / W3C submission.</strong> The RFCs are
            published under CC-BY-4.0 with GitHub Discussions as the
            governance surface. Submitting them as IETF Internet-Drafts
            or W3C Community Group notes is a future decision.
          </Li>
        </ul>

        <H2>Why all this</H2>
        <P>
          The bet is straightforward. The Argentine sociedad-IA regime
          will be drafted by people who are smart but not necessarily
          steeped in agent infrastructure. The cheapest way to get a
          good outcome is to do the technical groundwork in the open,
          first, under permissive licenses, with versioned +
          conformance-tested specs.
        </P>
        <P>
          Then the law has something concrete to cite. Then operators
          have something concrete to implement. Then regulators have
          something concrete to inspect. The work compounds.
        </P>
        <P>
          18 rounds is enough for one day. Tomorrow: outreach.
        </P>

        <footer
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.ar ·{" "}
          <Link href="/" style={linkSty}>/</Link>{" · "}
          <Link href="/notes" style={linkSty}>/notes</Link>{" · "}
          <Link href="/timeline" style={linkSty}>/timeline</Link>{" · "}
          <Link href="/registro" style={linkSty}>/registro</Link>
        </footer>
      </main>
    </>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 22,
        fontWeight: 500,
        color: "var(--text-strong)",
        marginTop: 36,
        marginBottom: 14,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 14 }}>{children}</p>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 8, lineHeight: 1.6 }}>{children}</li>;
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

const ulStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const ulInnerStyle: React.CSSProperties = {
  paddingLeft: 22,
  marginTop: 8,
  marginBottom: 4,
  fontSize: 14,
};
