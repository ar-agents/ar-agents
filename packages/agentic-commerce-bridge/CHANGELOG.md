# @ar-agents/agentic-commerce-bridge

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
