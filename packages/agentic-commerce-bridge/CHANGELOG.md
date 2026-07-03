# @ar-agents/agentic-commerce-bridge

## 10.0.0

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

### Patch Changes

- Updated dependencies [[`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea), [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea)]:
  - @ar-agents/facturacion@0.5.0
  - @ar-agents/ap2@0.3.0
  - @ar-agents/identity@0.9.3

## 9.0.0

### Patch Changes

- Updated dependencies [[`5c2ff8c`](https://github.com/ar-agents/ar-agents/commit/5c2ff8cc6f0063920ffb0ffe52bda86509c3baf8)]:
  - @ar-agents/identity@0.9.0
  - @ar-agents/facturacion@0.4.4

## 8.0.1

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

- Updated dependencies []:
  - @ar-agents/ap2@0.2.2
  - @ar-agents/facturacion@0.4.2
  - @ar-agents/identity@0.8.2
  - @ar-agents/mercadopago@0.18.3

## 8.0.0

### Patch Changes

- Updated dependencies [[`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95)]:
  - @ar-agents/facturacion@0.4.0

## 7.0.0

### Patch Changes

- Updated dependencies [[`8c58aa0`](https://github.com/ar-agents/ar-agents/commit/8c58aa061a7579a2854ee4239ceb698c92148f28)]:
  - @ar-agents/mercadopago@0.18.0

## 6.0.0

### Patch Changes

- Updated dependencies [[`ea61bf9`](https://github.com/ar-agents/ar-agents/commit/ea61bf999e540982f6b50443c127f757c15c8d7a)]:
  - @ar-agents/identity@0.8.0
  - @ar-agents/facturacion@0.3.2

## 5.0.0

### Patch Changes

- Updated dependencies [[`4aaaecc`](https://github.com/ar-agents/ar-agents/commit/4aaaecc4bab0429f61bd034b60c0c77607562b20)]:
  - @ar-agents/facturacion@0.3.0

## 4.0.0

### Patch Changes

- Updated dependencies [[`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e), [`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e)]:
  - @ar-agents/identity@0.7.0
  - @ar-agents/facturacion@0.2.0

## 3.0.0

### Minor Changes

- [`7b6bb8c`](https://github.com/ar-agents/ar-agents/commit/7b6bb8c550ee827fa3aa57e837b7948b81449b40) - Add `@ar-agents/ap2` — Agent Payments Protocol primitives, plus the bridge's optional `@ar-agents/agentic-commerce-bridge/integrations/ap2` helpers that verify and sign AP2 mandates inside a custom `PaymentProvider`.

  `@ar-agents/ap2` exposes the verification + signing surface for AP2 Closed Checkout Mandates and Payment Receipts. JWS over the canonical claims set, JWK key handling. Edge-Runtime safe (Web Crypto only).

  The bridge integration is opt-in: `@ar-agents/ap2` is declared as an optional peer dependency. Hosts that don't need AP2 don't pay the bundle cost.

### Patch Changes

- Updated dependencies [[`7b6bb8c`](https://github.com/ar-agents/ar-agents/commit/7b6bb8c550ee827fa3aa57e837b7948b81449b40)]:
  - @ar-agents/ap2@0.2.0

## 2.1.0

### Minor Changes

- [`9b8e83c`](https://github.com/ar-agents/ar-agents/commit/9b8e83ce6f291a24e00101830a49afceb0102920) - Expose the `/vercel-kv` subpath in `package.json` exports.

  The dist already shipped `vercel-kv.{js,cjs,d.ts}` from the previous release, but `exports` only declared the root entry — making `import { VercelKVStateAdapter } from "@ar-agents/agentic-commerce-bridge/vercel-kv"` resolve to a path-not-exported error.

  Fixes that. `typesVersions` updated for legacy resolvers.

### Patch Changes

- Updated dependencies [[`9b8e83c`](https://github.com/ar-agents/ar-agents/commit/9b8e83ce6f291a24e00101830a49afceb0102920)]:
  - @ar-agents/mercadopago@0.17.2

## 2.0.0

### Patch Changes

- Updated dependencies [[`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e), [`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e)]:
  - @ar-agents/identity@0.6.0
  - @ar-agents/mercadopago@0.17.1
  - @ar-agents/facturacion@0.1.2

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.17.0
