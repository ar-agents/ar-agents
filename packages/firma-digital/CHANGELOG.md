# @ar-agents/firma-digital

## 0.3.0

### Minor Changes

- [#86](https://github.com/ar-agents/ar-agents/pull/86) [`8f461b7`](https://github.com/ar-agents/ar-agents/commit/8f461b7d1544d16b910951b3bbb84c6ffa2be552) Thanks [@naza00000](https://github.com/naza00000)! - Security: rework the X.509 / CMS trust model so a forged certificate can no
  longer be reported as authentic (DeepSec audit, all true-positive).

  - **Chain validity requires a pinned trust anchor.** `verifyChain` previously
    accepted any self-signed root whose DN _looked like_ an AR ONTI / AC-Raíz root
    (`acceptArOntiRoot` defaulted true). DN strings are forgeable, so this let an
    attacker mint a self-signed "Autoridad Certificante Raíz" and have a chain
    validate. Now `valid:true` requires the root to match a configured
    `trustAnchors` SHA-256 fingerprint; the name match is demoted to an
    informational `looksLikeArRoot` flag. `acceptArOntiRoot` is a deprecated no-op.
  - **Enforce CA constraints + strong algorithms.** Every non-leaf issuer must be a
    CA (`basicConstraints.cA` + `keyCertSign`); an end-entity cert can no longer
    sign another cert. SHA-1/MD5-era signature algorithms are rejected.
  - **CMS validity now includes the chain.** `verifyDetachedCmsSignature` returned
    `valid:true` on a good signature even when the signer chain was untrusted; it
    now returns `valid:false` if any signer's chain fails (when `verifyChain` is on).
  - **CMS signer resolved by IssuerAndSerialNumber**, not certificate array order.
  - **Tools:** `firmaDigitalTools({ trustAnchors })` takes host-pinned anchors;
    `firma_verify_chain` dropped the model-controllable `accept_ar_onti_root` input.

  BREAKING: callers relying on heuristic-root acceptance must now pass `trustAnchors`
  (parsed official AC-Raíz certs) to get `valid:true`.

## 0.2.3

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

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

- Initial release. Argentine Firma Digital (Ley 25.506 / ONTI) verification primitives wrapped as Vercel AI SDK 6 tools.
  - `parseCert(pem)` — parse single X.509 cert, extract subject/issuer/CUIT/key info.
  - `parseCertChain(pemBundle)` — multi-cert PEM extraction.
  - `verifyChain(pemBundle, options)` — leaf → root walk with heuristic AR-ONTI root acceptance OR explicit trust-anchor fingerprint pinning.
  - `verifyDetachedCmsSignature(sig, payload, options)` — PKCS#7 / CMS detached signature verification with optional chain walk per signer.
  - 4 tools: `firma_inspect_cert`, `firma_verify_chain`, `firma_is_onti_issued`, `firma_verify_cms_signature`.
  - Heuristic AR-ONTI / AC-Raíz detection via DN-pattern matching; extensible via `TrustStore`.
  - Verification only — signing is out of scope (requires hardware tokens).
