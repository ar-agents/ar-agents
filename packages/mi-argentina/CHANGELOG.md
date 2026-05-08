# @ar-agents/mi-argentina

## 0.1.0

### Minor Changes

- Initial release. Mi Argentina (Argentine government OIDC) as a drop-in tool collection for the Vercel AI SDK 6.
  - `MiArgentinaClient` — Edge-Runtime-friendly OIDC client (PKCE S256, RS256 ID-token verification, JWKS caching, refresh, end-session).
  - `miArgentinaTools` — 5 tools: `start_login`, `complete_login`, `get_user_profile`, `verify_id_token`, `refresh_token`.
  - `InMemoryStateAdapter` for dev/tests; `VercelKVStateAdapter` for prod.
  - Web Crypto only — no `node:crypto` dependency.
  - Provider presets `miargentina` and `miargentina_sandbox` plus `custom` for sandboxes / other AR OIDC providers.
  - OIDC discovery via `.well-known/openid-configuration`.
