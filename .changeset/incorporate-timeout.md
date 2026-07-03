---
"@ar-agents/incorporate": minor
---

Add a default per-request timeout to the `incorporate` / `describe` / `fetchAudit` client calls (SDK-audit P1 — the "no timeout on ar-agents.ar" finding).

Each call now composes an `AbortSignal.timeout` (default 30s, configurable via the new `timeoutMs` option) with the caller's optional `signal`, so a hung `ar-agents.ar` can no longer block the agent forever. This stays **dependency-free on purpose** — `@ar-agents/incorporate` is a deliberately thin, zero-dep wrapper around a first-party endpoint, so it keeps its own tiny transport rather than pulling in `@ar-agents/core`'s `HttpClient` (unlike the third-party adapters). No behavior change beyond the timeout; existing callers are unaffected.
