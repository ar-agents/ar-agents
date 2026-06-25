# @ar-agents/agentic-commerce-bridge

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
