# /arg operational-log conformance registry

The artifact RFC-004 §8 / RFC-005 §7 / RFC-006 §9 point implementers at. To
claim conformance: reproduce the published vectors with the independent
verifier, then add a row here with a link to your test run.

- **Standard:** RFC-004 (HMAC operational log) · RFC-005 (Ed25519 asymmetric
  upgrade) · RFC-006 (hash-chained ledger + external anchoring profile,
  projects onto RFC-004).
- **Independent verifier:** `tools/arg-verify/arg-verify.mjs` — zero
  dependency, offline, clean-room (does not import any implementation).
- **How to reproduce every claim below:**
  `node tools/arg-verify/arg-verify.mjs vectors`

Honesty policy: this registry states exactly what was verified and how, and
flags every known divergence in plain language. A regulator should be able to
trust a green row and see precisely what a partial row does not yet cover.

## Registry

| Implementation | RFC-004 | RFC-005 | RFC-006 | Verified by | Date | Evidence |
|---|---|---|---|---|---|---|
| **`arg-verify` (clean-room verifier)** | ✓ 10/10 | ✓ 4/4 | ✓ 12/12 | self (independent reimplementation vs published vectors) | 2026-05-17 | `arg-verify vectors` → `ALL VECTORS PASS` |
| **`/arg` reference impl** — `apps/landing/src/lib/{audit,ed25519}.ts` | ✓ | ✓ | n/a (per-entry reference, not the chain profile) | published vectors + repo `apps/landing/test/rfc-00{4,5}-vectors.test.ts` | 2026-05-17 | byte-exact vectors reproduced clean-room by `arg-verify` |
| **Vultur `@vultur/core`** (flagship producer) | ✓ via RFC-006 §5 projection | ✗ encoding/endpoint divergence | ◐ profile-conformant by design; runtime export check pending | code inspection + `rfc-006-v1.json` derived from `@vultur/core/{audit,anchor}.ts`; projection proven by `arg-verify` | 2026-05-17 | see notes |

### Vultur `@vultur/core` — precise status

- **RFC-004: ✓ via projection.** Vultur's native model is a hash-chain, not
  per-entry RFC-004 records, so it does **not** pass RFC-004 vectors
  directly. RFC-006 §5 defines a normative deterministic projection
  `P(link) → OperationalLogEntry`; `arg-verify vectors` proves every
  projected entry passes RFC-004 §3 `verifyEntry`. A regulator running
  RFC-004 tooling against a projection export gets a green check. The
  projection export endpoint (RFC-006 §8) is specified; wiring it into the
  live product is tracked in the project.
- **RFC-005: ✗ (known, specified fix).** Vultur's Ed25519 attestation uses
  standard base64, an embedded key at `/api/audit/pubkey`, and no `keyId`;
  RFC-005 requires base64url, a key set at `/.well-known/sociedad-ia/keys`,
  and `keyId` + rotation. This is a pure encoding/endpoint change, fully
  specified in RFC-006 §7 and `tools/arg-verify/CONFORMANCE.md`. Until
  aligned, `arg-verify entry --keys` cannot verify a Vultur attestation
  unchanged.
- **RFC-006: ◐ profile-conformant by design.** The `rfc-006-v1.json`
  vectors model is derived directly from `@vultur/core/{audit,anchor}.ts`
  (link payload `{seq,prevHash,societyId,actor,action,meta,ts}`, HMAC chain,
  anchor sub-chain), and `arg-verify` reproduces every value. Full runtime
  conformance — running a real Vultur chain/attestation export through
  `arg-verify chain` / `arg-verify project` — is pending an exported fixture
  (the live secret + export are out of scope of this verifier by design;
  zero-trust verification needs only the export, not the running system).

### What "◐" means here

Partial: the design and the derived vectors conform and are independently
reproduced, but an end-to-end run against a live production export has not
yet been recorded in this registry. Upgrade to ✓ by committing a real
exported fixture and the `arg-verify chain`/`project` output that verifies
it.

## Adding your implementation

1. Run `node tools/arg-verify/arg-verify.mjs vectors` against the published
   vectors. All must pass.
2. For a producer: export a real ledger/attestation and verify it with
   `arg-verify chain` / `arg-verify project` / `arg-verify entry`.
3. Open a PR adding a row with: implementation name, the three columns
   (✓ / ◐ / ✗ with one-line precision), verifier + date, and a link to the
   reproducible evidence (CI log, fixture, or command output).
4. Divergences are welcome in the table as long as they are stated
   precisely. A documented ✗ is more useful to a regulator than a vague ✓.
