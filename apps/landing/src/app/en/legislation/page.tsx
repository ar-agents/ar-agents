import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../json-ld";

/**
 * /en/legislation — English-language mirror of /legislacion.
 *
 * Target audience: international press, comparative-law scholars,
 * regulators in OTHER jurisdictions (Wyoming, Marshall Islands, Estonia,
 * Delaware, UAE) considering analogous regimes, OECD/UNCITRAL/IEEE
 * working groups on AI agent governance.
 *
 * The Spanish version targets the actual legislator drafting the AR
 * bill. The English version is a public reference: "this is what
 * Argentina is doing, here's the technical scaffolding any other
 * jurisdiction can adopt."
 */

export const metadata: Metadata = {
  title: "/en/legislation · technical synthesis for AI-corporation regimes · ar-agents",
  description:
    "English-language synthesis of the four RFCs (liability, discovery, reciprocity, operational log) backing Argentina's proposed sociedad-IA regime. Suggested cite-by-reference legislative text. For international press + comparative-law scholars + regulators in adjacent jurisdictions.",
  alternates: {
    canonical: "https://ar-agents.vercel.app/en/legislation",
    languages: {
      en: "/en/legislation",
      es: "/legislacion",
    },
  },
  openGraph: {
    title: "/en/legislation · technical synthesis for AI-corporation regimes",
    description:
      "English-language synthesis of the four RFCs backing Argentina's proposed sociedad-IA regime.",
    url: "https://ar-agents.vercel.app/en/legislation",
    type: "article",
    locale: "en_US",
    alternateLocale: "es_AR",
  },
};

export default function EnLegislationPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "Technical synthesis for AI-corporation regimes — Argentina's sociedad-IA",
          inLanguage: "en-US",
          url: "https://ar-agents.vercel.app/en/legislation",
          datePublished: "2026-05-11",
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@helloastro.co",
          },
          audience: {
            "@type": "Audience",
            audienceType:
              "Legislators, comparative-law scholars, international press, regulators",
          },
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
            /arg · /en/legislation · english · synthesis · 2026-05-11
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
            Technical synthesis for AI-corporation regimes.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55 }}>
            Argentina announced a sociedad-IA regime on 28 April 2026.
            This page synthesizes four open-source technical documents
            (RFC-001 through RFC-004) published as <em>infrastructure</em>
            the legislation can adopt by reference instead of rewriting
            from scratch. Each section maps an RFC to a suggested
            legislative paragraph + flags what the RFCs do NOT solve.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            Reading time: 10 minutes · No marketing · Suggested text in
            highlighted boxes · All infrastructure referenced is MIT +
            CC-BY-4.0 open-source · For the Spanish-language companion
            aimed at the actual AR legislator, see{" "}
            <A href="/legislacion">/legislacion</A>.
          </p>
        </header>

        <Section title="1 · The problem in one sentence">
          <P>
            An AI agent acts autonomously. It buys, sells, signs, pays
            taxes. The legal question is: <strong>whose civil liability
            is it when something goes wrong?</strong> The current answer
            is ambiguous and discourages investment. The sociedad-IA
            regime proposes a specific framework; this document suggests
            how to technically anchor each piece so liability is{" "}
            <em>operationalizable</em> — i.e. a judge + forensic expert
            can reconstruct what happened.
          </P>
        </Section>

        <Section title="2 · Civil liability — RFC-001">
          <P>
            <strong>Concept.</strong> Three layers of civil liability
            (Layer 1: human operator · Layer 2: sociedad-IA · Layer 3:
            model provider) by the governance class assigned to each
            action.
          </P>
          <P>
            <strong>Technical anchor.</strong> Every action is tagged
            with one of four values: <Code>algorithm-only</Code>,{" "}
            <Code>audit-logged</Code>, <Code>mocked-upstream</Code>,{" "}
            <Code>requires-confirmation</Code>. The tag determines layer:
            <Code>algorithm-only</Code> ⇒ operator. <Code>audit-logged</Code>{" "}
            ⇒ operator + recorded model provider.{" "}
            <Code>requires-confirmation</Code> ⇒ the human who confirmed
            absorbs.
          </P>
          <LegislativeBox>
            <strong>Suggested text</strong> (Art. X):
            <br />
            <em>
              &quot;The civil liability of AI corporations shall be
              determined as a function of the operational category
              assigned to each action per the technical standard
              published as RFC-001 v1 (
              <A href="https://ar-agents.vercel.app/rfcs/001">
                ar-agents.vercel.app/rfcs/001
              </A>
              ) and its companion specification RFC-004 § 6 (
              <A href="https://ar-agents.vercel.app/rfcs/004">
                ar-agents.vercel.app/rfcs/004
              </A>
              ).&quot;
            </em>
          </LegislativeBox>
          <P>
            <strong>Why cite-by-reference.</strong> When the state of
            the art evolves (new HITL sub-categories, e.g.), the
            standard updates without reopening the statute. The law
            freezes the cite. Operators opt into the version at
            incorporation + remain free to migrate.
          </P>
        </Section>

        <Section title="3 · Discovery — RFC-002">
          <P>
            <strong>Concept.</strong> For a regulator to inspect an AI
            corporation without asking permission, the regulator must be
            able to find its public endpoints in a standard location.
          </P>
          <P>
            <strong>Technical anchor.</strong> Convention{" "}
            <Code>/.well-known/agents.json</Code> (analogous to{" "}
            <Code>/.well-known/security.txt</Code>, RFC 9116). Every
            conformant agent publishes its capabilities + jurisdiction +
            audit endpoints there.
          </P>
          <LegislativeBox>
            <strong>Suggested text</strong> (Art. X+1):
            <br />
            <em>
              &quot;Every AI corporation shall publish at{" "}
              <Code>/.well-known/agents.json</Code> under the domain
              recorded in its incorporation deed the minimum information
              specified by RFC-002 v1: jurisdiction, corporate type,
              operator ID, audit endpoints, RFC conformance. Failure or
              omission shall enable the regulator to initiate the
              sanctioning procedure of Art. XX.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="4 · Cross-jurisdictional reciprocity — RFC-003">
          <P>
            <strong>Concept.</strong> An Argentine AI corporation may
            transact with an agent-entity from another jurisdiction
            (Wyoming DAO LLC, Marshall Islands MIDAO, Estonia OÜ). Each
            side keeps its own log. Without a portable format,
            reconciliation requires ad-hoc contractual coordination.
          </P>
          <P>
            <strong>Technical anchor.</strong> Portable JSON envelope{" "}
            <Code>cross-jurisdiction-audit.v1.json</Code>: issuer
            metadata, signed entries, external references to the
            counterpart. Expires after 30 days (counterpart re-fetches
            before).
          </P>
          <LegislativeBox>
            <strong>Suggested text</strong> (Art. X+2):
            <br />
            <em>
              &quot;Where an Argentine AI corporation transacts with a
              foreign agent-entity, the reciprocal documentation of the
              transactions shall conform to the normative envelope
              RFC-003 v1. The cryptographic signatures defined therein
              shall have evidentiary value equivalent to a private
              instrument bearing autograph signature for the
              transactions they document.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="5 · Operational log — RFC-004">
          <P>
            <strong>Concept.</strong> The append-only HMAC-SHA256-signed
            record every AI corporation must keep.{" "}
            <strong>This is the key document for enforcement.</strong>{" "}
            Without it, a regulator cannot reconstruct what an AI
            corporation did.
          </P>
          <P>
            <strong>Technical anchor.</strong> RFC-004 normatively pins
            down: the exact shape of each entry, the canonical-JSON
            algorithm, the HMAC computation, what append-only means in
            code, what a regulator can demand without a court order,
            minimum retention (180 days) and maximum (5 years),
            conformance vectors with deterministic hex values (
            <A href="https://ar-agents.vercel.app/test-vectors">
              /test-vectors
            </A>
            ).
          </P>
          <LegislativeBox>
            <strong>Suggested text</strong> (Art. X+3):
            <br />
            <em>
              &quot;Every AI corporation shall keep an operational
              record conforming to the normative specification RFC-004
              v1, signing each entry with HMAC-SHA256 at the moment of
              creation. The record shall be retained for a minimum of
              180 days, extending to 5 years for entries of fiscal or
              contractual relevance. Its availability under the JSON +
              CSV formats specified in RFC-004 § 5 shall constitute an
              administrative obligation whose breach shall cause the
              operator to lose the liability limitation foreseen in
              Art. X.&quot;
            </em>
          </LegislativeBox>
          <P>
            <strong>Evidentiary clause.</strong> The RFC-004 log is{" "}
            <em>per se</em> admissible evidence in administrative +
            judicial proceedings per CPCCN Art. 286–287 (electronic
            signature with key). Cite-by-reference grants probative
            value without regulating cryptography in the statute.
          </P>
        </Section>

        <Section title="6 · Auto-incorporation + template">
          <P>
            <strong>Concept.</strong> The human operator wishing to
            incorporate an AI corporation should not have to wire 17
            pieces of software. They should fill 4 fields (name,
            capital, purpose, representative) in a wizard and get a
            functioning sociedad-IA with all law-required endpoints.
          </P>
          <P>
            <strong>Technical anchor.</strong>{" "}
            <Code>@ar-agents/incorporate</Code> npm package + the Vercel{" "}
            <Code>sociedad-ia-starter</Code> template generate the code
            + config. Public wizard at{" "}
            <A href="/incorporar">/incorporar</A>.
          </P>
          <LegislativeBox>
            <strong>Suggested text</strong> (Art. X+4, transitional):
            <br />
            <em>
              &quot;To facilitate compliance, the implementing agency
              shall recognize as technical-conformance proof the
              verifiable deployment of an AI corporation generated by
              the public template <Code>sociedad-ia-starter</Code>,
              without prejudice to the operator&apos;s right to develop
              its own infrastructure consistent with the applicable
              RFCs.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="7 · Why cite-by-reference, not rewrite">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Speed.</strong> The RFCs already exist, are
              published, are publicly debated. The law does not need to
              restart the technical debate from zero.
            </li>
            <li style={liStyle}>
              <strong>Versionability.</strong> Technical state of the
              art evolves faster than law. Cite-by-reference lets the
              RFC update (with a public changelog) without reopening the
              statute. The law freezes v1; operators opt into v2 when
              they choose.
            </li>
            <li style={liStyle}>
              <strong>Interoperability.</strong> If Wyoming, Estonia, or
              Marshall Islands publish analogous RFCs (RFC-003 already
              anticipates reciprocity), regimes can coordinate at the
              technical level without treaties.
            </li>
            <li style={liStyle}>
              <strong>Public auditability.</strong> Any citizen can open
              the repo and read the code the law referenced.
              Transparency is structural, not declarative.
            </li>
          </ul>
        </Section>

        <Section title="8 · What the RFCs do NOT solve (yet)">
          <P>
            Mandatory honesty. The RFCs cover technical infrastructure
            + evidence format. They do <em>not</em> resolve:
          </P>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Tax aspects.</strong> Does the AI corporation pay
              monotributo, VAT, income tax, minimum presumed income?
              Each requires its own political decision.
            </li>
            <li style={liStyle}>
              <strong>Employment.</strong> Can an AI corporation be an
              employer? Is it jointly liable for humans executing its
              instructions?
            </li>
            <li style={liStyle}>
              <strong>Bankruptcy.</strong> How an AI corporation is
              wound up. What happens to cryptographic keys in
              bankruptcy.
            </li>
            <li style={liStyle}>
              <strong>Criminal.</strong> Mens rea of an entity without
              consciousness. Operator imputability for the agent&apos;s
              dolo or culpa.
            </li>
          </ul>
          <P>
            The RFCs are infrastructure pieces, not legal doctrine.
            They need complementing with Argentine positive law.
          </P>
        </Section>

        <Section title="9 · Three-line executive summary">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Line 1.</strong> Four RFCs published, open,
              versioned, with automated tests proving conformance.
              Ready to cite.
            </li>
            <li style={liStyle}>
              <strong>Line 2.</strong> Cite-by-reference: the law
              freezes v1; the RFCs evolve in their own public
              governance; operators select version at incorporation.
            </li>
            <li style={liStyle}>
              <strong>Line 3.</strong> All infrastructure is MIT +
              CC-BY-4.0. No operator paid anything to implement; no
              operator can be excluded for commercial reasons.
            </li>
          </ul>
        </Section>

        <Section title="10 · For non-Argentine readers">
          <P>
            If you are a regulator, scholar, or policymaker in another
            jurisdiction watching this experiment: every RFC and every
            schema is a reference implementation you can adopt, fork,
            or critique. The work of cataloguing what a functioning AI
            corporation regime needs technically has now been done in
            open source. Argentina happens to be first; the
            infrastructure is jurisdiction-agnostic.
          </P>
          <P>
            Specific reuses to consider:
          </P>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Wyoming DAO LLC + Marshall Islands MIDAO.</strong>{" "}
              RFC-003 envelope already anticipates reciprocity with
              these regimes. A coordinated implementation produces
              automatic cross-jurisdictional evidence reconciliation.
            </li>
            <li style={liStyle}>
              <strong>EU AI Act § 14 (human oversight).</strong> The
              RFC-001 governance classes operationalize what &quot;human
              oversight&quot; means as a tag-per-action — concrete enough
              for compliance audits.
            </li>
            <li style={liStyle}>
              <strong>UNCITRAL Working Group on AI.</strong> RFC-004 is
              a candidate technical baseline for any UNCITRAL model law
              on AI agent transactions.
            </li>
          </ul>
        </Section>

        <Section title="11 · Contact">
          <P>
            I am <strong>Nazareno Clemente</strong>, author of the RFCs
            and maintainer of the infrastructure. Available for
            technical meetings with regulators, ministries, comparative-
            law scholars, and any organization considering an AI
            corporation regime. No fees for this kind of consultation —
            the work is done, the code is public, the conversation is
            public.
          </P>
          <P>
            <A href="mailto:naza@helloastro.co">naza@helloastro.co</A> ·{" "}
            <A href="https://github.com/ar-agents/ar-agents/discussions">
              github.com/ar-agents/ar-agents/discussions
            </A>
          </P>
        </Section>

        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
          }}
        >
          <span>
            ar-agents.vercel.app · MIT + CC-BY-4.0 ·{" "}
            <Link href="/legislacion" style={linkStyle}>español</Link>
          </span>
          <span>
            <Link href="/" style={linkStyle}>/</Link>{" · "}
            <Link href="/auditor" style={linkStyle}>/auditor</Link>{" · "}
            <Link href="/certifier" style={linkStyle}>/certifier</Link>{" · "}
            <Link href="/rfcs/001" style={linkStyle}>RFC-001</Link>{" · "}
            <Link href="/rfcs/002" style={linkStyle}>RFC-002</Link>{" · "}
            <Link href="/rfcs/003" style={linkStyle}>RFC-003</Link>{" · "}
            <Link href="/rfcs/004" style={linkStyle}>RFC-004</Link>
          </span>
        </footer>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginBottom: 40,
        paddingBottom: 32,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <h2
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: "var(--text-strong)",
          marginBottom: 16,
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 12, lineHeight: 1.6 }}>{children}</p>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} style={linkStyle}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} style={linkStyle}>
      {children}
    </Link>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 13,
        padding: "1px 5px",
        background: "var(--bg-tint)",
        borderRadius: 4,
        color: "var(--text-strong)",
      }}
    >
      {children}
    </code>
  );
}

function LegislativeBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-tint)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 4,
        boxShadow: "var(--card-shadow)",
        margin: "16px 0",
        fontSize: 14,
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const ulStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 12,
};

const liStyle: React.CSSProperties = {
  marginBottom: 6,
  lineHeight: 1.55,
};
