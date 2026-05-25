---
"@ar-agents/whatsapp": minor
"@ar-agents/facturacion": minor
"@ar-agents/banking": minor
"@ar-agents/mi-argentina": minor
"@ar-agents/identity-attest": minor
"@ar-agents/igj": minor
"@ar-agents/gde-tad": minor
"@ar-agents/firma-digital": minor
"@ar-agents/boletin-oficial": minor
"@ar-agents/constancia": minor
"@ar-agents/mercadolibre": minor
"@ar-agents/shipping": minor
---

Lift sweep — final wave: every remaining OG package now extends
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
