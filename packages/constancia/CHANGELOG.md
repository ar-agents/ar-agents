# @ar-agents/constancia

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

- Initial release: `@ar-agents/constancia` — ARCA (ex-AFIP) Constancia de Inscripción as a typed, browser-backed tool for the Vercel AI SDK. Returns the parsed fiscal situation **plus the official PDF artifact** (with its código verificador) — the piece the SOAP padrón webservices structurally cannot give you. Drives the public web form (no Clave Fiscal) behind a pluggable `ConstanciaFetcher` contract (`BrowseSkillConstanciaFetcher` / `MockConstanciaFetcher` / `UnconfiguredConstanciaFetcher`); ships no browser and no Browserbase dependency — a deliberately quarantined browser-backed tier. Companion browser runbook published as the `afip-constancia` skill on `browserbase/skills`; both share one JSON output contract (`parseSkillOutput`). One artifact, two surfaces.
