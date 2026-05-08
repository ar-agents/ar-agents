# @ar-agents/ap2

## 0.1.0 — Unreleased

First public release. Single-hop AP2 v0.2 implementation in TypeScript.

### Phase 2.1 — single-hop AP2

- All four mandate types per AP2 v0.2 spec:
  - `mandate.checkout.open.1` (Open Checkout Mandate)
  - `mandate.checkout.1` (Closed Checkout Mandate)
  - `mandate.payment.open.1` (Open Payment Mandate)
  - `mandate.payment.1` (Closed Payment Mandate)
- All eight constraint types: `checkout.allowed_merchants`,
  `checkout.line_items` (max-flow evaluation), `payment.agent_recurrence`,
  `payment.allowed_payees`, `payment.allowed_payment_instruments`,
  `payment.allowed_pisps`, `payment.amount_range`, `payment.budget`,
  `payment.execution_date`, `payment.reference`.
- ES256 (P-256 ECDSA) signing/verification — per spec, the inner
  `checkout_jwt` MUST use a non-deterministic scheme to defeat
  rainbow-table attacks against `checkout_hash`. Ed25519 is forbidden.
- SD-JWT VC primitives — disclosure encoding (RFC 9901), `_sd` digest
  computation, `sd_hash` (base64url(sha-256(SD-JWT))), compact
  serialization with single hop.
- KB-JWT (Key Binding JWT) — terminal hop carries `nonce`, `aud`, `iat`,
  `sd_hash` and is signed by the agent's `cnf.jwk`.
- Receipts — `CheckoutReceipt` and `PaymentReceipt` as plain JWTs signed
  by the verifier issuer; `reference` = `sd_hash` of the closed mandate.
- Verifier honors all canonical verification rules per AP2 §C: signature,
  time claims, `aud`/`nonce`, `transaction_id` ↔ `checkout_hash` linkage,
  per-mandate-type role checks. Unknown constraint types fail evaluation
  per spec.

### Phase 2.2 — planned

- Multi-hop chain support (`~~`-separated chains, RFC 7800 PoP key
  binding between hops, dSD-JWT delegation per `gco-delegate-sd-jwt`).
- W3C DC-API integration for hardware-backed signing (passkey-bound
  user-side mandates).
- Stateful budget tracking for `payment.budget + payment.agent_recurrence`
  (multi-presentation defense).
- x402 / PIX / SPEI payment-instrument bindings.
