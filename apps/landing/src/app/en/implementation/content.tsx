import { DocH2, DocP, DocShell } from "../../doc-shell";

/**
 * English version of /implementacion. Standalone file for now; a future
 * refactor can fold this into a shared bilingual content (see /al-ministro
 * pattern). The iframe loads the English PDF (regenerated from a
 * separately-maintained English markdown source), signed with the same
 * Ed25519 keypair as the Spanish PDF so a single verifier flow works for
 * both. No em-dashes anywhere in user-facing prose, per project style.
 */

const PDF_URL = "/en/implementation.pdf";

export function ImplementationEnContent() {
  return (
    <DocShell
      eyebrow="technical document · May 2026"
      title="Reference implementation for AI corporations."
      subtitle="Technical architecture, operable code, and suggested clauses for the proposed reform of Argentina's General Corporations Law. Aimed at the team drafting the bill and at the Ministry's technical staff."
    >
      <DocP>
        On April 28, 2026, at Expo EFI, Argentina&apos;s Ministry of
        Deregulation and State Transformation announced the creation of
        a regime for AI corporations through a reform of the General
        Corporations Law (Law 19,550). This document is an open and
        verifiable reference implementation of the technical
        infrastructure that the regime requires to be operable.
      </DocP>

      <DocP>
        It is addressed to the team drafting the bill and to the
        Ministry&apos;s technical staff. The code is open-source
        (MIT-licensed), published at{" "}
        <a
          href="https://github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents
        </a>
        , and available for any regulatory framework the Ministry
        defines to adopt as a reference.
      </DocP>

      <div
        style={{
          margin: "32px 0 40px",
          padding: "20px 24px",
          background: "var(--bg-subtle, rgba(0,0,0,0.03))",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
          Canonical version
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--text-body)",
            lineHeight: 1.55,
          }}
        >
          The canonical PDF contains the complete version with the
          decisions table, five suggested operable clauses, and the
          section responding to the public legal objections raised in
          the debate. It is the citable version, intended for internal
          circulation in the Ministry&apos;s technical area.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={PDF_URL}
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 16px",
              background: "var(--text)",
              color: "var(--bg)",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Download PDF
          </a>
          <a
            href={PDF_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 16px",
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--text)",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open in a new tab
          </a>
        </div>
      </div>

      <DocH2>Contents</DocH2>
      <DocP>
        The document covers six sections plus two annexes:
      </DocP>
      <ol style={{ lineHeight: 1.75, paddingLeft: 22 }}>
        <li>
          <strong>The six technical decisions</strong> the bill needs
          to resolve, with a suggested technical answer for each and a
          reference to the corresponding clause.
        </li>
        <li>
          <strong>Reference architecture</strong> on four pillars built
          from preexisting open technical standards: signed
          cryptographic identity (Ed25519, IETF RFC 8032), chained
          auditable ledger (HMAC-SHA256 + anchor chain), operable
          fiscal personhood (CUIT, WSFE electronic invoicing, Mercado
          Pago), autonomous operation interface (Model Context
          Protocol).
        </li>
        <li>
          <strong>Current state of the implementation</strong>: what
          exists verifiably (MIT code, 33 packages on npm, reference
          verifier, production deployments with real CAE issuance) and
          what does not yet exist.
        </li>
        <li>
          <strong>Five suggested operable clauses</strong> for the bill
          text, each with technical justification: definition and
          capacity, mandatory cryptographic identity, chained
          auditable ledger, standardized operation interface,
          designated-operator liability. Plus additional suggested
          clauses (dissolution and succession, tax regime, foreign
          exchange regime).
        </li>
        <li>
          <strong>Technical questions raised in the public debate</strong>{" "}
          and how the architecture addresses them. Includes pointed
          responses to the doctrinal positions of Betania Allo (MDZ)
          and Claudia Guardia (Infobae).
        </li>
        <li>
          <strong>Availability and verification.</strong> License,
          contact, and cryptographic verification of the document
          itself (Ed25519, RFC 8032) reproducible offline.
        </li>
      </ol>
      <DocP>
        <strong>Annex I. Compared jurisdictional frameworks:</strong>{" "}
        Wyoming DAO LLC, Marshall Islands DAO Act, Estonia e-Residency,
        Singapore VCC, Switzerland (civil association + Stiftung),
        Liechtenstein TVTG. Places the Argentine proposal on the
        international map.
      </DocP>
      <DocP>
        <strong>Annex II. Bibliographic references:</strong>{" "}
        cryptographic standards (IETF RFC 8032, 2104, 3161, 6962; NIST
        FIPS 198-1, 186-5), open protocols (MCP), Argentine technical
        specs (WSAA, WSFE), Argentine regulatory framework (Law
        19,550; Law 25,506) and comparative (Wyoming, Marshall, eIDAS,
        Liechtenstein TVTG).
      </DocP>

      <DocH2>Executive summary of the proposed framework</DocH2>
      <DocP>
        An AI corporation is a private-law legal person with full
        capacity for the acts within its corporate purpose, identified
        by an Ed25519 cryptographic key pair, with a chained immutable
        record of its acts anchored daily to a public time-stamping
        service, operable through a standardized programmatic interface
        (MCP or equivalent enabled by the Authority of Application),
        with full fiscal personhood on standard Argentine tax
        infrastructure (CUIT tax ID, CAE-stamped electronic invoicing,
        Mercado Pago, IVA / IIBB / Income Tax / monotributo obligations
        as applicable).
      </DocP>
      <DocP>
        The designated operator is liable with the corporate estate,
        and jointly and severally with personal assets in enumerated
        cases (willful undercapitalization, fraud, breach of essential
        technical duties). The regime does not require Argentine
        residency of the operator and allows verifiable remote
        incorporation.
      </DocP>

      <DocH2>Integrity verification</DocH2>
      <DocP>
        The PDF is signed with Ed25519 (RFC 8032) by the same authorship
        that drafts it. The document is not distributed as an assertion
        of authorship, it is distributed with cryptographic proof of
        it, verifiable offline without trusting this site. It is the
        same standard the architecture proposes for AI corporations,
        applied to the very document that proposes it.
      </DocP>
      <div
        style={{
          margin: "20px 0 32px",
          padding: "20px 24px",
          background: "var(--bg-subtle, rgba(0,0,0,0.03))",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily:
            "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            marginBottom: 10,
            fontFamily:
              "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Offline verification (Node 20+, zero dependencies):
        </div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`curl -fsSL https://ar-agents.ar/en/implementation.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/en/implementation.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf`}</pre>
      </div>
      <DocP>
        The verifier is clean-room, zero-dependency, Node built-ins
        only (
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          source on GitHub
        </a>
        ). The public key lives at{" "}
        <a
          href="/.well-known/ar-agents/doc-signing-keys.json"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          /.well-known/ar-agents/doc-signing-keys.json
        </a>
        ; the detached manifest at{" "}
        <a
          href="/en/implementation.pdf.sig.json"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          /en/implementation.pdf.sig.json
        </a>
        . Any alteration of the PDF (even a single byte changed) fails
        the three integrity checks: size, SHA-256, and Ed25519 signature.
      </DocP>

      <DocH2>Citation and reuse</DocH2>
      <DocP>
        The document, the RFC-001 specification, and the code of the
        reference implementation are MIT-licensed. Their use,
        modification, integration, or adoption as a formal reference
        in any future regulatory framework is free and requires no
        authorization from the author. This neutrality is deliberate:
        the goal is for the regime to be able to rest on open,
        citable technical infrastructure, free of capture by any
        commercial actor.
      </DocP>

      <DocH2>Full document</DocH2>
      <DocP>
        Inline below; downloadable above.
      </DocP>
      <div
        style={{
          margin: "20px 0 40px",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border, rgba(0,0,0,0.1))",
          background: "var(--bg)",
        }}
      >
        {/* PDF Open Parameters: pagemode=none collapses the sidebar
            (thumbnails/bookmarks), zoom=80 sets initial zoom. Honored by
            Chrome, Edge and Firefox's PDF.js. Safari's PDFKit ignores
            them but the fallback (sidebar-open / 100%) is still readable. */}
        <iframe
          src={`${PDF_URL}#pagemode=none&zoom=80`}
          title="Reference implementation for AI corporations (PDF)"
          style={{
            width: "100%",
            height: "min(80vh, 900px)",
            border: 0,
            display: "block",
          }}
        />
      </div>

      <DocH2>Contact</DocH2>
      <DocP>
        For technical inquiries or additional documentation beyond the
        scope of this document: naza@naza.ar
      </DocP>
    </DocShell>
  );
}
