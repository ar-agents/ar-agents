# Conformance: RFC-004 / RFC-005 ⇄ Vultur `@vultur/core`

**Status:** analysis, 2026-05-17. **Tool:** [`arg-verify.mjs`](./arg-verify.mjs)
(zero-dependency, offline). **Result of `arg-verify vectors`:** 42/42 PASS — a
clean-room implementation written from the RFC text reproduces every published
RFC-004 HMAC, RFC-005 Ed25519, RFC-006 chain/anchor/projection, RFC-006 §8.1
export-bundle vector byte-for-byte, **and the RFC-006 §2 canonical-JSON domain
self-check** (pinned lexicographic form + out-of-domain rejection). The cited
standard is independently reproducible without trusting the reference
implementation.

This document exists because the **cited standard and the flagship
implementation are two different designs**, and a cited standard nobody's
flagship actually conforms to is worse than no standard. Naming the divergence
precisely, with a runnable checker, converts it from a credibility risk a
regulator discovers into a standards position we own.

## The two designs

### RFC-004 / RFC-005 (`/arg`, the cited standard)

Per-entry signed records. `OperationalLogEntry { id, sessionId, ts, tool,
governance, input, output?, errored?, durationMs?, hmac, signature? }`. The
HMAC is computed over the RFC-004 §3 canonical-JSON of the entry with `hmac`
and `signature` stripped; RFC-005 adds an additive Ed25519
`signature {keyId, alg, value}` (base64url) with public keys published at
`/.well-known/sociedad-ia/keys` and the §5 verification flow. Public
conformance vectors are published with DOIs; RFC-004 §12 formally requests
that legislation cite RFC-004 v1 as the minimum operational-log spec.
Reference impl: `apps/landing/src/lib/{audit,ed25519}.ts`.

### Vultur `@vultur/core` (the flagship implementation)

A linked HMAC **hash-chain**: `hash_n = HMAC-SHA256(secret, canonical({seq,
prevHash, societyId, actor, action, meta, ts}))`, `prevHash_n = hash_{n-1}`,
genesis `"GENESIS"`, appends serialized by a Postgres advisory lock, the
`AuditEvent` table physically `UPDATE`/`DELETE`-rejecting (DB-enforced
append-only). On top sits a separate `vultur.compliance.attestation`
document (dual HMAC + Ed25519, embedded SPKI key) and an **anchor chain**
with an optional external notary. Independent offline verifier:
`scripts/verify-attestation.mjs`.

## Mapping

| Concern | RFC-004/005 | Vultur `@vultur/core` | Status |
|---|---|---|---|
| Canonical-JSON | RFC-004 §3 hand-rolled, keys lexicographic (string-built) | `JSON.stringify(sort(v))` | **DIVERGES on integer-like keys** — byte-identical across the JSON domain EXCEPT objects with array-index keys (`"2"`,`"10"`): ECMAScript enumerates those numeric-first, so the producer emits `2,10` while RFC-006 §2 mandates lexicographic `10,2`. `arg-verify` (string-built) is the conformant reference; `vectors` pins it. Producer SHOULD avoid integer-like keys in `meta` or adopt a string-built canonicalizer. Out-of-domain values (`undefined`/function/non-finite/array-hole) are now **rejected**, not silently serialized into a forgeable string. |
| Symmetric primitive | HMAC-SHA256, `sha256:`+hex | HMAC-SHA256, `sha256:`+hex | **MATCHES** on primitive |
| Asymmetric primitive | Ed25519; sig **base64url**; SPKI key at `/.well-known/sociedad-ia/keys`; `keyId` + rotation list | Ed25519; sig **base64** (std); SPKI key at `/api/audit/pubkey`, embedded in attestation; no `keyId` | **DIVERGES** — same algorithm, different encoding + endpoint + no key rotation envelope |
| Unit of signing | Per-entry: each record independently signed over its own canonical form | Chain link: signature binds `seq ‖ prevHash ‖ payload`; integrity is the linked chain | **DIVERGES** (fundamental) |
| Entry shape | `{id, sessionId, ts, tool, governance, input, output, …}` | `{seq, prevHash, societyId, actor, action, meta, ts}` | **DIVERGES** — no `tool`/`sessionId`/`governance` |
| RFC-004 conformance vectors | MUST reproduce `/test-vectors/rfc-004-v1.json` | No `signEntry/verifyEntry` over the RFC entry shape | **DIVERGES — Vultur does not pass RFC-004 v1 as-is** |
| Tamper model | Per-entry tamper-evident | Per-entry **+ chain linkage** (insert/delete/reorder breaks subsequent links) **+ external anchor/notary** (defends against the operator itself) | **EXTENDS** — strictly stronger; unspecified by any current RFC |
| Append-only enforcement | Code constraint + append-only store | Code constraint **+ DB-enforced** (Postgres trigger) + advisory-lock linear `seq` | **EXTENDS** — DB-level > code-level |
| Independent offline verify | RFC-005 §5 flow | `verify-attestation.mjs` (zero-dep, offline) — but verifies the **attestation**, not RFC-004 entries | **PARTIAL** — real verifier, wrong shape relative to the cited vectors |
| Governance taxonomy (RFC-004 §6) | 4-class enum per entry → RFC-001 liability | not modeled (`actor/action/meta`) | **NOT IMPLEMENTED** |
| Retention (RFC-004 §7) | 180d min / 5y max | not modeled in `@vultur/core` | **NOT IMPLEMENTED** at the standard layer |
| Regulator export artifact | n/a (RFC-004 has no bundle) | `vultur-export-SLUG.json`: nested attestation + non-contiguous `createdAt` slice | **RESOLVED** — RFC-006 §8.1 + `arg-verify bundle` verify the bundle *as received* (Ed25519 + binding trust-free; recordsOnly with `--secret`); vector + tampered twin in `rfc-006-v1.json` |

## What this means

Vultur is **not** a drop-in RFC-004 emitter. Its native model is a
deliberate, strictly-stronger **profile** (hash-linked chain + DB-enforced
append-only + external anchoring). The risk is concrete and currently
invisible: a regulator who takes the cited RFC-004, downloads
`rfc-004-v1.json`, and runs the standard's own tool against a Vultur export
gets **"does not conform"**. That has to be resolved deliberately, not left
to discovery.

### Update 2026-05-17 — export-artifact verifiability gap closed

A second, narrower instance of the same "discovery risk" is now closed. The
verifier could check a hand-extracted attestation, but a regulator handed the
real `vultur-export-SLUG.json` bundle got failures: the attestation is nested
under `.attestation` (not top-level), and `auditEvents` is a non-contiguous
per-society slice keyed by `createdAt` (not `ts`). RFC-006 **§8.1** now makes
the bundle envelope + `createdAt→ts` mapping + recordsOnly slice + mandatory
attestation↔bundle binding normative, and `arg-verify bundle` verifies the
bundle *as received* — Ed25519 + binding trust-free, recordsOnly with the
operator secret, honest skip without it. A swapped-bundle attack (valid
attestation lifted onto a manipulated bundle) fails the binding. This is the
narrow, owed-anyway fix; the broader RFC-004 entry-shape divergence is still
addressed by the RFC-006 profile + §5 projection below.

### Update 2026-05-17 — canonical-JSON ambiguity found + closed

The independent verifier's new §2 self-check **caught a real
cross-implementation signature ambiguity**, the highest-severity class of
bug for a signed-data standard. For objects with integer-like string keys
(`{"2":…,"10":…}` — legal anywhere in `meta`), the producer model
`JSON.stringify(sort(v))` emits ECMAScript integer-index-first order
(`2,10`) while the normative rule is lexicographic (`10,2`). Same record →
two different canonical strings → two different HMAC/Ed25519 signatures: the
independent verifier would report a valid record as tampered, or an attacker
gains ordering wiggle-room. RFC-006 **§2** now states the domain (JSON model
only; out-of-domain rejected) and that ordering is lexicographic over the
key string, explicitly forbidding reliance on a runtime's array-index-first
enumeration; `arg-verify` (string-built) is the conformant reference and
`vectors` pins it. **Producer-side gap (documented, not silently masked):**
Vultur's `@vultur/core` `canonicalize()` is a product change and out of
scope here; real exposure is low (audit `meta` rarely uses integer-like
keys) but non-zero, so it is flagged for the producer to either avoid
integer-like `meta` keys or adopt a string-built canonicalizer. Finding a
latent forgery-class ambiguity *before* a regulator does, and owning it in
the spec + checker, is the entire point of this document.

## The fork (decision required)

1. **RFC-006 profile + RFC-004 export view — recommended.** Formalize
   Vultur's design as **RFC-006 "Hash-chained ledger + external anchoring
   profile (extends RFC-004)"** (RFC-004 §11 already lists exactly this as
   an open question, so it's owed-anyway work, not invented scope). Then add
   a thin **RFC-004 projection** to Vultur: an export endpoint that emits
   each chain link as an `OperationalLogEntry` carrying a per-entry HMAC over
   the RFC-004 canonical form. A regulator using the cited standard's tool
   gets a green check; the chain + anchor remain the stronger native
   guarantee. Cheapest, no rework of the strong model, makes "the flagship
   conforms to the cited standard" literally and verifiably true.
2. **Reconcile Vultur natively to RFC-004.** Re-shape `@vultur/core/audit`
   to emit `OperationalLogEntry` and pass the vectors. Strongest external
   story; but it is a product change (owned by a parallel session) and
   either drops or must re-layer the stronger chain guarantees.
3. **Bifurcate the citation.** Push legislation/standard to accept
   "RFC-004 *or* RFC-006." Least code, most political, weakest — asks the
   regulator to hold two standards.

Encoding nits to fix under **any** option (cheap, independent): align
Vultur's Ed25519 to RFC-005 — base64url (not base64), publish at
`/.well-known/sociedad-ia/keys`, carry a `keyId` + rotation list — so the
same `arg-verify entry` command works unchanged on a Vultur entry.

## Reproducing

```
node tools/arg-verify/arg-verify.mjs vectors      # 31/31 PASS expected
node tools/arg-verify/arg-verify.mjs attestation att.json [expectedPubKeyB64]
node tools/arg-verify/arg-verify.mjs entry e.json --secret S --keys keys.json
node tools/arg-verify/arg-verify.mjs bundle vultur-export-SLUG.json [--secret S]
```
