# @ar-agents/mi-argentina

## 0.3.0

### Minor Changes

- [#152](https://github.com/ar-agents/ar-agents/pull/152) [`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab) Thanks [@naza00000](https://github.com/naza00000)! - Migrate the OIDC transport onto the shared `HttpClient` from `@ar-agents/core`. Every network call — token exchange, refresh, userinfo, JWKS, and discovery — was previously an entirely un-timed raw `fetch`; a hung Mi Argentina socket would hang the whole login flow forever. All calls now run through `HttpClient` with a 10s timeout and typed error mapping. The token and userinfo responses are validated against zod schemas, so a partial/proxy-mangled JSON 200 body that drops the required fields now fails LOUD with `ArAgentsResponseValidationError` instead of being blind-cast into a clean-looking `TokenResponse` with `accessToken: ""` or a profile with `sub: ""`; a non-JSON body (an HTML error/maintenance page served with a 200) fails loud even earlier, rejected by the client before the schema runs. Token grants (code exchange + refresh) are one-shot: retry is disabled so a transient 5xx never re-submits and burns the `authorization_code`/`refresh_token` server-side. Core errors are mapped back to the existing taxonomy — 401/403 and HTTP statuses keep the operation's `*_failed` code (carrying status + body in `details`), while network/timeout maps to `network_error`. JWT signature verification (Web Crypto) is unchanged; only the HTTP fetch of JWKS gained a timeout.

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.2

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.2.1

### Patch Changes

- Vision mega-update: package descriptions aligned to the canonical framing (open infrastructure for Argentina's sociedades de IA), em dashes removed, mcp bundles 13 packages, incorporate points to ar-agents.ar.

## 0.2.0

### Minor Changes

- [`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep — final wave: every remaining OG package now extends
  `ArAgentsError` from `@ar-agents/core`.

  After this release, **23 of 26 `@ar-agents/*` packages** share the
  uniform `{ code, retryable, context }` family contract. The three
  packages still on plain `Error` (`agentic-commerce-bridge`, `ap2`,
  `mcp`) have no dedicated `errors.ts` module — they throw `Error`
  inline at the call site; their lift is a deeper refactor tracked
  separately.

  For all 12 packages here: backward compatible. Public constructors,
  field names, and `instanceof` checks unchanged. New: `error.retryable`
  flag wired per code (e.g. `wsfe_service_unavailable: true`,
  `bcra_rate_limited: true`, `discovery_failed: true`, `ckan_unreachable:
true`, `fetcher_unreachable: true`, `shipping_carrier_error: true`);
  non-transient codes default to `retryable: false`.

  One **internal-API** rename in `@ar-agents/whatsapp`: `WhatsAppApiError.code`
  (previously the Meta numeric error code) is now exposed as
  `WhatsAppApiError.metaCode` so the family-uniform `code: string`
  contract (`whatsapp_meta_<n>`) can sit on the same instance. Callers
  that read `err.code` as a number must migrate to `err.metaCode`; the
  deserialized webhook event field `event.errors[i].code` is unchanged
  (still numeric, since it's not a `WhatsAppApiError` instance).

  Family-coherence count after this release: **23 / 26 packages**.

## 0.1.0

### Minor Changes

- Initial release. Mi Argentina (Argentine government OIDC) as a drop-in tool collection for the Vercel AI SDK 6.
  - `MiArgentinaClient` — Edge-Runtime-friendly OIDC client (PKCE S256, RS256 ID-token verification, JWKS caching, refresh, end-session).
  - `miArgentinaTools` — 5 tools: `start_login`, `complete_login`, `get_user_profile`, `verify_id_token`, `refresh_token`.
  - `InMemoryStateAdapter` for dev/tests; `VercelKVStateAdapter` for prod.
  - Web Crypto only — no `node:crypto` dependency.
  - Provider presets `miargentina` and `miargentina_sandbox` plus `custom` for sandboxes / other AR OIDC providers.
  - OIDC discovery via `.well-known/openid-configuration`.
