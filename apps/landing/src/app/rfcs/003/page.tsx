import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";
import { RfcDisclaimer } from "../disclaimer";

export const metadata: Metadata = {
  title: "RFC-003: Cross-jurisdictional audit-log reciprocity",
  description:
    "Proposed convention for AR sociedades-IA to import + verify audit logs from foreign agent-entity regimes (Wyoming DAO LLC, Marshall Islands MIDAO, Estonia OÜ) so cross-jurisdictional commerce produces a single chain of forensic evidence. Draft.",
  alternates: { canonical: "https://ar-agents.ar/rfcs/003" },
};

export default function Rfc003Page() {
  return (
    <DocShell
      eyebrow="rfc-003 · draft · 2026-05"
      title="RFC-003: Cross-jurisdictional audit-log reciprocity."
      subtitle="When an AR sociedad-IA transacts with a Wyoming DAO LLC, MIDAO foundation, or Estonia OÜ, both sides keep their own audit logs. Today, reconciling those logs requires manual contractual coordination. RFC-003 proposes a portable interchange format so the logs can verify each other automatically."
    >
      <DocBlock>
        <DocP>
          <strong>Status:</strong> Draft.{" "}
          <strong>Author:</strong> Nazareno Clemente (
          <a href="mailto:naza@naza.ar" style={{ color: "var(--accent)" }}>
            naza@naza.ar
          </a>
          ). <strong>Discussion:</strong>{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/discussions"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents/discussions
          </a>
          . <strong>License:</strong> CC-BY-4.0.{" "}
          <strong>DOI:</strong>{" "}
          <a
            href="https://doi.org/10.5281/zenodo.20159411"
            style={{ color: "var(--accent)" }}
          >
            10.5281/zenodo.20159411
          </a>
          .
        </DocP>
        <DocP>
          <strong>Companions:</strong>{" "}
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001
          </a>{" "}
          (three-layer liability + § 9 audit log spec),{" "}
          <a href="/rfcs/002" style={{ color: "var(--accent)" }}>
            RFC-002
          </a>{" "}
          (agent-discovery-by-default convention).
        </DocP>
      </DocBlock>

      <RfcDisclaimer />

      <DocH2>1 · The cross-jurisdictional drift problem</DocH2>
      <DocP>
        Recipe 21 in the cookbook is concrete: a USA-incorporated agent
        (Wyoming DAO LLC) signs an AP2 mandate, an AR sociedad-IA
        verifies it, emits the factura, lands the cobro. Each side keeps
        its own audit log:
      </DocP>
      <ul style={listStyle}>
        <Li>
          The USA-LLC&apos;s log knows: I issued a mandate at T0 for
          $X to AR-CUIT-Y, payable for T0+24h.
        </Li>
        <Li>
          The AR sociedad&apos;s log knows: I received mandate M, verified
          its signature, ran 8 gates, emitted CAE 123456 for $X.
        </Li>
      </ul>
      <DocP>
        Both logs are HMAC-signed. Each is verifiable independently. But
        the cross-jurisdictional <em>contract</em>, &quot;the USA-LLC
        promised X, the AR sociedad delivered X, the chain matches&quot;,
        only holds if both sides import each other&apos;s evidence + the
        interchange format is portable.
      </DocP>
      <DocP>
        Today, each pair of jurisdictions invents this format ad-hoc.
        Lawyers + auditors agree on a spreadsheet template. The
        spreadsheet becomes the single point of trust. When the spreadsheet
        is wrong, every dispute downstream is messy.
      </DocP>

      <DocH2>2 · Proposal</DocH2>
      <DocP>
        Every agent-entity regime publishing audit logs SHOULD support a{" "}
        <strong>portable interchange envelope</strong> with these
        fields:
      </DocP>
      <CodeBlock>{`{
  "$schema": "https://ar-agents.ar/schemas/cross-jurisdiction-audit.v1.json",
  "issuer": {
    "jurisdiction": "AR" | "US-WY" | "MH" | "EE" | "US-DE" | ...,
    "entityId": "ar-sociedad:30123456789" | "wyoming-dao-llc:claw-bank" | ...,
    "publicKey": { /* JWK */ },
    "evidenceCustodyUrl": "https://operator.example/api/audit/{sessionId}?verify=1"
  },
  "sessionId": "uuid-or-token",
  "entries": [
    {
      "id": "...",
      "ts": "ISO-8601 UTC",
      "tool": "...",
      "governance": "...",
      "input": ...,
      "output": ...,
      "hmac": "sha256:..."   // signed by issuer
    }
  ],
  "externalReferences": [
    {
      "counterpartEntityId": "wyoming-dao-llc:claw-bank",
      "counterpartSessionId": "...",
      "counterpartEvidenceUrl": "https://claw-bank.example/audit/...?verify=1",
      "linkType": "ap2-mandate" | "acp-checkout" | "manual",
      "linkId": "claw-bank:tx_42"
    }
  ],
  "issuedAt": "ISO-8601 UTC",
  "expiresAt": "ISO-8601 UTC"   // 30d default; counterpart should re-fetch before this
}`}</CodeBlock>
      <DocP>
        Three guarantees per envelope:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Self-verifiable</strong>. Each entry is signed by the
          issuer. The counterpart fetches the envelope, recomputes the
          HMACs against the issuer&apos;s public key, and confirms the
          log is clean before relying on it.
        </Li>
        <Li>
          <strong>Cross-linked</strong>. The{" "}
          <DocCode>externalReferences</DocCode> array points back at the
          counterpart&apos;s evidence URL with the link type that joins
          them (e.g., AP2 mandate, ACP checkout session, manual
          spreadsheet row). Either side can walk the graph.
        </Li>
        <Li>
          <strong>Time-bounded</strong>.{" "}
          <DocCode>expiresAt</DocCode> tells the counterpart how long the
          envelope is meant to be authoritative. After expiry, fetch a
          fresh copy. Prevents stale evidence claims.
        </Li>
      </ul>

      <DocH2>3 · How AR sociedad-IA would emit this</DocH2>
      <DocP>
        New endpoint:{" "}
        <DocCode>GET /api/play/audit/{`{sessionId}`}.crossjur</DocCode>{" "}
        returns the envelope above, wrapping the existing audit entries.
        The HMAC layer is the same; we just add the issuer metadata + any
        recorded cross-links.
      </DocP>
      <DocP>
        Cross-links are populated when the AR side calls a recipe-21-style
        flow:
      </DocP>
      <CodeBlock>{`// At verify-and-act time, the AR side records the cross-link:
await appendAudit(sessionId, {
  tool: "cross_jurisdictional_factura_emit",
  governance: "audit-logged",
  input: {
    mandate: { issuer, claims },
    counterpartEntityId: mandate.issuer,
    counterpartSessionId: mandate.claims.counterpartSessionId,
    counterpartEvidenceUrl: mandate.claims.counterpartEvidenceUrl,
    linkType: "ap2-mandate",
    linkId: mandate.claims.externalId,
  },
  output: { facturaCae: result.cae, ... },
});`}</CodeBlock>
      <DocP>
        The cross-jurisdictional envelope endpoint reads those records,
        extracts the <DocCode>externalReferences</DocCode> array, and
        wraps everything in the portable shape.
      </DocP>

      <DocH2>4 · How Wyoming / MIDAO / Estonia would emit this</DocH2>
      <DocP>
        Each foreign regime would implement the same{" "}
        <DocCode>.crossjur</DocCode> endpoint on their audit-log surface.
        The minimum spec:
      </DocP>
      <ul style={listStyle}>
        <Li>
          Each entry in <DocCode>entries[]</DocCode> includes an HMAC or
          equivalent signature against the issuer&apos;s public key (JWK
          in <DocCode>issuer.publicKey</DocCode>).
        </Li>
        <Li>
          Cross-links to AR-side evidence go into{" "}
          <DocCode>externalReferences[]</DocCode> with{" "}
          <DocCode>counterpartEvidenceUrl</DocCode> pointing back at the
          AR sociedad&apos;s public audit endpoint.
        </Li>
        <Li>
          <DocCode>expiresAt</DocCode> at least 30 days out; refresh
          before expiry.
        </Li>
      </ul>
      <DocP>
        We don&apos;t need to dictate <em>their</em> audit-log
        implementation. RFC-003 only specifies the interchange envelope.
        Wyoming DAO LLC operators using a different signing scheme (e.g.,
        an on-chain commitment) can wrap their evidence in the envelope
        as long as the signature is verifiable against the issuer&apos;s
        published key.
      </DocP>

      <DocH2>5 · How reconciliation works in practice</DocH2>
      <ol style={listStyle}>
        <Li>
          Auditor (or automated compliance script) fetches AR side&apos;s
          envelope at{" "}
          <DocCode>https://ar-agents.ar/api/play/audit/{`{sid}`}.crossjur</DocCode>.
        </Li>
        <Li>
          Verifies each entry&apos;s HMAC against the AR side&apos;s
          published key.
        </Li>
        <Li>
          For each <DocCode>externalReference</DocCode>, fetches the
          counterpart&apos;s envelope.
        </Li>
        <Li>
          Verifies the counterpart&apos;s entries against the
          counterpart&apos;s key.
        </Li>
        <Li>
          Cross-references: the AR side&apos;s factura-emit entry should
          point to the Wyoming side&apos;s mandate-issue entry, both
          referencing the same <DocCode>linkId</DocCode>.
        </Li>
        <Li>
          A discrepancy (e.g., Wyoming says &quot;mandate issued for $X&quot;,
          AR says &quot;factura emitted for $Y&quot;) is mechanically
          detectable + adjudicable.
        </Li>
      </ol>

      <DocH2>6 · Why this matters now</DocH2>
      <DocP>
        Three trends compounding:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>AR sociedad-IA</strong> ship 2027. The headline use
          case for the regime is cross-jurisdictional agent commerce
          (RFC-001 § 7).
        </Li>
        <Li>
          <strong>MIDAO is operational</strong> in Marshall Islands.
          Wyoming DAO LLCs exist. Estonia e-Residency is a decade old.
          The set of foreign agent entities the AR side can transact
          with is non-empty today.
        </Li>
        <Li>
          <strong>Spreadsheet-based reconciliation doesn&apos;t scale</strong>{" "}
          past ~50 cross-jurisdictional transactions per month. A
          marketplace with multiple foreign sellers + automated AR
          incorporation per recipe 20 hits that ceiling fast.
        </Li>
      </ul>

      <DocH2>7 · What we&apos;d need from foreign jurisdictions</DocH2>
      <ul style={listStyle}>
        <Li>
          A <strong>public audit-log endpoint</strong> that returns
          HMAC-signed (or equivalent) entries.
        </Li>
        <Li>
          A <strong>published public key</strong> (JWK or X.509) for
          each issuer entity, with rotation procedure documented.
        </Li>
        <Li>
          Willingness to implement the{" "}
          <DocCode>.crossjur</DocCode> envelope. Backwards-compatible
          add, they can keep their existing audit format.
        </Li>
      </ul>
      <DocP>
        Wyoming DAO LLC operators using on-chain attestations (e.g.,
        Ethereum/Polygon) can satisfy the spec with{" "}
        <DocCode>publicKey: { "{" } &quot;kty&quot;: &quot;eth-attestation&quot;, &quot;address&quot;: &quot;0x...&quot; { "}" }</DocCode>{" "}
        plus an EAS-style attestation per entry. The interchange envelope
        accepts any signature scheme that&apos;s independently verifiable.
      </DocP>

      <DocH2>8 · Implementation plan for the AR side</DocH2>
      <ol style={listStyle}>
        <Li>
          Define <DocCode>schemas/cross-jurisdiction-audit.v1.json</DocCode>{" "}
          (JSON Schema, draft 2020-12).
        </Li>
        <Li>
          Ship <DocCode>GET /api/play/audit/{`{sessionId}`}.crossjur</DocCode>{" "}
          on ar-agents.ar. Reuses existing primitives in{" "}
          <DocCode>src/lib/audit.ts</DocCode>; adds envelope wrapping +
          external-reference extraction.
        </Li>
        <Li>
          Update recipe 21 to populate{" "}
          <DocCode>externalReferences</DocCode> on every cross-jurisdictional
          tool call.
        </Li>
        <Li>
          Add a verifier library (<DocCode>@ar-agents/crossjur-verify</DocCode>)
          that takes an envelope + the counterpart&apos;s envelope and
          returns a reconciliation report.
        </Li>
        <Li>
          Add a cookbook recipe (recipe 25) showing the auditor flow
          end-to-end with sample envelopes from both sides.
        </Li>
      </ol>

      <DocH2>9 · Security</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>Signature scheme is per-issuer</strong>. RFC-003
          doesn&apos;t mandate HMAC-SHA256; it requires that the
          signature be verifiable against the published key. ES256/JWS
          (per AP2), HMAC-SHA256 (per RFC-001 § 9.2), Ethereum EAS,
          on-chain commitments, all acceptable.
        </Li>
        <Li>
          <strong>Replay defense</strong>. The envelope includes{" "}
          <DocCode>issuedAt</DocCode> + <DocCode>expiresAt</DocCode>.
          Consumers should reject envelopes whose{" "}
          <DocCode>issuedAt</DocCode> is in the future or whose{" "}
          <DocCode>expiresAt</DocCode> is in the past.
        </Li>
        <Li>
          <strong>Privacy</strong>. The envelope is{" "}
          <em>public-readable</em>. Operators must not log PII / secrets
          / customer-specific identifiers in the underlying entry input
          / output. Same discipline as RFC-001 § 9 (no PII in the audit
          log).
        </Li>
        <Li>
          <strong>Key rotation</strong>. The envelope&apos;s{" "}
          <DocCode>issuer.publicKey</DocCode> is current-valid; prior
          envelopes signed with a previous key remain verifiable as
          long as the issuer publishes their key history (recommended
          path: <DocCode>/.well-known/keys.json</DocCode> with{" "}
          <DocCode>kid</DocCode> + <DocCode>validFrom</DocCode> +{" "}
          <DocCode>validUntil</DocCode>).
        </Li>
      </ul>

      <DocH2>10 · Why not just use the existing format from one jurisdiction</DocH2>
      <DocP>
        Two reasons:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Sovereignty</strong>. No jurisdiction wants to import a
          format defined by another. RFC-003 is deliberately
          jurisdiction-neutral so each regime can adopt without ceding
          format authority.
        </Li>
        <Li>
          <strong>Signature scheme heterogeneity</strong>. The AR side
          uses HMAC-SHA256. Wyoming DAO LLCs use on-chain commitments.
          Estonia OÜ uses ID-card + X-Road signing. The envelope is the
          common surface; the inner signatures stay native.
        </Li>
      </ul>

      <DocH2>11 · Adoption path</DocH2>
      <DocP>
        Step 1: ship the AR-side endpoint. Step 2: write a reference
        verifier library + cookbook recipe. Step 3: propose to MIDAO /
        a Wyoming DAO LLC platform to implement the counterpart endpoint.
        First cross-jurisdictional reconciliation between two real
        entities is the proof point.
      </DocP>
      <DocP>
        If you operate an agent-entity in any of these regimes and want
        to coordinate, drop a comment in the{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={{ color: "var(--accent)" }}
        >
          discussions
        </a>
        .
      </DocP>

      <DocH2>12 · References</DocH2>
      <ul style={listStyle}>
        <Li>
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001 § 9
          </a>:{" "}
        AR-side audit log spec.
        </Li>
        <Li>
          <a href="/rfcs/002" style={{ color: "var(--accent)" }}>
            RFC-002
          </a>:{" "}
        agent-discovery-by-default (cross-jurisdictional verifier
          libraries would consume RFC-002 wells to find counterpart
          endpoints).
        </Li>
        <Li>
          <a href="/examples#21" style={{ color: "var(--accent)" }}>
            Cookbook R21
          </a>:{" "}
        the AP2 mandate verification flow this RFC builds on.
        </Li>
        <Li>
          <a href="/vs" style={{ color: "var(--accent)" }}>
            /comparison
          </a>:{" "}
        Wyoming / MIDAO / Estonia / Delaware regime context.
        </Li>
        <Li>
          <a
            href="https://datatracker.ietf.org/doc/html/rfc7519"
            style={{ color: "var(--accent)" }}
          >
            RFC 7519
          </a>:{" "}
        JWT, the format model for the envelope claims.
        </Li>
        <Li>
          <a
            href="https://attest.org/"
            style={{ color: "var(--accent)" }}
          >
            Ethereum Attestation Service
          </a>:{" "}
        alternative on-chain signature scheme the envelope can wrap.
        </Li>
      </ul>

      <RfcJsonLd
        id="003"
        title="RFC-003: Cross-jurisdictional audit-log reciprocity"
        abstract="Proposed convention for AR sociedades-IA to import + verify audit logs from foreign agent-entity regimes (Wyoming DAO LLC, Marshall Islands MIDAO, Estonia OÜ) so cross-jurisdictional commerce produces a single chain of forensic evidence. Defines a portable JSON envelope with issuer metadata + signed entries + cross-references + expiry."
        datePublished="2026-05-11"
      />
    </DocShell>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "var(--bg-tint)",
        padding: 16,
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        color: "var(--text-body)",
        overflow: "auto",
        boxShadow: "var(--card-shadow)",
        marginBottom: 16,
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 6, lineHeight: 1.55, color: "var(--text-body)" }}>
      {children}
    </li>
  );
}

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  marginBottom: 16,
};
