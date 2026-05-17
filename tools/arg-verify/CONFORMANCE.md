# Conformance: RFC-004 / RFC-005 ⇄ Vultur `@vultur/core`

**Status:** analysis, 2026-05-17 (adversarially hardened on branch
`claude/arg-verify-p0-hardening`). **Tool:** [`arg-verify.mjs`](./arg-verify.mjs)
(zero-dependency, offline). **Result of `arg-verify vectors`:** ALL PASS — a
clean-room implementation written from the RFC text reproduces every published
RFC-004 HMAC, RFC-005 Ed25519, and RFC-006 chain/anchor/projection vector
byte-for-byte, **including the post-red-team negative vectors**
(tail-truncation defeated only by the external anchor; records-only
non-guarantee; canonical domain throws). The cited standard is independently
reproducible without trusting the reference implementation.

> **Red-team closure (two rounds).** Round 1 (vs b97c15e) found 4 P0s:
> canonical could emit non-JSON / sort runtime-dependently; `verifyChain`
> accepted truncated/forged histories; projection not injective; governance
> default under-stated liability. Round 2 (vs the round-1 fix) found the
> fix had reintroduced the operator-defense hole in a new shape — a verified
> anchor chain signed with the *same* `AUDIT_SECRET` proves nothing against
> a key-holding operator (P0-A) — plus an out-of-domain crash (P0-B) and an
> incomplete string rule (P1-A). **All closed on this branch:** canonical is
> code-point-ordered, domain-restricted, rejects ill-formed UTF-16, and
> throws (never emits non-JSON); `verifyChain` rejects empty / non-genesis /
> non-contiguous / out-of-domain **without crashing**;
> `verifyChainAnchored` REQUIRES an external notary Ed25519 key independent
> of `AUDIT_SECRET` and rejects operator-forged / un-notarised anchors (no
> notary key ⇒ "not provable", never a pass); projection is 64-bit-id +
> string|null societyId + `requires-confirmation` default. RFC-006
> §2/§4/§5/§6 prose corrected. Vectors include forged-chain, no-notary-key,
> out-of-domain, empty, non-genesis, tail-truncation, records-only
> negatives — all PASS. See PR #7 thread.

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
| Canonical-JSON | RFC-004 §3 hand-rolled, keys sorted recursively | `JSON.stringify(sort(v))` | **MATCHES** — string-equivalent for JSON-safe values; `arg-verify` confirms both yield the §3 form |
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

## What this means

Vultur is **not** a drop-in RFC-004 emitter. Its native model is a
deliberate, strictly-stronger **profile** (hash-linked chain + DB-enforced
append-only + external anchoring). The risk is concrete and currently
invisible: a regulator who takes the cited RFC-004, downloads
`rfc-004-v1.json`, and runs the standard's own tool against a Vultur export
gets **"does not conform"**. That has to be resolved deliberately, not left
to discovery.

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
node tools/arg-verify/arg-verify.mjs vectors      # 14/14 PASS expected
node tools/arg-verify/arg-verify.mjs attestation att.json [expectedPubKeyB64]
node tools/arg-verify/arg-verify.mjs entry e.json --secret S --keys keys.json
```
