---
"@ar-agents/agentic-commerce-bridge": minor
---

Expose the `/vercel-kv` subpath in `package.json` exports.

The dist already shipped `vercel-kv.{js,cjs,d.ts}` from the previous release, but `exports` only declared the root entry — making `import { VercelKVStateAdapter } from "@ar-agents/agentic-commerce-bridge/vercel-kv"` resolve to a path-not-exported error.

Fixes that. `typesVersions` updated for legacy resolvers.
