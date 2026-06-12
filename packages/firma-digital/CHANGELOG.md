# @ar-agents/firma-digital

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

- Initial release. Argentine Firma Digital (Ley 25.506 / ONTI) verification primitives wrapped as Vercel AI SDK 6 tools.
  - `parseCert(pem)` — parse single X.509 cert, extract subject/issuer/CUIT/key info.
  - `parseCertChain(pemBundle)` — multi-cert PEM extraction.
  - `verifyChain(pemBundle, options)` — leaf → root walk with heuristic AR-ONTI root acceptance OR explicit trust-anchor fingerprint pinning.
  - `verifyDetachedCmsSignature(sig, payload, options)` — PKCS#7 / CMS detached signature verification with optional chain walk per signer.
  - 4 tools: `firma_inspect_cert`, `firma_verify_chain`, `firma_is_onti_issued`, `firma_verify_cms_signature`.
  - Heuristic AR-ONTI / AC-Raíz detection via DN-pattern matching; extensible via `TrustStore`.
  - Verification only — signing is out of scope (requires hardware tokens).
