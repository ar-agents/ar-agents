# @ar-agents/agentic-commerce-bridge

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
