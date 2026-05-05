---
"@ar-agents/identity": minor
---

Add `WsaaWscdcAfipPadronAdapter` — production-ready AFIP padrón lookup via WSAA + WSCDC SOAP.

Imported from the new subpath `@ar-agents/identity/wsaa` (kept off the main entry so users who only need pure-algorithm validation don't pull in `node-forge`). The adapter implements `AfipPadronAdapter` and handles:

- WSAA login flow: TRA generation → PKCS#7 detached CMS signing with the integration's X.509 cert → POST to `loginCms` → parsing the returned access ticket
- TA caching with pluggable `TokenStore` (in-memory default; bring your own Upstash/Redis/Postgres adapter for multi-process deployments)
- WSCDC `getPersona_v2` SOAP call with full response parsing into `AfipPadronData` (name, tax condition, monotributo category, address, activities)
- Typed error surfacing: WSAA failures return `{ available: false, error: "Failed to authenticate with AFIP WSAA: ..." }` with actionable detail, never throws unexpectedly
- Fast path for malformed CUITs: rejected before any AFIP call

Also exports `loginCms`, `TokenCache`, `InMemoryTokenStore`, `getPersonaV2`, and the underlying `buildTraXml` / `signTra` / `parseLoginTicketResponse` / `buildGetPersonaSoap` / `parseGetPersonaResponse` helpers for callers who want to compose their own AFIP flows.

Setup requires generating an X.509 cert + key with openssl, registering it in AFIP via Clave Fiscal, and authorizing the cert for the `ws_sr_padron_a5` service. See README's "Quick start (with AFIP padrón lookup)" section for the full walkthrough.
