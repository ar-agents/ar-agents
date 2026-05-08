# AGENTS.md — `@ar-agents/ap2`

This file is for **AI agents and code-generation tools** integrating
`@ar-agents/ap2` at runtime or build time. Conforms to the
[agents.md convention](https://agents.md/).

## What this package does

`@ar-agents/ap2` is the first faithful TypeScript implementation of the
Agent Payments Protocol (AP2) v0.2. It implements:

- The four mandate types (Open + Closed × Checkout + Payment) as Zod schemas
- All ten constraint types with deterministic evaluators (max-flow for
  `checkout.line_items`)
- ES256 (P-256 ECDSA) sign/verify on top of `jose`
- SD-JWT VC primitives (RFC 9901): disclosures, `_sd` digests, `sd_hash`,
  compact serialization parser, KB-JWT build/verify
- The inner `checkout_jwt` with rainbow-table-defense (Ed25519 forbidden)
- Issuer factories + verifiers for each mandate type
- `CheckoutReceipt` + `PaymentReceipt` build/verify (plain JWTs)

## When to use

- A merchant facilitator needs to **verify an AP2 Closed Checkout Mandate**
  before completing a checkout. Use `verifyClosedCheckoutMandate` with the
  agent's public JWK as `issuerKey` and the merchant's own public JWK as
  `checkoutJwtKey`.
- A Credential Provider / MPP / network needs to **verify an AP2 Closed
  Payment Mandate** before authorizing a payment. Use
  `verifyClosedPaymentMandate` with `expectedTransactionId` set to the
  linked Closed Checkout Mandate's `checkout_hash`.
- An agent or Trusted Surface needs to **issue mandates** for direct flows.
  Use `issueOpenCheckoutMandate` / `issueClosedCheckoutMandate` /
  `issueOpenPaymentMandate` / `issueClosedPaymentMandate`.
- Anyone needs to **issue or verify a CheckoutReceipt / PaymentReceipt**
  after a successful (or failed) completion. The receipt's `reference`
  field is the `sd_hash` of the closed mandate it confirms — always pass
  the value returned in `verificationOutcome.sdHash`.

## When NOT to use

- The host needs **multi-hop delegated chains** (Trusted Agent Provider
  model with `~~`-separated SD-JWT presentations + per-hop `cnf.jwk` PoP
  binding). Wait for Phase 2.2.
- The host needs the **inner `checkout_jwt` to use Ed25519** — it cannot,
  per spec. ES256 is the canonical choice. ES384, ES512, and RS256 are
  also accepted (all are non-deterministic).
- The host wants **stateful budget tracking** for `payment.budget` /
  `payment.agent_recurrence`. Phase 2.1 ships the interface but the
  default in-memory tracker lands in Phase 2.2.

## Tool selection guidance

When wiring AP2 into a host that already uses `@ar-agents/*`:

```
host
 ├── @ar-agents/ap2                    ← THIS package
 ├── @ar-agents/agentic-commerce-bridge ← ACP merchant facilitator (optional)
 ├── @ar-agents/mercadopago            ← MP toolkit (issues PaymentReceipts)
 ├── @ar-agents/identity               ← CUIT + ARCA padrón (AR fiscal context)
 └── @ar-agents/facturacion            ← AFIP factura electronica (post-receipt)
```

The recommended pattern for an Argentine-fiscal-compliant AP2 merchant:

1. Verify the AP2 Closed Checkout Mandate via this package.
2. Bridge converts the verified payload into ACP `CheckoutSession` shape.
3. On `complete`, the bridge's `onOrderConfirmed` hook (powered by
   `@ar-agents/facturacion`) issues a Factura A/B/C/E.
4. After successful payment, this package builds the `PaymentReceipt`
   with `reference` = `sdHash` of the closed Payment Mandate. Optionally
   include the AFIP CAE in `psp_confirmation_id` for evidentiary use in
   future disputes.

## Result schemas worth memorizing

### Verification outcome

Every `verify*` function returns this shape:

```ts
type VerificationOutcome<T> =
  | { ok: true; mandate: T; sdHash: string }
  | {
      ok: false;
      code: "invalid_credential" | "invalid_mandate" | "unresolved_constraint" | "mandates_not_supported";
      reason: string;
    };
```

The `sdHash` is what you put in the receipt's `reference`. The `code`
maps directly to AP2's canonical error codes per spec §G.

### Mandate `vct` strings (exact-match)

Don't invent your own — match these character-for-character:

- `mandate.checkout.open.1`
- `mandate.checkout.1`
- `mandate.payment.open.1`
- `mandate.payment.1`

If a future v0.3 introduces `mandate.checkout.2`, treat it as a
different schema (downgrade-attack defense).

### `transaction_id` ↔ `checkout_hash` rule

The Closed Payment Mandate's `transaction_id` MUST equal the Closed
Checkout Mandate's `checkout_hash`. The verifier checks this via
`expectedTransactionId`. **You — the host — must pass it.** It's how
AP2 binds payments to checkouts.

## Latency expectations

| Operation | Budget | Notes |
|---|---|---|
| Sign mandate (issuer + KB-JWT) | < 30ms | dominated by ES256 sign × 2 |
| Verify mandate (no constraints) | < 20ms | ES256 verify + JSON parse |
| Verify mandate (10 constraints, line_items max-flow) | < 50ms | max-flow over <10 cart × <10 constraint items |
| Build receipt | < 10ms | single ES256 sign |
| Verify receipt | < 10ms | single ES256 verify |

## Constraints

- **`checkout_jwt` MUST use ECDSA.** Passing `alg: "EdDSA"` to
  `signCheckoutJwt` throws `CheckoutJwtAlgError`. Default is ES256.
- **`exp` is RECOMMENDED for autonomous flows** — set
  `iat + (minutes the agent needs to complete the task)` and let the
  default 30s clock tolerance handle drift.
- **Always supply nonce + audience for KB-JWTs.** The verifier checks
  exact equality. Don't reuse nonces across requests.
- **`generateSalt()` returns >=16 bytes of base64url entropy.** Don't use
  a deterministic salt — it defeats RFC 9901's selective-disclosure
  privacy goal.
- **`_sd_alg` is sha-256 in v0.1.** sha-384 / sha-512 ship in Phase 2.2.

## Side effects

This package is pure crypto. There are NO network calls. NO state
persistence. The `BudgetTracker` interface IS stateful but the v0.1
default is a no-op pass-through.

## Reasoning hints for agents writing host code

- Use `generateAp2KeyPair("ES256")` once at app startup. Persist private
  keys via your secret manager (Vercel KMS, AWS KMS, etc.). The public
  JWK is what you publish at your JWKS endpoint or pass as `cnf.jwk`.
- For CRITICAL paths (real money), wire `clockTolerance: 0` in production
  to reject any future-iat / past-exp mandates.
- For receipt-signing keys, rotate every 90 days per CSA STRIDE
  recommendations (`docs/ap2/security_and_privacy_considerations.md`).
- The `sdHash` returned by `verifyClosedCheckoutMandate` is the canonical
  receipt-reference. Compute it once, store it, link your DB row to it.
- When integrating with `@ar-agents/agentic-commerce-bridge`, expose
  `mandate.checkout.1` via a custom `payment_data.instrument.credential`
  with `type: "ap2_mandate"` and the closed mandate's compact SD-JWT
  presentation as `token`. Phase 2.2 will ship a built-in
  `createAp2PaymentProvider` for this; for now wire it manually.

## See also

- [`README.md`](./README.md) — full quickstart + spec deviations
- [`CHANGELOG.md`](./CHANGELOG.md) — Phase 2.1 → 2.2 → 2.3 roadmap
- [AP2 spec (Google + FIDO)](https://github.com/google-agentic-commerce/AP2)
- [agents.md convention](https://agents.md/)
