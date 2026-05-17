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
      subtitle="RFC-004 makes each entry tamper-evident. It does not prove the set of entries is complete and ordered, nor defend the log when the adversary is the operator. RFC-006 is the profile that does both — and it stays RFC-004-checkable by a normative projection, so raising the floor does not fork the standard."
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
          <strong>Author:</strong> Naza (
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
          (operational-log spec — the base this profile extends),{" "}
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
          <DocCode>vectors</DocCode> — zero dependency, offline).
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
          <strong>Defensibility when the adversary is the operator.</strong> A
          per-link HMAC is computed with the operator&apos;s key; the
          key-holder can re-sign a rewritten history. The chain alone does{" "}
          <em>not</em> solve this (see §4.0) — only the external anchor (§6)
          does, and only relative to the last notarized checkpoint. RFC-006
          states this honestly rather than claiming more.
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

      <DocH2>2 · Canonical-JSON (normative — RFC-006 tightens RFC-004 §3)</DocH2>
      <DocP>
        A standard whose signature predicate is runtime-dependent cannot
        anchor liability law, so RFC-006 <strong>tightens</strong> RFC-004 §3
        into a form two independent implementations cannot disagree on:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Code-point key ordering (MUST).</strong> Object keys order
          by Unicode code point, not UTF-16 code unit. JavaScript&apos;s
          default <DocCode>Array.sort()</DocCode> is code-unit and disagrees
          with Python / Go / RFC-8785 on astral-plane keys — a silent
          cross-implementation divergence that would produce false
          &quot;tampered&quot;.
        </Li>
        <Li>
          <strong>Restricted signable domain (MUST).</strong> Only{" "}
          <DocCode>string</DocCode>, <DocCode>boolean</DocCode>,{" "}
          <DocCode>null</DocCode>, finite safe-integer{" "}
          <DocCode>number</DocCode>, and arrays / plain objects thereof are
          canonicalizable. Floats, non-finite, &gt; 2^53,{" "}
          <DocCode>undefined</DocCode>, functions, symbols are out of domain
          and <DocCode>canonical()</DocCode> <strong>MUST throw</strong> — it
          MUST NEVER emit non-JSON (
          <DocCode>{`{"a":[1,,2]}`}</DocCode>, a bare{" "}
          <DocCode>undefined</DocCode>, <DocCode>NaN</DocCode>→
          <DocCode>null</DocCode>).
        </Li>
        <Li>
          <strong>Well-formed UTF-16 (MUST).</strong> A lone surrogate is
          out of domain and <DocCode>canonical()</DocCode> MUST throw on it.
          JS <DocCode>JSON.stringify</DocCode> would silently sign{" "}
          <DocCode>&quot;\uD800&quot;</DocCode>, but Go / Python / RFC-8785
          reject or re-encode it → cross-implementation HMAC divergence. v1
          does <em>not</em> claim full RFC-8785 string escaping (that is
          v1.1); restricting to well-formed strings + the safe-integer
          number domain is what makes v1 runtime-independent.
        </Li>
      </ul>
      <DocP>
        The reference producer&apos;s{" "}
        <DocCode>JSON.stringify(sort(v))</DocCode> is conformant{" "}
        <em>only within this domain and with code-point ordering</em>.
        Generator and <DocCode>arg-verify</DocCode> reimplement this exact form
        so they cannot drift. Full RFC-8785 (JCS) number/string
        canonicalization is the v1.1 cross-language target; v1 achieves
        runtime independence by restricting the domain.
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
        <DocCode>sha256:</DocCode> prefix — that is RFC-004&apos;s per-entry
        convention, not the chain convention). <DocCode>meta</DocCode> is
        normalized to <DocCode>null</DocCode> when absent before
        canonicalization so sign and verify agree. The only permitted mutation
        primitive is <DocCode>append</DocCode>; TTL-purge for RFC-004 §7
        retention is the sole destructive exception and it purges whole
        prefixes, never interior links.
      </DocP>

      <DocH2>4 · Chain verification (normative)</DocH2>
      <DocP>
        <strong>4.0 What the chain does NOT prove (read first).</strong> A
        passing contiguous chain proves the records are unmutated, linked, and
        ordered. It does <strong>not</strong>, by itself, defend against the
        key-holding operator: that operator can <strong>tail-truncate</strong>{" "}
        (drop recent links) or <strong>wholesale-rewrite</strong> from genesis,
        and a bare verifier returns <DocCode>valid:true</DocCode> for the
        resulting clean prefix / fresh history. Completeness against the
        operator is provable <em>only</em> via a verified external anchor
        (§6). Implementations MUST NOT advertise operator-defense from the
        chain alone.
      </DocP>
      <DocP>
        <strong>4.1 Contiguous chain (interior integrity).</strong> A verifier
        MUST reject a non-array or <strong>empty</strong> input, MUST require{" "}
        <DocCode>links[0].seq === 1</DocCode> and{" "}
        <DocCode>links[0].prevHash === &quot;GENESIS&quot;</DocCode> (rejecting
        a truncated head / non-rooted slice), and for every{" "}
        <DocCode>i</DocCode> assert (1){" "}
        <DocCode>seq_i == seq_&#123;i-1&#125; + 1</DocCode>; (2){" "}
        <DocCode>prevHash_i == hash_&#123;i-1&#125;</DocCode>; (3){" "}
        <DocCode>hash_i == HMAC(secret, canonical(payload_i))</DocCode>.
      </DocP>
      <DocP>
        <strong>4.2 Anchored verification (operator-defense).</strong>{" "}
        <DocCode>verifyChainAnchored</DocCode>: §4.1 passes, the anchor chain
        (§6) verifies, and the chain head equals the head covered by the{" "}
        <em>latest verified anchor</em>. With no anchors the result is{" "}
        <DocCode>valid:false</DocCode> (&quot;operator-defense not
        provable&quot;) — never a misleading pass.
      </DocP>
      <DocP>
        <strong>4.3 Per-record (non-contiguous slice).</strong> A filtered
        view (one society pulled from a global chain) asserts only check (3)
        per record and MUST label the result{" "}
        <DocCode>recordsOnly: true</DocCode> — per-record authenticity{" "}
        <em>and explicitly NOT</em> set-completeness; it MUST NOT be presented
        as a completeness proof.
      </DocP>

      <DocH2>5 · RFC-004 projection (normative — the conformance bridge)</DocH2>
      <DocP>
        An RFC-006 producer is RFC-004-conformant <strong>by construction</strong>{" "}
        via this deterministic projection <DocCode>P</DocCode>. Given chain
        link <DocCode>L</DocCode>:
      </DocP>
      <CodeBlock>{`id         := \`\${L.ts}-\${L.hash.slice(0,16)}\`     // 64-bit (was 8/32-bit)
societyId  := MUST be string | null. Any other type → REJECT (no
                String() coercion: 1 and "1" must not collide).
                "GLOBAL-LEDGER" and any "soc-"-prefixed string are
                RESERVED, forbidden as a tenant societyId.
sessionId  := /^[A-Za-z0-9_-]{8,64}$/ string → that string
              null                            → "GLOBAL-LEDGER"
              other valid string              → "soc-" +
                                base64url(sha256(societyId)).slice(0,16)
ts         := L.ts
tool       := L.action
governance := L.meta.governance if it is an RFC-004 §6 value;
              else "requires-confirmation"   (liability-safe; see below)
input      := { actor: L.actor, seq: L.seq, meta: L.meta ?? null }
              (+ governanceInferred:true when governance was defaulted)
output     := (omitted)
hmac       := "sha256:" + HMAC_SHA256( PROJECTION_SECRET,
                            canonical(stripForSign(P(L))) )`}</CodeBlock>
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
          <strong>Injectivity.</strong> <DocCode>P</DocCode> is injective over
          distinct <DocCode>(societyId|null, seq)</DocCode>:{" "}
          <DocCode>input.seq</DocCode> is the load-bearing disambiguator and{" "}
          <DocCode>id</DocCode> embeds 64 bits of <DocCode>hash</DocCode> (the
          earlier 32-bit id had a birthday collision at ~77k same-
          <DocCode>ts</DocCode> links and is fixed here).
        </Li>
        <Li>
          <strong>Liability-safe default (MUST).</strong> A producer{" "}
          <strong>MUST</strong> carry <DocCode>meta.governance</DocCode>. When
          absent, <DocCode>P</DocCode> defaults to{" "}
          <DocCode>requires-confirmation</DocCode> — the{" "}
          <em>most operator-onerous</em> class — and sets{" "}
          <DocCode>input.governanceInferred = true</DocCode>. RFC-006 does{" "}
          <strong>not</strong> default to <DocCode>audit-logged</DocCode>: per
          RFC-004 §6 that class <em>shares</em> liability with the LLM
          provider and would under-state operator exposure for a real
          human-confirmed action.
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

      <DocH2>6 · External anchoring (normative — MUST for operator-defense)</DocH2>
      <DocP>
        The producer <strong>MUST</strong> periodically checkpoint the chain
        head into an <strong>anchor</strong>; anchors form their own
        HMAC-signed chain:
      </DocP>
      <CodeBlock>{`interface Anchor {            // body = the 5 fields below ONLY
  seq, headSeq, headHash, prevAnchor, ts
  signature:   HMAC_SHA256( AUDIT_SECRET, canonical(body) ) hex   // operator
  notarySig:   Ed25519( NOTARY_PRIV,      canonical(body) ) b64u  // external
  notaryKeyId: resolves in the external notary key set
}
prevAnchor_n = signature_{n-1}`}</CodeBlock>
      <DocP>
        <strong>The operator HMAC <DocCode>signature</DocCode> alone proves
        nothing against a key-holding operator</strong> (red-team P0-A): an
        operator that holds <DocCode>AUDIT_SECRET</DocCode> forges the chain{" "}
        <em>and</em> mints a consistent anchor chain. Operator-defense MUST
        rest on <DocCode>notarySig</DocCode> — an Ed25519 signature by an
        external notary whose private key the operator does{" "}
        <strong>not</strong> control. A conformant{" "}
        <DocCode>verifyChainAnchored</DocCode>: (1) mirrors §4.1 on the anchor
        chain; (2) <strong>MUST be supplied the notary public key
        out-of-band</strong>, independent of <DocCode>AUDIT_SECRET</DocCode>{" "}
        — <strong>no notary key ⇒ operator-defense NOT provable ⇒ return
        invalid</strong>, never a pass; (3) MUST verify{" "}
        <DocCode>notarySig</DocCode> on <em>every</em> anchor (not just the
        latest — defeats a spliced forged tail); (4) requires the chain head
        to equal the latest <em>notarised</em> anchor&apos;s{" "}
        <DocCode>(headSeq, headHash)</DocCode>. The notary itself MUST be
        append-only with an independently checkable non-removal proof,
        outside the operator&apos;s unilateral control, and independently
        fetchable. Operator-defense holds <em>only</em> up to the most recent
        notarised head; anything newer is within the operator&apos;s tamper
        window and is provisional.
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
          <DocCode>GET /api/audit/verify</DocCode> — contiguous-chain
          verification result.
        </Li>
        <Li>
          <DocCode>GET /api/audit/anchor</DocCode> — the anchor chain for §6
          verification.
        </Li>
        <Li>
          <DocCode>GET /api/audit/&#123;slug&#125;/attestation</DocCode> — the
          §7 attestation.
        </Li>
        <Li>
          A <strong>projection export</strong> emitting{" "}
          <DocCode>P(L)</DocCode> so a regulator runs RFC-004 tooling
          unchanged. RFC-006 v1.1 normative-izes the exact route; v1 requires
          only that such an export exists and is documented.
        </Li>
      </ul>

      <DocH2>9 · Conformance test vectors</DocH2>
      <DocP>
        <DocCode>
          <a href="/test-vectors/rfc-006-v1.json" style={linkSty}>
            /test-vectors/rfc-006-v1.json
          </a>
        </DocCode>{" "}
        contains, with byte-exact deterministic outputs: a genesis-rooted
        3-link chain; a mutated copy (fails at the mutated{" "}
        <DocCode>seq</DocCode>); a deleted-interior copy (fails
        contiguity/linkage); a <strong>tail-truncated</strong> copy where the
        bare chain passes (a clean prefix — §4.0) <em>but</em>{" "}
        <DocCode>verifyChainAnchored</DocCode> rejects it; a{" "}
        <strong>records-only</strong> non-contiguous slice (authentic yet
        explicitly not a completeness proof, §4.3); a 2-anchor chain; and the
        exact <DocCode>P(L)</DocCode> + RFC-004 <DocCode>hmac</DocCode> for
        every link (the verifier reproduces <DocCode>P(L)</DocCode> itself,
        not the supplied one). All MUST reproduce and pass RFC-004 §3{" "}
        <DocCode>verifyEntry</DocCode>. Run:
      </DocP>
      <CodeBlock>{`node tools/arg-verify/arg-verify.mjs vectors
# RFC-004 + RFC-005 + RFC-006 (incl. anchored, tail-truncation,
# records-only negative vectors): ALL VECTORS PASS — the published
# /arg standard is independently reproducible, adversarially hardened.`}</CodeBlock>

      <DocH2>10 · Decision request</DocH2>
      <ul style={listStyle}>
        <Li>RFC-004 v1 remains the minimum operational-log floor.</Li>
        <Li>
          RFC-006 v1 is the recommended profile for any sociedad-IA handling
          real value, regulated activity, or third-party funds. An RFC-006
          producer is RFC-004-conformant via the §5 projection, so citing
          RFC-006 does <strong>not</strong> fork the standard — it raises the
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
