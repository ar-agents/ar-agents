# Agent guide — `@ar-agents/mi-argentina`

This file is for *agents at runtime*: tool selection rules, memorizable result shapes, error patterns, latency tables, AR context an agent needs to use this lib correctly. If you're a human integrator, read [`README.md`](./README.md) instead.

## When to pick this lib

- The user wants to **log in with their Argentine government identity** (Mi Argentina).
- An app needs to **verify a user's CUIL/DNI/name** as a high-trust gov-issued claim, not a self-declared form field.
- An access token is in hand and the agent needs the **freshest profile** (userinfo endpoint).
- An ID token JWT was passed in and the agent needs to **decide whether to trust it**.

Do NOT pick this lib when:

- The user is *not* in Argentina (Mi Argentina only issues to AR residents).
- The app needs *only* CUIT/CUIL **algorithm** validation (no gov call) — use `@ar-agents/identity` (`validate_cuit`).
- The app needs taxpayer fiscal data (monotributo, IVA condition) — use `@ar-agents/identity` (`lookup_cuit_afip`).
- The app needs verified-identity-without-Mi-Argentina (e.g., WhatsApp OTP fallback) — use `@ar-agents/identity-attest`.

## Tool selection rules

### Login flow (HITL)

The OAuth dance can NEVER complete in a single agent turn — only the user's browser can authenticate to Mi Argentina. The shape is always:

1. Agent calls `mi_argentina_start_login` → returns `authorization_url`.
2. Agent's text response says: *"Abrí este link, dale acceso, y pegame los parámetros `code` y `state` que aparecen en la URL de vuelta."*
3. User completes the consent.
4. User returns and pastes the values OR your callback handler picks them up automatically.
5. Agent calls `mi_argentina_complete_login` with the `code` + `state`.

If the agent skips step 1 and tries to call `complete_login` first, it will fail with `state_mismatch`.

### Trust decisions

- **Have an access token, want the latest claims** → `mi_argentina_get_user_profile`. Fresh from server.
- **Got an ID token JWT from elsewhere, want to know if it's real** → `mi_argentina_verify_id_token`. Returns `valid: true` + claims, or throws.
- **Access token expired (HTTP 401 from a downstream call)** → `mi_argentina_refresh_token` if a refresh token is available. If that also fails, restart from `mi_argentina_start_login`.

## Result shape — memorize these

```ts
// mi_argentina_start_login
{
  authorization_url: string,  // hand to the user
  state: string,              // passed back in callback
  scope: string[],            // what was actually requested
  message: string,            // human-readable next step
}

// mi_argentina_complete_login
{
  access_token: string,       // Bearer
  id_token: string,           // compact JWT
  refresh_token?: string,     // only if 'offline_access' was requested
  expires_in: number,         // seconds
  scope: string,              // space-separated
  claims: { sub, iss, aud, exp, iat, nonce?, ... },
  profile?: { sub, cuil?, dni?, nombres?, apellidos?, email?, ... },
}

// mi_argentina_verify_id_token
{
  valid: true,                // throws on invalid; never returns false
  header: { alg: "RS256", kid, typ },
  claims: { sub, iss, aud, exp, iat, ... },
}

// mi_argentina_refresh_token
{
  access_token: string,
  id_token: string,
  refresh_token?: string,     // may rotate
  expires_in: number,
  scope: string,
}
```

## Error patterns

All errors carry a `code` field (machine-readable) and a `message` field (surface verbatim).

| Code                          | Meaning & next step                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `config_missing`              | clientId/clientSecret/redirectUri not wired. App-level setup task; not a user-fixable error.       |
| `state_mismatch`              | Callback hit on a different session, or replay. ASK the user to start over from `start_login`.     |
| `code_exchange_failed`        | Mi Argentina rejected the code. Often: `redirect_uri` doesn't match exactly. Verify and retry.     |
| `id_token_invalid`            | Token signature/claim check failed. Treat user as unauthenticated; restart login.                  |
| `id_token_expired`            | Token outside lifetime. Refresh or re-login.                                                       |
| `id_token_audience_mismatch`  | Token was issued for a different client. SECURITY: do not proceed.                                 |
| `id_token_issuer_mismatch`    | Token was issued by a different provider. SECURITY: do not proceed.                                |
| `userinfo_failed`             | Userinfo endpoint returned non-200. Often access token expired — try `mi_argentina_refresh_token`. |
| `refresh_failed`              | Refresh token revoked. User MUST restart login.                                                    |
| `discovery_failed`            | Couldn't fetch `.well-known/openid-configuration`. Network or provider down.                       |

## Latency expectations

- `start_login`: <5ms (pure CPU + state adapter put — no network).
- `complete_login`: 200-800ms (token endpoint + JWKS endpoint, possibly userinfo).
- `get_user_profile`: 100-300ms (userinfo endpoint).
- `verify_id_token`: <50ms once JWKS is cached; 100-300ms on cold start.
- `refresh_token`: 100-300ms.

## AR context an agent needs

- **Mi Argentina** (`miargentina.gob.ar`) is the AR government's citizen super-app — DNI verified, gov-issued. Like `gov.br` (Brazil), `Cl@ve` (Spain), `MyGov` (Australia).
- **CUIL** (Clave Única de Identificación Laboral) — 11-digit work-authority identifier, structurally identical to **CUIT** (the tax-authority identifier). Same person → same number across both. Mi Argentina returns CUIL, not CUIT, in the `cuil` claim.
- **DNI** is the national ID number; 7-8 digits. Different from CUIL.
- **Domicilio** scope is sensitive — only request when the app actually needs it. Users see the consent screen and are increasingly suspicious of overreach.
- **Mi Argentina sandbox** uses a separate issuer (`sandbox.miargentina.gob.ar`) and disjoint user store. Never trust sandbox tokens in prod.

## Provisioning a client

The `client_id` / `client_secret` come from the AR government via the developer portal. As of mid-2026, registration goes through TAD (Trámites a Distancia):

1. Apply at [argob.github.io/mi-argentina-docs](https://argob.github.io/mi-argentina-docs/) (most up-to-date URL — verify before pasting in confirmation links).
2. Provide your app's redirect URIs, requested scopes, and a use-case description.
3. Receive credentials by email. Store in `MI_ARGENTINA_CLIENT_ID` / `MI_ARGENTINA_CLIENT_SECRET` env vars.

If the user asks the agent to "set up Mi Argentina login" but no credentials exist yet, the right answer is: surface the procurement steps above and refuse to make up a client_id.

## What NOT to do

- DO NOT cache or log access tokens or refresh tokens. They grant full access to the user's gov claims.
- DO NOT skip ID-token verification "for performance". The whole trust model collapses.
- DO NOT call `mi_argentina_get_user_profile` for every page render — fetch once, cache the profile in a session, refresh on a schedule.
- DO NOT pass user input directly as `redirect_uri` — it must match the value registered with Mi Argentina exactly.
- DO NOT use `provider: "miargentina_sandbox"` in production. Always check `process.env.NODE_ENV`.
