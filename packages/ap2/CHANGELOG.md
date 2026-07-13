# @ar-agents/ap2

## 0.3.1

### Patch Changes

- [#155](https://github.com/ar-agents/ar-agents/pull/155) [`f0bbf80`](https://github.com/ar-agents/ar-agents/commit/f0bbf804c96461f642a72e774c9207ed88e19daa) Thanks [@naza00000](https://github.com/naza00000)! - `decodeJwsUnverified()` now throws the package's typed `SdJwtError` when the
  JWS header or payload segment is not valid base64url-encoded JSON, instead of
  leaking a raw `SyntaxError` from `JSON.parse` on attacker-controlled input.
  `SdJwtError` moved to the crypto module (re-exported from its previous
  location), so the public surface is unchanged.

## 0.3.0

### Minor Changes

- [#140](https://github.com/ar-agents/ar-agents/pull/140) [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea) Thanks [@naza00000](https://github.com/naza00000)! - Correctness fixes across the live-integration adapters, each with a real-shape regression test.
  - **banking-bcra**: `getDebt` now parses the real BCRA `/Deudas` response, which nests entries under `results.periodos[].entidades` (the previous parser read a root-level `entidades` the endpoint never returns, so results came back empty). `DebtEntry.entidad` is now the bank **name** string to match the API (type change).
  - **treasury**: `fundTaxBuffer`'s default idempotency key now derives from stable inputs (obligation ids + required buffer) rather than the fx-dependent conversion output, so a retried call is correctly deduplicated by the off-ramp.
  - **facturacion**: the non-idempotent `FECAESolicitar` (CAE authorization) is no longer retried on timeout/5xx; numeric fields are validated at the client boundary before the request is built.
  - **ap2**: the multi-hop chain verifier now evaluates each Open Payment Mandate's constraints (budget/allowed-payee/execution-date) against the terminal Closed Payment Mandate, and `payment.budget`/`payment.agent_recurrence` are enforced via the budget tracker when one is supplied.
  - **agentic-commerce-bridge**: order totals now subtract discount/store-credit rows (previously added); a declined (402) payment is no longer cached under the Idempotency-Key so a retry can re-attempt; MP reconciliation requires the `external_reference` session binding.
  - **mercadolibre**: `iterateFeed` no longer leaves orphaned rejected promises on a chunk failure; `monitorReputation` re-throws on a 401/403 (revoked token) instead of polling indefinitely.
  - **whatsapp**: the non-idempotent `POST /messages` send is no longer retried (prevents duplicate sends); idempotent reads still retry.
  - **shipping**: non-idempotent Andreani create/cancel are no longer retried, and the adapter fails loudly when the carrier response omits the tariff/cancellation fields instead of reporting `costArs:0`/`canceled:true`.
  - **core**: the art. 102 risk classifier no longer downgrades a Spanish money verb + read-ish noun (e.g. `pagar_saldo`) to `read`; such names gate correctly.

## 0.2.2

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.2.1

### Patch Changes

- Vision mega-update: package descriptions aligned to the canonical framing (open infrastructure for Argentina's sociedades de IA), em dashes removed, mcp bundles 13 packages, incorporate points to ar-agents.ar.

## 0.2.0

### Minor Changes

- [`7b6bb8c`](https://github.com/ar-agents/ar-agents/commit/7b6bb8c550ee827fa3aa57e837b7948b81449b40) - Add `@ar-agents/ap2` — Agent Payments Protocol primitives, plus the bridge's optional `@ar-agents/agentic-commerce-bridge/integrations/ap2` helpers that verify and sign AP2 mandates inside a custom `PaymentProvider`.

  `@ar-agents/ap2` exposes the verification + signing surface for AP2 Closed Checkout Mandates and Payment Receipts. JWS over the canonical claims set, JWK key handling. Edge-Runtime safe (Web Crypto only).

  The bridge integration is opt-in: `@ar-agents/ap2` is declared as an optional peer dependency. Hosts that don't need AP2 don't pay the bundle cost.

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
