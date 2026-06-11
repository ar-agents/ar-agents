import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";
import { RfcDisclaimer } from "../disclaimer";

export const metadata: Metadata = {
  title: "RFC-006: Hash-chained ledger + external anchoring profile",
  description:
    "A strict superset of RFC-004: a linked HMAC hash-chain plus an external anchor sub-chain. Detects insertion/deletion/reordering and defends against the operator itself. Every RFC-006 ledger projects, by a normative deterministic map, onto RFC-004-conformant entries, so a regulator holding only RFC-004 tooling can still verify it. Draft.",
  alternates: { canonical: "https://ar-agents.ar/rfcs/006" },
};

export default function Rfc006Page() {
  return (
    <DocShell
      eyebrow="rfc-006 · draft · 2026-05"
      title="RFC-006: Hash-chained ledger + external anchoring profile."
      subtitle="RFC-004 makes each entry tamper-evident. It does not prove the set of entries is complete and ordered, nor defend the log when the adversary is the operator. RFC-006 is the profile that does both, and it stays RFC-004-checkable by a normative projection, so raising the floor does not fork the standard."
    >
      <RfcJsonLd
        id="006"
        title="RFC-006: Hash-chained ledger + external anchoring profile (extends RFC-004)"
        abstract="A strict superset of RFC-004: a linked HMAC hash-chain plus an external anchor sub-chain. Detects insertion/deletion/reordering and defends against the operator itself. Every RFC-006 ledger projects, by a normative deterministic map, onto RFC-004-conformant entries."
        datePublished="2026-05-17"
      />

      <DocBlock>
        <DocP>
          <strong>Status:</strong> Draft.{" "}
          <strong>Author:</strong> Nazareno Clemente (
          <a href="mailto:naza@naza.ar" style={linkSty}>
            naza@naza.ar
          </a>
          ). <strong>Discussion:</strong>{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/discussions"
            style={linkSty}
          >
            github.com/ar-agents/ar-agents/discussions
          </a>
          . <strong>License:</strong> CC-BY-4.0.{" "}
          <strong>DOI:</strong> pending Zenodo deposit.
        </DocP>
        <DocP>
          <strong>Companions:</strong>{" "}
          <a href="/rfcs/001" style={linkSty}>
            RFC-001
          </a>{" "}
          (liability + governance taxonomy),{" "}
          <a href="/rfcs/004" style={linkSty}>
            RFC-004
          </a>{" "}
          (operational-log spec, the base this profile extends),{" "}
          <a href="/rfcs/005" style={linkSty}>
            RFC-005
          </a>{" "}
          (Ed25519 asymmetric upgrade).
        </DocP>
        <DocP>
          <strong>Reference implementation:</strong> Vultur{" "}
          <DocCode>@vultur/core/&#123;audit,anchor&#125;.ts</DocCode> (the live
          producer). <strong>Independent verifier:</strong>{" "}
          <DocCode>tools/arg-verify/arg-verify.mjs</DocCode> in{" "}
          <a href="https://github.com/ar-agents/ar-agents" style={linkSty}>
            github.com/ar-agents/ar-agents
          </a>{" "}
          (<DocCode>chain</DocCode>, <DocCode>project</DocCode>,{" "}
          <DocCode>vectors</DocCode>, zero dependency, offline).
        </DocP>
      </DocBlock>

      <RfcDisclaimer />

      <DocH2>1 · The gap RFC-006 fills</DocH2>
      <DocP>
        RFC-004 §4 specifies an append-only, per-entry HMAC-signed log and, in
        §11, explicitly leaves open whether stores that allow random-access
        overwrite need a Merkle-chain to give the same guarantee, plus
        anti-equivocation. A sociedad-IA handling real value wants strictly
        more than per-entry tamper-evidence:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Insertion / deletion / reordering detection</strong>, not
          just per-record mutation detection. A per-entry HMAC proves{" "}
          <em>this record</em> was not edited; it does not prove the{" "}
          <em>set</em> of records is complete and ordered.
        </Li>
        <Li>
          <strong>A guarantee against the operator itself.</strong> A
          per-entry HMAC is computed with the operator&apos;s key; the
          operator can re-sign a rewritten history. The log must be defensible
          even when the adversary is the sociedad-IA.
        </Li>
      </ul>
      <DocP>
        RFC-006 delivers both: a <strong>linked HMAC hash-chain</strong> plus
        an <strong>external anchor sub-chain</strong>. It is a strict superset
        of RFC-004: every RFC-006 ledger projects, by the normative
        deterministic map in §5, onto RFC-004-conformant entries, so a
        regulator holding only RFC-004 and the published RFC-004 tooling can
        verify an RFC-006 producer with no new software.
      </DocP>

      <DocH2>2 · Canonical-JSON (normative, inherited)</DocH2>
      <DocP>
        RFC-006 uses the RFC-004 §3 canonical-JSON function verbatim: keys
        sorted lexicographically at every level, arrays positional, primitives
        via <DocCode>JSON.stringify</DocCode>. The reference producer&apos;s{" "}
        <DocCode>canonicalize()</DocCode> (
        <DocCode>JSON.stringify(sort(v))</DocCode>) is a conformant
        implementation; <DocCode>arg-verify</DocCode> reimplements the §3 form
        clean-room and the two agree on every published vector.
      </DocP>

      <DocH2>3 · Chain link (normative)</DocH2>
      <DocP>
        The unit of an RFC-006 ledger is a <strong>link</strong>, not a
        free-standing entry.
      </DocP>
      <CodeBlock>{`interface ChainLinkPayload {
  seq:        number;            // 1-based, contiguous, no gaps
  prevHash:   string;            // hash of link seq-1; "GENESIS" for seq 1
  societyId:  string | null;     // tenant; null = global ledger
  actor:      string;            // who/what initiated
  action:     string;            // the operation that produced the effect
  meta:       unknown;           // operation detail; null if none
  ts:         string;            // ISO-8601 UTC, server clock at write time
}

hash_n = HMAC_SHA256( AUDIT_SECRET,
           canonical({ seq, prevHash, societyId, actor, action,
                       meta: meta ?? null, ts }) )      // lowercase hex
prevHash_1 = "GENESIS"
prevHash_n = hash_{n-1}        (n > 1)`}</CodeBlock>
      <DocP>
        <DocCode>hash_n</DocCode> is raw lowercase hex (no{" "}
        <DocCode>sha256:</DocCode> prefix, that is RFC-004&apos;s per-entry
        convention, not the chain convention). <DocCode>meta</DocCode> is
        normalized to <DocCode>null</DocCode> when absent before
        canonicalization so sign and verify agree. The only permitted mutation
        primitive is <DocCode>append</DocCode>; TTL-purge for RFC-004 §7
        retention is the sole destructive exception and it purges whole
        prefixes, never interior links.
      </DocP>

      <DocH2>4 · Chain verification (normative)</DocH2>
      <DocP>
        <strong>4.1 Contiguous chain (full integrity).</strong> For an ordered
        slice from genesis or a known checkpoint, assert for every{" "}
        <DocCode>i</DocCode>: (1) <DocCode>seq_i == seq_&#123;i-1&#125; + 1</DocCode>{" "}
        (contiguity, detects deletion / reordering); (2){" "}
        <DocCode>prevHash_i == hash_&#123;i-1&#125;</DocCode> (linkage, detects
        insertion / deletion); (3){" "}
        <DocCode>hash_i == HMAC(secret, canonical(payload_i))</DocCode>{" "}
        (authenticity, detects mutation, including deeply-nested mutation). A
        passing slice proves the records are unmutated{" "}
        <em>and</em> complete <em>and</em> ordered.
      </DocP>
      <DocP>
        <strong>4.2 Per-record (non-contiguous slice).</strong> For a filtered
        view (one society pulled from a global chain), contiguity cannot hold;
        assert only check (3) per record and label the result{" "}
        <DocCode>recordsOnly: true</DocCode>.
      </DocP>

      <DocH2>5 · RFC-004 projection (normative, the conformance bridge)</DocH2>
      <DocP>
        An RFC-006 producer is RFC-004-conformant <strong>by construction</strong>{" "}
        via this deterministic projection <DocCode>P</DocCode>. Given chain
        link <DocCode>L</DocCode>:
      </DocP>
      <CodeBlock>{`id         := \`\${L.ts}-\${L.hash.slice(0,8)}\`
sessionId  := if   typeof L.societyId === "string"
                   && /^[A-Za-z0-9_-]{8,64}$/.test(L.societyId)
              then L.societyId
              else if L.societyId == null  then "GLOBAL-LEDGER"
              else "soc-" + base64url(sha256(String(L.societyId))).slice(0,16)
ts         := L.ts
tool       := L.action
governance := (L.meta is object && L.meta.governance ∈ RFC-004 §6 enum)
              ? L.meta.governance : "audit-logged"
input      := { actor: L.actor, seq: L.seq, meta: L.meta ?? null }
output     := (omitted)
hmac       := "sha256:" + HMAC_SHA256( PROJECTION_SECRET,
                            canonical(P(L) without \`hmac\`) )`}</CodeBlock>
      <DocP>
        Properties (all machine-checked by{" "}
        <DocCode>arg-verify project</DocCode> /{" "}
        <DocCode>arg-verify vectors</DocCode>):
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Determinism.</strong> <DocCode>P</DocCode> is a pure function
          of <DocCode>L</DocCode>. Same chain produces the same entries.
        </Li>
        <Li>
          <strong>RFC-004 validity.</strong> <DocCode>P(L)</DocCode> is a
          well-formed <DocCode>OperationalLogEntry</DocCode>;{" "}
          <DocCode>verifyEntry(P(L), PROJECTION_SECRET)</DocCode> per RFC-004 §3
          returns <DocCode>true</DocCode>.
        </Li>
        <Li>
          <strong>Injectivity.</strong> <DocCode>input.seq</DocCode> plus{" "}
          <DocCode>id</DocCode> (which embeds <DocCode>hash</DocCode>) make{" "}
          <DocCode>P</DocCode> collision-free, preserving chain order and
          identity.
        </Li>
        <Li>
          <strong>Lossy-but-declared.</strong> <DocCode>governance</DocCode>{" "}
          defaults to <DocCode>audit-logged</DocCode> when the producer did not
          carry an explicit class in <DocCode>meta.governance</DocCode>. This
          is the only lossy point and it fails safe (toward the more-liability
          class, never toward <DocCode>mocked-upstream</DocCode>).
        </Li>
      </ul>
      <DocP>
        <DocCode>PROJECTION_SECRET</DocCode> MAY equal{" "}
        <DocCode>AUDIT_SECRET</DocCode> or be a separate RFC-004 signing key;
        the projection is a <em>view</em>, the native chain (§3-4) remains the
        stronger guarantee. A regulator running RFC-004 tooling
        (
        <DocCode>
          arg-verify entry P(L).json --secret PROJECTION_SECRET
        </DocCode>
        ) gets a green check with zero RFC-006 awareness.
      </DocP>

      <DocH2>6 · External anchoring (normative)</DocH2>
      <DocP>
        Periodically the producer checkpoints the chain head into an{" "}
        <strong>anchor</strong>; anchors form their own HMAC-signed chain:
      </DocP>
      <CodeBlock>{`interface AnchorBody {
  seq:        number;      // 1-based, contiguous
  headSeq:    number;      // chain head seq at checkpoint time
  headHash:   string;      // chain head hash at checkpoint time
  prevAnchor: string;      // previous anchor signature; "GENESIS" for seq 1
  ts:         string;      // ISO-8601 UTC
}
signature_n  = HMAC_SHA256( AUDIT_SECRET, canonical(AnchorBody_n) )  // hex
prevAnchor_n = signature_{n-1}`}</CodeBlock>
      <DocP>
        The anchor chain SHOULD be mirrored to an{" "}
        <strong>external notary</strong> outside the operator&apos;s control
        (an append-only third party, timestamping authority, or public log).
        The operator then cannot retroactively rewrite or backdate history
        without invalidating every anchor issued since the divergence point,
        and the external mirror is evidence the operator cannot suppress. This
        is the §1 guarantee against the operator itself.
      </DocP>

      <DocH2>7 · Asymmetric attestation (normative, aligns RFC-005)</DocH2>
      <DocP>
        When an RFC-006 producer publishes a signed compliance attestation
        over the chain head, RFC-006 <strong>requires RFC-005 wire
        conventions</strong> so a single verifier works everywhere: Ed25519
        value base64url-unpadded (not standard base64); public key set at{" "}
        <DocCode>/.well-known/sociedad-ia/keys</DocCode> as the RFC-005 §4 JSON
        with <DocCode>keyId</DocCode> + rotation; each signature carries a{" "}
        <DocCode>keyId</DocCode> resolvable in that set. The reference producer
        currently emits base64 + an embedded key at{" "}
        <DocCode>/api/audit/pubkey</DocCode>; RFC-006 §7 is the normative
        target and the gap is a pure encoding/endpoint change tracked in{" "}
        <DocCode>CONFORMANCE.md</DocCode>.
      </DocP>

      <DocH2>8 · Verification interface (extends RFC-004 §5)</DocH2>
      <ul style={listStyle}>
        <Li>
          <DocCode>GET /api/audit/verify</DocCode>, contiguous-chain
          verification result.
        </Li>
        <Li>
          <DocCode>GET /api/audit/anchor</DocCode>, the anchor chain for §6
          verification.
        </Li>
        <Li>
          <DocCode>GET /api/audit/&#123;slug&#125;/attestation</DocCode>, the
          §7 attestation.
        </Li>
        <Li>
          <DocCode>GET /api/audit/&#123;slug&#125;/bundle</DocCode>, the §8
          export bundle: chain slice + RFC-004 entries + attestation, the
          artifact a regulator downloads and verifies offline.
        </Li>
        <Li>
          A <strong>projection export</strong> emitting{" "}
          <DocCode>P(L)</DocCode> so a regulator runs RFC-004 tooling
          unchanged. RFC-006 v1.1 normative-izes the exact route; v1 requires
          only that such an export exists and is documented.
        </Li>
      </ul>
      <DocP>
        These endpoints are <strong>live on this deployment</strong>: every
        durable audit entry also lands as a link in the global hash chain, the
        head is sealed into the signed anchor chain, and any society slice
        exports as a bundle verifiable offline with{" "}
        <DocCode>node arg-verify.mjs bundle &lt;file&gt;</DocCode>, no trust in
        this server required. The implementation is conformance-tested in CI
        against the frozen vectors below.
      </DocP>

      <DocH2>9 · Conformance test vectors</DocH2>
      <DocP>
        <DocCode>
          <a href="/test-vectors/rfc-006-v1.json" style={linkSty}>
            /test-vectors/rfc-006-v1.json
          </a>
        </DocCode>{" "}
        contains, with byte-exact deterministic outputs: a genesis-rooted
        3-link chain (expected <DocCode>hash</DocCode> per link); a mutated
        copy that MUST fail at the mutated <DocCode>seq</DocCode>; a deletion
        copy that MUST fail on contiguity/linkage; a 2-anchor chain; and the
        exact <DocCode>P(L)</DocCode> object and RFC-004{" "}
        <DocCode>hmac</DocCode> for every link. A library claims RFC-006
        conformance iff it reproduces every value and the projected entries
        pass RFC-004 §3 <DocCode>verifyEntry</DocCode>. Run:
      </DocP>
      <CodeBlock>{`node tools/arg-verify/arg-verify.mjs vectors
# RFC-004: 10 PASS · RFC-005: 4 PASS · RFC-006: 12 PASS
# ALL VECTORS PASS, the published /arg standard is independently reproducible.`}</CodeBlock>

      <DocH2>10 · Decision request</DocH2>
      <ul style={listStyle}>
        <Li>RFC-004 v1 remains the minimum operational-log floor.</Li>
        <Li>
          RFC-006 v1 is the recommended profile for any sociedad-IA handling
          real value, regulated activity, or third-party funds. An RFC-006
          producer is RFC-004-conformant via the §5 projection, so citing
          RFC-006 does <strong>not</strong> fork the standard, it raises the
          floor while staying RFC-004-checkable.
        </Li>
        <Li>
          Suggested legislative language:{" "}
          <em>
            the operational log MUST satisfy RFC-004 v1; producers handling
            [regulated thresholds] MUST satisfy RFC-006 v1.
          </em>
        </Li>
      </ul>

      <DocH2>11 · Open questions</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>Projection route (v1.1).</strong> Normative path +
          content-type for the §8 projection export.
        </Li>
        <Li>
          <strong>Anchor cadence (v1.1).</strong> MUST-anchor interval and
          minimum external-notary properties (append-only proof, independence).
        </Li>
        <Li>
          <strong><DocCode>meta.governance</DocCode> enforcement.</strong>{" "}
          Should v1.1 make it MUST (lossless projection) rather than SHOULD?
        </Li>
        <Li>
          <strong>Key transparency.</strong> RFC-005 §8 carries over;
          anti-equivocation for the §7 key set is an RFC-007 candidate.
        </Li>
        <Li>
          <strong>Cross-chain reciprocity.</strong> Whether an RFC-003
          envelope wrapping an RFC-006 ledger carries native links or the §5
          projection.
        </Li>
      </ul>

      <DocH2>12 · Compliance with companions</DocH2>
      <DocP>
        <strong>RFC-001 §9 → RFC-006 §3-4.</strong> Append-only + signed;
        RFC-006 strengthens to chain-linked + anchored.
      </DocP>
      <DocP>
        <strong>RFC-004 → RFC-006 §5.</strong> Every RFC-006 ledger is an
        RFC-004 log via the normative projection; no client breakage.
      </DocP>
      <DocP>
        <strong>RFC-005 → RFC-006 §7.</strong> Asymmetric attestations on an
        RFC-006 ledger MUST use RFC-005 encoding / endpoint / keyId.
      </DocP>
      <DocP>
        Comments + counter-proposals welcome via{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={linkSty}
        >
          GitHub Discussions
        </a>
        . This is a draft; v1 finalization pins every test-vector value
        (already byte-exact in{" "}
        <DocCode>/test-vectors/rfc-006-v1.json</DocCode>).
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
