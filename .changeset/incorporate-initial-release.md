---
"@ar-agents/incorporate": minor
---

Initial release. Zero-dependency TypeScript client for `/api/auto-incorporate`. One async `incorporate({...})` call returns the full incorporation kit (4 generated files, Vercel deploy URL, env-var manifest, legal checklist, signed audit-log reference). Plus `incorporateOrThrow`, `describe`, `fetchAudit` helpers. Works in Node 20+, Edge Runtime, Cloudflare Workers, Deno, browsers. 12 unit tests, publint + attw 🟢 across node10/node16/bundler. SLSA v1 provenance on publish.
