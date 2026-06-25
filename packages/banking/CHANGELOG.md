# @ar-agents/banking

## 0.5.2

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.5.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.5.0

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

## 0.4.0

### Minor Changes

- [`4aaaecc`](https://github.com/ar-agents/ar-agents/commit/4aaaecc4bab0429f61bd034b60c0c77607562b20) - Add `@ar-agents/banking/testing` subpath with `MockBcraDeudaAdapter` + `MockBcraVarsAdapter` and result factories (`mockBcraDeudaClean`, `mockBcraDeudaRiesgo`, `mockBcraDeudaUnavailable`, `mockUsdOficialSeries`, `mockCerSeries`). Lets cookbook recipes and downstream apps test BCRA-dependent flows without a live BCRA round-trip.

## 0.3.0

### Minor Changes

- [`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e) Thanks [@naza00000](https://github.com/naza00000)! - Add `doctor` CLIs to the remaining 4 packages — completes the uniform CLI surface across the toolkit.

  ```bash
  npx @ar-agents/banking doctor       # algorithm-only tools, BCRA endpoint, 11 tools
  npx @ar-agents/facturacion doctor   # AFIP cert/key/CUIT/env/PdV check + tools
  npx @ar-agents/shipping doctor      # which carriers (Andreani/OCA/Correo) are wired
  npx -y @ar-agents/mcp doctor        # which @ar-agents/* subpackages your MCP host has wired
  ```

  The `mcp doctor` is particularly useful — it shows the full subpackage status (enabled / partial / disabled) with the always-on tools per package, so a Claude Desktop / Cursor user knows exactly what their host can do without enumerating env vars.

  All 7 published `@ar-agents/*` packages with tools now ship a uniform `doctor` subcommand. Plus `mp-doctor` from earlier still works for backward compat.

## 0.1.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.1.0

### Minor Changes

- Initial release: AR banking primitives for Vercel AI SDK 6+ agents.

  **5 tools shipped:**

  - `validate_cbu` — pure-algorithm CBU/CVU validation with bank/PSP identification (Galicia, Nación, Mercado Pago, Ualá, Naranja X, etc.)
  - `lookup_bank_by_code` — resolve a 3-digit bank code or 7-digit CVU prefix → name
  - `list_banks` — enumerate all known traditional banks
  - `list_psps` — enumerate all known fintechs
  - `lookup_credit_situation` — BCRA Central de Deudores adapter (`BcraPublicApiAdapter` ships, no auth required)

  **Robustez built-in** matching the rest of the toolkit:

  - `BcraPublicApiAdapter` accepts `requestTimeoutMs`, `maxRetries`, `onCall` observability hook
  - HTTP 404 from BCRA cleanly mapped to `available: false` (CUIT not in registry, not a crash)
  - Exponential backoff on 5xx + transient errors

  **Pure tools cost nothing** — no API key, no env var, no network. Drop-in safe.

  54 tests, 90%+ statement coverage, 6.2 KB brotli'd.
