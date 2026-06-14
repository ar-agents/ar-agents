import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";
import { RfcDisclaimer } from "../disclaimer";

export const metadata: Metadata = {
  title: "RFC-004: Sociedad-IA operational-log specification",
  description:
    "Canonical wire format + cryptographic invariants for the operational log every AR sociedad-IA must keep. Pins down exactly what fields an entry has, how its HMAC is computed, what append-only means in practice, and what a regulator can demand without a court order. Draft.",
  alternates: { canonical: "https://ar-agents.ar/rfcs/004" },
};

export default function Rfc004Page() {
  return (
    <DocShell
      eyebrow="rfc-004 · draft · 2026-05"
      title="RFC-004: Operational-log specification for AR sociedades-IA."
      subtitle="RFC-001 said every sociedad-IA must keep an append-only HMAC-signed audit log. It did not pin down the wire format. RFC-004 does. This is the document a regulator can cite when demanding evidence, and the spec library authors implement against."
    >
      <RfcJsonLd
        id="004"
        title="RFC-004: Sociedad-IA operational-log specification"
        abstract="Canonical wire format + cryptographic invariants for the operational log every AR sociedad-IA must keep. Pins down entry shape, HMAC computation, append-only invariants, verification interface, retention, and conformance test vectors."
        datePublished="2026-05-11"
      />

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
            href="https://doi.org/10.5281/zenodo.20159417"
            style={{ color: "var(--accent)" }}
          >
            10.5281/zenodo.20159417
          </a>
          .
        </DocP>
        <DocP>
          <strong>Companions:</strong>{" "}
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001
          </a>{" "}
          (three-layer liability + governance taxonomy),{" "}
          <a href="/rfcs/002" style={{ color: "var(--accent)" }}>
            RFC-002
          </a>{" "}
          (agent-discovery-by-default),{" "}
          <a href="/rfcs/003" style={{ color: "var(--accent)" }}>
            RFC-003
          </a>{" "}
          (cross-jurisdictional reciprocity envelope),{" "}
          <a href="/rfcs/006" style={{ color: "var(--accent)" }}>
            RFC-006
          </a>{" "}
          (hash-chained ledger profile that strengthens §4 and projects back
          onto this spec by a normative map).
        </DocP>
        <DocP>
          <strong>Reference implementation:</strong>{" "}
          <a
            href="/architecture/audit-log"
            style={{ color: "var(--accent)" }}
          >
            /architecture/audit-log
          </a>{" "}
          (this page&apos;s code-level companion), and{" "}
          <DocCode>apps/landing/src/lib/audit.ts</DocCode> in{" "}
          <a
            href="https://github.com/ar-agents/ar-agents"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents
          </a>
          .
        </DocP>
      </DocBlock>

      <RfcDisclaimer />

      <DocH2>1 · The gap RFC-004 fills</DocH2>
      <DocP>
        RFC-001 § 9.1 says &quot;every sociedad-IA MUST keep an append-only
        audit log, HMAC-signed at write time.&quot; That sentence is enough
        legal scaffolding to anchor the liability framework, but it leaves
        a dozen implementation decisions on the floor, and every
        implementation that diverges is a regulator&apos;s headache later.
        (&quot;Sociedad-IA&quot; is the umbrella nickname; the legal figure
        is the Sociedad Automatizada, art. 14 of the Anteproyecto de Ley
        General de Sociedades. Its records duty is grounded in art. 263,
        which requires publicly-verifiable digital records.)
      </DocP>
      <DocP>RFC-004 pins down:</DocP>
      <ul style={listStyle}>
        <Li>Which fields each entry MUST have, MAY have, MUST NOT have.</Li>
        <Li>How the HMAC is computed (canonical-JSON, key derivation, version tag).</Li>
        <Li>What &quot;append-only&quot; means in code (KV invariants, deletion ban, ordering).</Li>
        <Li>How a regulator verifies an entry without holding the signing key.</Li>
        <Li>Minimum retention + maximum retention with privacy guard.</Li>
        <Li>The streaming + export interfaces a sociedad-IA MUST expose.</Li>
        <Li>The conformance test vectors a library author runs to claim RFC-004 compatibility.</Li>
      </ul>
      <DocP>
        Treat this as the document a journalist, auditor, or AFIP inspector
        prints out and uses to challenge a sociedad-IA&apos;s claim that it
        ran legitimately.
      </DocP>

      <DocH2>2 · Entry shape (normative)</DocH2>
      <DocP>
        Every entry written to the operational log MUST conform to this
        TypeScript-ish shape. JSON-Schema published at{" "}
        <DocCode>https://ar-agents.ar/schemas/operational-log-entry.v1.json</DocCode>{" "}
        (planned, not yet served).
      </DocP>
      <CodeBlock>{`interface OperationalLogEntry {
  // MUST. Stable across reads. Format: ISO-8601 UTC + "-" + 8-hex-char nonce.
  // Example: "2026-05-11T14:23:01.512Z-a1b2c3d4"
  id: string;

  // MUST. Identifies the operational session. Format: [A-Za-z0-9_-]{8,64}.
  // A session is a coherent series of tool-calls that share a single
  // governance context (e.g. one human-confirmed action through completion).
  sessionId: string;

  // MUST. ISO-8601 UTC. Server-clock at write time, not request-clock.
  ts: string;

  // MUST. The tool / endpoint / model / external-API that produced the
  // side effect. Naming: lowercase, dot-separated. Examples:
  //   "mercadopago.preapproval.create"
  //   "afip.padron.consultar"
  //   "anthropic.messages.create"
  //   "internal.policy.gate"
  tool: string;

  // MUST. RFC-001 governance class. Exactly one of:
  governance:
    | "algorithm-only"        // Pure code, no LLM call. Deterministic.
    | "audit-logged"          // LLM call ran, output logged + classified.
    | "mocked-upstream"       // External API not wired. Demo-tier.
    | "requires-confirmation" // Human approval present (HITL).

  // MUST. The serialized input to the tool. Canonical-JSON serializable.
  // MUST NOT contain raw secrets, strip before logging.
  input: unknown;

  // MAY. The serialized output. Omit if the tool errored.
  // MUST NOT contain raw secrets (tokens, keys, PII beyond what's needed).
  output?: unknown;

  // MAY. Truthy if the tool errored. The error reason SHOULD be in output.
  errored?: boolean;

  // MAY. Wall-clock duration in milliseconds. Useful for SLA + anomaly
  // detection ("this call usually takes 200ms; this one took 12000ms").
  durationMs?: number;

  // MUST. HMAC-SHA256 of canonical-JSON(entry minus the hmac field).
  // Format: "sha256:" + 64-hex-char.
  // MAY be null in a development build with no signing key wired; in
  // production a null hmac is a fatal misconfiguration.
  hmac: string | null;
}`}</CodeBlock>
      <DocP>
        Forbidden fields (MUST NOT appear):
      </DocP>
      <ul style={listStyle}>
        <Li>
          <DocCode>password</DocCode>, <DocCode>secret</DocCode>,{" "}
          <DocCode>privateKey</DocCode>, <DocCode>apiKey</DocCode>,{" "}
          <DocCode>token</DocCode>, under any nested path. Library
          implementations SHOULD scrub before write.
        </Li>
        <Li>
          Personally-identifying data beyond what is operationally
          necessary. CUIT is fine; full home address with floor and apt
          number probably isn&apos;t.
        </Li>
        <Li>
          User-supplied free-form text that hasn&apos;t been bounded.
          A 10MB prompt body in an audit entry breaks SSE + makes export
          expensive. SHOULD truncate at 64KB per field with a marker.
        </Li>
      </ul>

      <DocH2>3 · HMAC computation (normative)</DocH2>
      <DocP>
        The signature is computed in three deterministic steps:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Step 1, strip.</strong> Remove the <DocCode>hmac</DocCode>{" "}
          field if present. Sign + verify MUST operate on the same field set.
        </Li>
        <Li>
          <strong>Step 2, canonicalize.</strong> Stringify the remaining
          object with all keys sorted lexicographically at every level. Use
          the canonical-JSON function defined below, JSON.stringify is{" "}
          <em>not</em> canonical in JavaScript and re-serialization differs
          across runtimes.
        </Li>
        <Li>
          <strong>Step 3, HMAC.</strong> Compute HMAC-SHA256 of the UTF-8
          bytes using the sociedad-IA&apos;s signing key. Hex-encode + prefix
          with <DocCode>sha256:</DocCode>.
        </Li>
      </ul>
      <CodeBlock>{`function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);   // primitives + null
  }
  if (Array.isArray(value)) {
    return \`[\${value.map(canonical).join(",")}]\`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return \`{\${keys
    .map(k => \`\${JSON.stringify(k)}:\${canonical(obj[k])}\`)
    .join(",")}}\`;
}`}</CodeBlock>
      <DocP>
        The signing key (RFC-004 calls it <DocCode>AUDIT_HMAC_SECRET</DocCode>)
        is a single shared symmetric secret. Future revisions of this RFC
        may add asymmetric signatures (Ed25519) where the sociedad-IA
        publishes a public key + signs with a private key, easier for
        third-party verification, but the v1 baseline is symmetric HMAC.
        Rationale: HMAC is universally available in every standard library
        + Web Crypto, has a vetted security boundary, and an asymmetric
        upgrade can be additive (entry carries both a hmac and a signature
        field with a key-id).
      </DocP>

      <DocH2>4 · Append-only invariants (normative)</DocH2>
      <DocP>
        &quot;Append-only&quot; is not magic. It is a set of code-level
        constraints + a set of operational checks:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Code constraint.</strong> The library MUST expose exactly
          one mutation primitive: <DocCode>appendAudit(sessionId, partial)</DocCode>.
          No <DocCode>updateAudit</DocCode>. No <DocCode>deleteAudit</DocCode>.
          A regulator reading the source must find no path that mutates an
          existing entry.
        </Li>
        <Li>
          <strong>Storage constraint.</strong> The backing store SHOULD be a
          structure where in-place mutation is unnatural (a list, an
          append-only log, a Kafka-style topic). The reference
          implementation uses Vercel KV <DocCode>RPUSH</DocCode> + <DocCode>LRANGE</DocCode> + TTL.
          Stores that allow random-access overwrite by key (S3 PUT,
          plain Redis HSET) are permitted only if a Merkle-chain or
          checksum tree gives the same guarantee.
        </Li>
        <Li>
          <strong>Ordering constraint.</strong> Entry IDs include the
          server-clock timestamp first, so a textual sort of IDs is the
          temporal order. An out-of-order entry (clock skew or fork)
          MUST still be appended, and downstream consumers SHOULD flag
          the skew rather than mask it.
        </Li>
        <Li>
          <strong>Verification constraint.</strong> The HMAC MUST be
          computed over the post-strip canonical JSON. Verifying a stored
          entry MUST re-compute against the same canonical form. The
          reference implementation includes both <DocCode>signEntry</DocCode> +{" "}
          <DocCode>verifyEntry</DocCode> for symmetry, a chain that signs
          but cannot self-verify is broken-by-design.
        </Li>
      </ul>
      <DocP>
        The <em>only</em> permitted destructive action is TTL-based purge
        for retention compliance (§ 7). Any deletion code path outside that
        flow is a violation of the RFC + grounds for the sociedad-IA to
        forfeit Layer 3 liability protection per RFC-001 § 9.4.
      </DocP>

      <DocH2>5 · Verification interface (normative)</DocH2>
      <DocP>
        A regulator MUST be able to verify an entry without holding the
        signing key. The sociedad-IA exposes this through:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Read endpoint.</strong> <DocCode>GET /api/audit/{`{sessionId}`}</DocCode>{" "}
          returns the full session as a JSON array of entries. Public,
          unauthenticated (the entries themselves are non-secret).
        </Li>
        <Li>
          <strong>Verify endpoint.</strong>{" "}
          <DocCode>GET /api/audit/{`{sessionId}`}?verify=1</DocCode>{" "}
          returns the entries plus <DocCode>{`{ total, verified, tampered, hmacWired }`}</DocCode>{" "}
          counts. The sociedad-IA does the verification server-side. If the
          regulator wants to verify independently, they fetch the entries
          + a separate verify-public-key URL.
        </Li>
        <Li>
          <strong>Key endpoint (planned v2).</strong>{" "}
          <DocCode>GET /.well-known/sociedad-ia/verify-key</DocCode> returns
          the sociedad-IA&apos;s public verification material, for v1
          symmetric HMAC, this is the SHA-256 of the signing key with a
          challenge-nonce, allowing offline proof of key-possession without
          revealing the key itself. For v2 asymmetric, returns the
          Ed25519 public key.
        </Li>
        <Li>
          <strong>Export endpoint.</strong>{" "}
          <DocCode>GET /api/audit/{`{sessionId}`}/csv</DocCode> returns
          RFC-4180 CSV with UTF-8 BOM. Required for regulatory tooling
          that doesn&apos;t speak JSON.
        </Li>
        <Li>
          <strong>Stream endpoint.</strong>{" "}
          <DocCode>GET /api/audit/{`{sessionId}`}/stream</DocCode> returns
          Server-Sent Events with one <DocCode>event: append</DocCode> per
          new entry + periodic <DocCode>event: keepalive</DocCode>. Optional
          for v1, recommended for v1.1+ to enable live regulator dashboards.
        </Li>
      </ul>

      <DocH2>6 · Governance taxonomy (normative)</DocH2>
      <DocP>
        The four governance classes are not decorative. They map directly to
        RFC-001 § 4 liability allocation:
      </DocP>
      <CodeBlock>{`┌─────────────────────────┬───────────────────────────────────────┐
│ Governance class        │ Liability allocation per RFC-001 § 4  │
├─────────────────────────┼───────────────────────────────────────┤
│ algorithm-only          │ Operator. Pure code, deterministic.   │
│ audit-logged            │ Operator + recorded LLM provider.     │
│ mocked-upstream         │ Demo-tier; no production binding.     │
│ requires-confirmation   │ Human-in-the-loop; operator absorbs   │
│                         │ liability for the confirmed action.   │
└─────────────────────────┴───────────────────────────────────────┘`}</CodeBlock>
      <DocP>
        A sociedad-IA emitting an entry with <DocCode>governance: &quot;mocked-upstream&quot;</DocCode>{" "}
        in production is making a public admission that the side effect did
        not happen against the real upstream. Regulators reading the log
        can tell a real cobro from a demo run by this field alone.
      </DocP>

      <DocH2>7 · Retention (normative)</DocH2>
      <DocP>
        Minimum retention: <strong>180 days</strong>. Rationale: the AFIP
        general statute of limitations for fiscal claims is 5 years, but
        the practical window for operational disputes (chargebacks,
        consumer complaints, AP2 disputes) closes within 90–120 days.
        180 days covers operational + early fiscal challenge.
      </DocP>
      <DocP>
        Maximum retention: <strong>5 years</strong> for HMAC-signed entries,
        after which they MUST be either re-signed under a new key-rotation
        epoch or purged. Indefinite retention of personally-identifying
        operational logs creates privacy + data-protection risk
        (Ley 25.326) that the RFC declines to inherit.
      </DocP>
      <DocP>
        The reference implementation sets a 7-day TTL on Vercel KV for
        development convenience. Production sociedades-IA MUST configure
        either: a separate cold-storage path with 180d-to-5y retention, or
        a per-session retention policy that respects the user&apos;s data
        rights (Ley 25.326 art 16: right to deletion). RFC-004 v1 is silent
        on the implementation; v1.1 will define a <DocCode>retentionClass</DocCode>{" "}
        field per entry.
      </DocP>

      <DocH2>8 · Conformance test vectors</DocH2>
      <DocP>
        A library claiming RFC-004 v1 conformance MUST pass these
        deterministic vectors. Future revisions of the RFC will publish
        vectors at <DocCode>/test-vectors/rfc-004-v1.json</DocCode>; for
        now, the vectors are embedded here:
      </DocP>
      <CodeBlock>{`// Vector 1: canonical-JSON is key-sorted.
canonical({ b: 1, a: 2 })
  === '{"a":2,"b":1}'

// Vector 2: canonical-JSON recurses into arrays + objects.
canonical({ a: [{ z: 1, y: 2 }, 3] })
  === '{"a":[{"y":2,"z":1},3]}'

// Vector 3: HMAC is computed over canonical form, hmac field stripped.
const entry = {
  id: "2026-05-11T00:00:00.000Z-deadbeef",
  sessionId: "test-session",
  ts: "2026-05-11T00:00:00.000Z",
  tool: "test.echo",
  governance: "algorithm-only",
  input: { ping: 1 },
  output: { pong: 1 },
  hmac: null
};
const secret = "rfc-004-conformance-secret";
const expected = "sha256:a4b1c8f7..."; // computed at vector-publish time
signEntry(entry, secret) === expected;

// Vector 4: verify accepts the entry, rejects a mutated copy.
verifyEntry(entry, secret) === true;
verifyEntry({ ...entry, output: { pong: 2 } }, secret) === false;

// Vector 5: re-signing the same entry is idempotent.
signEntry(entry, secret) === signEntry(entry, secret);

// Vector 6: deeply-nested mutation is detected.
const big = {
  ...entry,
  input: { batch: [{ amount: 100 }, { amount: 200 }] }
};
const bigSig = signEntry(big, secret);
const mutated = JSON.parse(JSON.stringify(big));
mutated.input.batch[1].amount = 201;
verifyEntry({ ...mutated, hmac: bigSig }, secret) === false;`}</CodeBlock>
      <DocP>
        The reference implementation passes these vectors. The full test
        suite (with hex-exact expected values, regenerated at vector
        publish time) lives in{" "}
        <DocCode>apps/landing/src/lib/audit.test.ts</DocCode> alongside the
        library source. v1 finalization includes pinning every expected
        HMAC value.
      </DocP>

      <DocH2>9 · What a regulator can demand</DocH2>
      <DocP>
        Without a court order, a regulator (AFIP, BCRA, AAIP for data
        protection) can require a sociedad-IA to produce, within
        a defined SLA:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Session inventory.</strong> The list of sessionIds active
          during a window. Sociedad-IA SHOULD have a tenant-scoped
          enumeration endpoint; RFC-004 v1.1 will normative-ize it.
        </Li>
        <Li>
          <strong>Full session export.</strong> The complete entry list for
          a sessionId in JSON + CSV. SLA: 1 business day.
        </Li>
        <Li>
          <strong>Verification proof.</strong> The HMAC verification result
          + the key-possession proof (challenge-response). SLA: same as
          above.
        </Li>
        <Li>
          <strong>Operational narrative.</strong> A human-readable summary
          of what the sociedad-IA was doing during the window, generated
          from the audit log, not from human recollection. The reference
          stack provides this via{" "}
          <a href="/play" style={{ color: "var(--accent)" }}>
            /play/dashboard
          </a>{" "}
          + the CSV export.
        </Li>
      </ul>
      <DocP>
        With a court order, the regulator can additionally compel
        production of the signing-key custody chain (who held the
        AUDIT_HMAC_SECRET, where it was stored, who rotated it when),
        equivalent to compelling production of a wet-signature notary&apos;s
        seal-custody log.
      </DocP>

      <DocH2>10 · Compliance with companions</DocH2>
      <DocP>
        <strong>RFC-001 § 9 → RFC-004 § 2-4.</strong> The append-only,
        HMAC-signed requirement is here, formally.
      </DocP>
      <DocP>
        <strong>RFC-002 → RFC-004 § 5.</strong> The discovery convention
        advertises the verify + export endpoints. RFC-004 defines what
        those endpoints must return.
      </DocP>
      <DocP>
        <strong>RFC-003 → RFC-004 § 2.</strong> The cross-jurisdictional
        envelope wraps RFC-004 entries. The <DocCode>entries[]</DocCode>{" "}
        array in an RFC-003 envelope is normative-ly defined here.
      </DocP>

      <DocH2>11 · Open questions</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>Asymmetric upgrade.</strong> When does v2 ship? The
          additive path (entries carry both <DocCode>hmac</DocCode> + an
          optional <DocCode>signature</DocCode> field with key-id) is
          straightforward; the harder question is key-distribution +
          rotation governance.
        </Li>
        <Li>
          <strong>Retention v1.1.</strong> Per-entry <DocCode>retentionClass</DocCode>{" "}
          field with values <DocCode>operational</DocCode> (180d),{" "}
          <DocCode>fiscal</DocCode> (5y), <DocCode>privacy-erased</DocCode>{" "}
          (allowed after Ley 25.326 deletion request, content is null but
          metadata + HMAC are preserved for chain integrity).
        </Li>
        <Li>
          <strong>Streaming SLA.</strong> Should the SSE endpoint be
          MUST-implement or SHOULD-implement? Live dashboards are a strong
          regulator-comfort signal; a tiny sociedad-IA may not have the
          ops headroom.
        </Li>
        <Li>
          <strong>Privacy boundary on free-text inputs.</strong> What about
          user prompts that contain sensitive personal data the user
          themselves volunteered? RFC-004 v1 says &quot;truncate at 64KB,
          scrub known-sensitive keys.&quot; v1.1 should formalize a
          per-tool input-policy (e.g., the policy gate input is never
          retained verbatim; only its classification result is).
        </Li>
        <Li>
          <strong>Aggregation across sociedades-IA.</strong> Should the
          spec define a single national index of sessionIds (regulator
          can search across all sociedades-IA at once)? Hot debate;
          centralization risk vs. enforcement utility.
        </Li>
      </ul>

      <DocH2>12 · Decision request</DocH2>
      <DocP>
        For the AR sociedad-IA legislative project to reference a
        consistent log format, RFC-004 needs to be either adopted as the
        canonical reference or explicitly superseded. The proposed path:
      </DocP>
      <ul style={listStyle}>
        <Li>
          The legislation cites RFC-004 v1 as the minimum operational-log
          spec a sociedad-IA must implement to qualify for the regime.
        </Li>
        <Li>
          The RFC remains open-source, MIT/CC-BY, hosted at this URL,
          governance through{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/discussions"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents/discussions
          </a>
          .
        </Li>
        <Li>
          Future revisions track changes in a versioned changelog at{" "}
          <a href="/changelog" style={{ color: "var(--accent)" }}>
            /changelog
          </a>
          ; v1 stays frozen so legislation referencing it remains stable.
        </Li>
      </ul>
      <DocP>
        Comments + counter-proposals welcome. This is a draft; v1
        finalization includes pinning every test-vector hex and any
        clarifications surfaced in discussion.
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
