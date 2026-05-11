import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";

export const metadata: Metadata = {
  title: "RFC-005: Asymmetric upgrade for the operational log",
  description:
    "Proposed v2 extension for RFC-004: replace shared-secret HMAC with Ed25519 asymmetric signatures + key-id rotation. Additive — entries carry both fields during migration, libraries verify whichever they can. Draft.",
  alternates: { canonical: "https://ar-agents.vercel.app/rfcs/005" },
};

export default function Rfc005Page() {
  return (
    <DocShell
      eyebrow="/arg · rfc-005 · draft · 2026-05"
      title="RFC-005: Asymmetric upgrade for the operational log."
      subtitle="RFC-004 v1 uses shared-secret HMAC. That works in a single-operator-single-key world. The day a sociedad-IA delegates verification to a third party (regulator, auditor, counterpart) without sharing its key, asymmetric signatures (Ed25519) become necessary. RFC-005 specifies the additive migration path."
    >
      <RfcJsonLd
        id="005"
        title="RFC-005: Asymmetric upgrade for the operational log"
        abstract="Specifies the additive migration from shared-secret HMAC (RFC-004 v1) to Ed25519 asymmetric signatures + key-id rotation. Entries carry both fields during the migration window; libraries verify whichever is available."
        datePublished="2026-05-11"
      />

      <DocBlock>
        <DocP>
          <strong>Status:</strong> Draft.{" "}
          <strong>Author:</strong> Nazareno Clemente (
          <a href="mailto:naza@helloastro.co" style={linkSty}>
            naza@helloastro.co
          </a>
          ). <strong>Discussion:</strong>{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/discussions"
            style={linkSty}
          >
            github.com/ar-agents/ar-agents/discussions
          </a>
          . <strong>License:</strong> CC-BY-4.0.
        </DocP>
        <DocP>
          <strong>Companions:</strong>{" "}
          <a href="/rfcs/004" style={linkSty}>
            RFC-004
          </a>{" "}
          (v1 HMAC operational-log spec — the base this builds on),{" "}
          <a href="/rfcs/003" style={linkSty}>
            RFC-003
          </a>{" "}
          (envelope that benefits most from asymmetric).
        </DocP>
      </DocBlock>

      <DocH2>1 · Why upgrade</DocH2>
      <DocP>
        RFC-004 v1 specifies HMAC-SHA256 with a shared symmetric secret.
        Three audiences hit limits with that scheme:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Regulators.</strong> They want to verify entries
          offline without trusting the operator&apos;s verify endpoint.
          With symmetric HMAC, the operator must either share the key
          (kills the security boundary) or provide a server-side
          verify endpoint the regulator trusts (a single point of
          control). Asymmetric flips this: the operator publishes a
          public key, anyone can verify, no secret leaves the operator.
        </Li>
        <Li>
          <strong>Cross-jurisdictional counterparts (RFC-003).</strong>{" "}
          A Wyoming DAO LLC verifying an AR sociedad-IA&apos;s envelope
          needs the AR public key, not the shared secret. RFC-003 v1
          punts on this; RFC-005 closes it.
        </Li>
        <Li>
          <strong>Future-proofing key rotation.</strong> Today, rotating
          the HMAC secret invalidates every old entry&apos;s signature
          unless the operator carefully re-signs. With asymmetric +
          key-id, old entries stay verifiable under the old public key
          even after rotation.
        </Li>
      </ul>

      <DocH2>2 · Algorithm choice</DocH2>
      <DocP>
        <strong>Ed25519</strong> (RFC 8032). Reasons:
      </DocP>
      <ul style={listStyle}>
        <Li>
          Tiny keys (32 bytes) and signatures (64 bytes). Won&apos;t bloat
          the entry shape meaningfully.
        </Li>
        <Li>
          Universally available in Web Crypto, Node {`>=`} 12, every
          modern crypto library. Same as the HMAC story.
        </Li>
        <Li>
          Deterministic by construction — same input + same key always
          produces the same signature. Maps onto RFC-004 § 3 (canonical-
          JSON + HMAC is deterministic) without surprise.
        </Li>
        <Li>
          Battle-tested. Used by every cryptocurrency, every modern SSH
          server, every commit-signing flow.
        </Li>
      </ul>
      <DocP>
        <strong>Not P-256.</strong> Available everywhere but less
        determinism guarantees + larger sigs.{" "}
        <strong>Not RSA.</strong> Large keys, slower verify, no
        determinism. <strong>Not SLH-DSA (post-quantum).</strong> Too
        early for v2; revisit in v3 when post-quantum signatures
        stabilize.
      </DocP>

      <DocH2>3 · Additive entry shape</DocH2>
      <DocP>
        v2-conformant entries carry BOTH the v1 <DocCode>hmac</DocCode>{" "}
        field AND a new <DocCode>signature</DocCode> field. Verifiers
        check whichever they can:
      </DocP>
      <CodeBlock>{`interface OperationalLogEntry_v2 extends OperationalLogEntry_v1 {
  // v1 field (unchanged): symmetric HMAC, computed as before.
  hmac: string | null;

  // v2 additive field: asymmetric signature.
  // Format: { keyId, alg, value }
  // - keyId: stable identifier for the public key (e.g. "ar-sociedad-key-2026-05")
  // - alg:   "ed25519"
  // - value: base64url-encoded 64-byte signature
  signature?: {
    keyId: string;
    alg: "ed25519";
    value: string;
  };
}`}</CodeBlock>
      <DocP>
        Both fields are computed over the same canonical-JSON of the
        entry, with BOTH the <DocCode>hmac</DocCode> and{" "}
        <DocCode>signature</DocCode> fields stripped before signing.
        Stripping rule: remove the field if present, regardless of
        value.
      </DocP>
      <DocP>
        <strong>Why additive.</strong> Migration is messy. Operators
        can&apos;t flip overnight. Verifiers running v1-only code shouldn&apos;t
        break. The additive shape lets v1 + v2 coexist for as long as
        needed.
      </DocP>

      <DocH2>4 · Key publication</DocH2>
      <DocP>
        Operators publish their public keys at:
      </DocP>
      <CodeBlock>{`GET /.well-known/sociedad-ia/keys

{
  "keys": [
    {
      "keyId": "ar-sociedad-key-2026-05",
      "alg": "ed25519",
      "publicKey": "MCowBQYDK2VwAyEA...",       // base64url, SubjectPublicKeyInfo DER
      "validFrom": "2026-05-01T00:00:00Z",
      "validUntil": null                         // null = currently active
    },
    {
      "keyId": "ar-sociedad-key-2025-12",
      "alg": "ed25519",
      "publicKey": "MCowBQYDK2VwAyEA...",
      "validFrom": "2025-12-01T00:00:00Z",
      "validUntil": "2026-04-30T23:59:59Z"      // rotated out
    }
  ]
}`}</CodeBlock>
      <DocP>
        Properties:
      </DocP>
      <ul style={listStyle}>
        <Li>
          Keys ROTATE; old keys stay published indefinitely so historical
          entries remain verifiable.
        </Li>
        <Li>
          Entries reference the <DocCode>keyId</DocCode> they were signed
          under; verifiers look it up in the keys list.
        </Li>
        <Li>
          The keys endpoint is public, cacheable (15 min TTL recommended),
          and SHOULD be served from a stable origin (the sociedad-IA&apos;s
          canonical domain, not a behind-auth path).
        </Li>
      </ul>

      <DocH2>5 · Verification flow</DocH2>
      <ol style={listStyle}>
        <Li>
          Fetch the entry (e.g. from{" "}
          <DocCode>GET /api/audit/{`{sessionId}`}</DocCode>).
        </Li>
        <Li>
          Strip <DocCode>hmac</DocCode> + <DocCode>signature</DocCode>{" "}
          fields. Canonical-JSON-stringify (RFC-004 § 3 algorithm).
        </Li>
        <Li>
          If <DocCode>signature</DocCode> present: fetch the key from{" "}
          <DocCode>/.well-known/sociedad-ia/keys</DocCode>, find by{" "}
          <DocCode>keyId</DocCode>, verify Ed25519 against the canonical
          form.
        </Li>
        <Li>
          If <DocCode>signature</DocCode> absent + <DocCode>hmac</DocCode>{" "}
          present: fall back to v1 HMAC verification (if the verifier
          has access to the shared secret, e.g. for self-audit).
        </Li>
        <Li>
          If both absent: the entry is unsigned. v1 + v2 production:
          fatal misconfiguration.
        </Li>
      </ol>

      <DocH2>6 · Migration timeline</DocH2>
      <DocP>
        A sociedad-IA upgrading from v1 to v2 follows this path:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Day 0.</strong> Generate an Ed25519 keypair. Publish
          the public key at <DocCode>/.well-known/sociedad-ia/keys</DocCode>.
          Keep the private key in the operator&apos;s secrets manager.
        </Li>
        <Li>
          <strong>Day 0 → N.</strong> Library starts emitting entries
          with BOTH <DocCode>hmac</DocCode> AND <DocCode>signature</DocCode>.
          Verifier endpoint accepts both.
        </Li>
        <Li>
          <strong>Day N (after audit retention period).</strong>{" "}
          Optional: drop <DocCode>hmac</DocCode> from new entries. Old
          entries still verifiable via stored signatures + the
          rotated-out keys. Most operators will keep both fields
          indefinitely; the cost is 100 bytes per entry.
        </Li>
      </ul>

      <DocH2>7 · Test vectors (planned)</DocH2>
      <DocP>
        RFC-005 v1 conformance vectors will be published at{" "}
        <DocCode>/test-vectors/rfc-005-v1.json</DocCode>. Vectors will
        include:
      </DocP>
      <ul style={listStyle}>
        <Li>
          A fixed Ed25519 keypair (private + public, base64url).
        </Li>
        <Li>
          Sample entries with their canonical-JSON form +{" "}
          <DocCode>signature.value</DocCode> hex-exact expected output.
        </Li>
        <Li>
          Cross-validation against the libsodium reference implementation
          for byte-equality.
        </Li>
        <Li>
          Compatibility vector showing v1 HMAC and v2 signature on the
          same entry both verify correctly.
        </Li>
      </ul>

      <DocH2>8 · Open questions</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>Hardware key support.</strong> Should operators be
          encouraged to keep the Ed25519 private key in a hardware token
          (YubiKey, TPM)? Verification doesn&apos;t care, but key custody
          is a real risk surface. RFC-005 v1 doesn&apos;t mandate; v1.1
          may add SHOULD.
        </Li>
        <Li>
          <strong>Key transparency.</strong> Append-only proof that the
          operator hasn&apos;t equivocated about their public key
          (Certificate Transparency-style). Probably out of scope for v1;
          RFC-007 candidate.
        </Li>
        <Li>
          <strong>Cross-jurisdictional key registry.</strong> Should the
          AR registry, Wyoming registry, etc. publish a federated index
          of public keys? Centralization risk vs. enforcement utility —
          same trade-off as RFC-004 § 11.
        </Li>
        <Li>
          <strong>Post-quantum readiness.</strong> Ed25519 is not
          post-quantum-safe. When NIST finalizes SLH-DSA + ML-DSA,
          RFC-005 v2 will add a second signature field for parallel
          PQ signing during the transition period.
        </Li>
      </ul>

      <DocH2>9 · Compatibility summary</DocH2>
      <table style={tableSty}>
        <thead>
          <tr>
            <th style={thSty}>Operator emits</th>
            <th style={thSty}>v1 verifier</th>
            <th style={thSty}>v2 verifier</th>
            <th style={thSty}>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdSty}><DocCode>hmac</DocCode> only</td><td style={tdSty}>✓</td><td style={tdSty}>✓ (falls back)</td><td style={tdSty}>OK</td></tr>
          <tr><td style={tdSty}><DocCode>signature</DocCode> only</td><td style={tdSty}>✗ (no field)</td><td style={tdSty}>✓</td><td style={tdSty}>v1 cannot verify</td></tr>
          <tr><td style={tdSty}>Both</td><td style={tdSty}>✓ (uses hmac)</td><td style={tdSty}>✓ (prefers signature)</td><td style={tdSty}>OK (recommended)</td></tr>
          <tr><td style={tdSty}>Neither</td><td style={tdSty}>✗</td><td style={tdSty}>✗</td><td style={tdSty}>Fatal in production</td></tr>
        </tbody>
      </table>

      <DocH2>10 · Decision request</DocH2>
      <DocP>
        For RFC-005 to advance from draft to v1, the following must be
        resolved:
      </DocP>
      <ul style={listStyle}>
        <Li>
          Reference implementation in <DocCode>apps/landing/src/lib/audit.ts</DocCode>{" "}
          updated to optionally compute + verify the{" "}
          <DocCode>signature</DocCode> field. Behind an
          <DocCode>AUDIT_ED25519_PRIVATE_KEY</DocCode> environment variable
          so v1-only deployments keep working unchanged.
        </Li>
        <Li>
          <DocCode>/.well-known/sociedad-ia/keys</DocCode> endpoint
          published on the reference site.
        </Li>
        <Li>
          Test vectors published at{" "}
          <DocCode>/test-vectors/rfc-005-v1.json</DocCode> with
          hex-exact expected signatures cross-validated against
          libsodium.
        </Li>
        <Li>
          /certifier extended to score the asymmetric path: pass
          if v2 entries verify; warn if mixed; warn if neither.
        </Li>
        <Li>
          Public review period of 30 days via GitHub Discussions.
        </Li>
      </ul>
      <DocP>
        Comments + counter-proposals welcome.
      </DocP>
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
  color: "var(--text-body)",
};

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
};

const tableSty: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  marginBottom: 16,
  boxShadow: "var(--card-shadow)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg-tint)",
};

const thSty: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  fontWeight: 500,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const tdSty: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-body)",
};
