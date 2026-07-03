# @ar-agents/incorporate

## 0.3.0

### Minor Changes

- [#151](https://github.com/ar-agents/ar-agents/pull/151) [`45c0ed8`](https://github.com/ar-agents/ar-agents/commit/45c0ed8d5dfa40b52023e10dca92a78801f66a52) Thanks [@naza00000](https://github.com/naza00000)! - Add a default per-request timeout to the `incorporate` / `describe` / `fetchAudit` client calls (SDK-audit P1 — the "no timeout on ar-agents.ar" finding).

  Each call now composes an `AbortSignal.timeout` (default 30s, configurable via the new `timeoutMs` option) with the caller's optional `signal`, so a hung `ar-agents.ar` can no longer block the agent forever. This stays **dependency-free on purpose** — `@ar-agents/incorporate` is a deliberately thin, zero-dep wrapper around a first-party endpoint, so it keeps its own tiny transport rather than pulling in `@ar-agents/core`'s `HttpClient` (unlike the third-party adapters). No behavior change beyond the timeout; existing callers are unaffected.

## 0.2.1

### Patch Changes

- Vision mega-update: package descriptions aligned to the canonical framing (open infrastructure for Argentina's sociedades de IA), em dashes removed, mcp bundles 13 packages, incorporate points to ar-agents.ar.

## 0.2.0

### Minor Changes

- [`d7ea25d`](https://github.com/ar-agents/ar-agents/commit/d7ea25d1e9eb25770311937665b9c236e8e7d4e7) - Initial release. Zero-dependency TypeScript client for `/api/auto-incorporate`. One async `incorporate({...})` call returns the full incorporation kit (4 generated files, Vercel deploy URL, env-var manifest, legal checklist, signed audit-log reference). Plus `incorporateOrThrow`, `describe`, `fetchAudit` helpers. Works in Node 20+, Edge Runtime, Cloudflare Workers, Deno, browsers. 12 unit tests, publint + attw 🟢 across node10/node16/bundler. SLSA v1 provenance on publish.
