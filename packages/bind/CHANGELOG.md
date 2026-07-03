# @ar-agents/bind

## 0.3.0

### Minor Changes

- [#150](https://github.com/ar-agents/ar-agents/pull/150) [`80db3cc`](https://github.com/ar-agents/ar-agents/commit/80db3ccd99611867997efbef3cc8e3edfe811a69) Thanks [@naza00000](https://github.com/naza00000)! - Migrate `HttpBindAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 [#14](https://github.com/ar-agents/ar-agents/issues/14)).

  Every BIND APIBANK call now runs through the shared client: timeout, backoff retry, `429`/`Retry-After`, and typed errors. The JWT auth flow (literal `JWT <token>` scheme, lazy login, 60s-early refresh, retry-once-on-401) is preserved, now expressed against the client's typed errors. Responses are **schema-validated** against the package's own zod schemas (accounts, movements, ownership, transfer/DEBIN results, echeqs): a malformed body on the irreversible-transfer surface now resolves to a structured `{ ok: false, code: "api_error" }` instead of being blind-cast into a fabricated `{ ok: true }` success.

  Idempotency is safe by construction: the money `POST`s (TRANSFER / DEBIN) and login are non-idempotent and are **never auto-retried**; only idempotent GET reads retry a transient 5xx. HTTP errors map to `api_error` (with the upstream status); network/timeout failures map to `network_error` — same structured `BindResult` envelope as before. The `fetchImpl`/`baseUrl`/`timeoutMs`/`bankId`/`viewId` options are unchanged.

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.0

### Minor Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.
