# `@ar-agents/mi-argentina`

> Mi Argentina (the Argentine government's OIDC) as a drop-in tool collection for the Vercel AI SDK 6, plus a pure-Web-Crypto OIDC client you can use directly from any server-side handler.

```bash
pnpm add @ar-agents/mi-argentina ai zod
```

Part of the [`Arg`](https://ar-agents.vercel.app) toolkit — open infrastructure for the Argentine AI agent jurisdiction.

## What this gives you

- **`MiArgentinaClient`** — minimal, Edge-Runtime-friendly OIDC client. PKCE, OIDC discovery (`/.well-known/openid-configuration`), RS256 ID-token verification, JWKS caching, refresh tokens, end-session.
- **`miArgentinaTools(client)`** — five Vercel AI SDK tools: `start_login`, `complete_login`, `get_user_profile`, `verify_id_token`, `refresh_token`.
- **State adapters** — `InMemoryStateAdapter` for dev, `VercelKVStateAdapter` for prod, `MiArgentinaStateAdapter` interface for anything else.

Web Crypto only — no `node:crypto`, no Node-only APIs. Works on Vercel Edge, Cloudflare Workers, Deno, any V8 isolate, and Node 20+.

## Quick start (server route)

```ts
import {
  MiArgentinaClient,
  InMemoryStateAdapter,
} from "@ar-agents/mi-argentina";

const client = new MiArgentinaClient({
  config: {
    clientId: process.env.MI_ARGENTINA_CLIENT_ID!,
    clientSecret: process.env.MI_ARGENTINA_CLIENT_SECRET!,
    redirectUri: "https://yourapp.com/api/auth/callback",
    provider: "miargentina", // or "miargentina_sandbox"
    defaultScopes: ["openid", "profile", "email", "cuil"],
  },
  state: new InMemoryStateAdapter(), // swap for VercelKVStateAdapter in prod
});

// route: GET /api/auth/login
const { url } = await client.getAuthorizationUrl();
return Response.redirect(url);

// route: GET /api/auth/callback?code=...&state=...
const { tokens, idToken, profile } = await client.exchangeCode({
  code: searchParams.get("code")!,
  state: searchParams.get("state")!,
  fetchUserInfo: true,
});
// tokens.accessToken, idToken.claims.sub, profile.cuil — all verified.
```

## With the Vercel AI SDK

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MiArgentinaClient,
  miArgentinaTools,
  VercelKVStateAdapter,
} from "@ar-agents/mi-argentina";
import { kv } from "@vercel/kv";

const client = new MiArgentinaClient({
  config: { /* …as above… */ },
  state: new VercelKVStateAdapter(kv),
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: miArgentinaTools(client),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "El usuario quiere loguearse con Mi Argentina y mostrar su perfil.",
});
```

Because the OAuth dance is fundamentally human-in-the-loop, the agent will:
1. Call `mi_argentina_start_login` to obtain a URL.
2. Hand the URL to the user, who completes the consent in their browser.
3. Receive `code` + `state` from the callback handler in your app.
4. Call `mi_argentina_complete_login` with both — gets back the verified profile.

## Endpoints

The package ships two presets:

| Preset                   | Issuer                                  |
| ------------------------ | --------------------------------------- |
| `miargentina` (default)  | `https://miargentina.gob.ar`            |
| `miargentina_sandbox`    | `https://sandbox.miargentina.gob.ar`    |

For maximum resilience against provider URL changes, run discovery once at boot:

```ts
await client.discover(); // refreshes endpoints from /.well-known/openid-configuration
```

For other AR OIDC providers (e.g., a private SSO that mirrors the OIDC standard), use `provider: "custom"` and pass `endpoints` explicitly.

## Tool surface

| Tool                              | Purpose                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `mi_argentina_start_login`        | Build the authorization URL + persist PKCE/state/nonce.          |
| `mi_argentina_complete_login`     | Exchange `code` for tokens, verify the ID token.                 |
| `mi_argentina_get_user_profile`   | Fetch the OIDC userinfo endpoint with a Bearer access token.     |
| `mi_argentina_verify_id_token`    | Verify a JWT signature, issuer, audience, expiration, nonce.     |
| `mi_argentina_refresh_token`      | Exchange a refresh token for a fresh access token.               |

See [`AGENTS.md`](./AGENTS.md) for tool-selection guidance from the agent author's perspective.

## Security model

- **PKCE always**. RFC 7636 S256, 384 bits of verifier entropy. Mi Argentina rejects non-PKCE flows.
- **State is single-use**. The state adapter atomically consumes the entry on callback (`getdel` on Upstash KV; `delete` then `read` elsewhere). Replays return `StateMismatchError`.
- **ID token verification is mandatory**. Signature (RS256) + issuer + audience + expiration + nonce. There is no "skip verification" mode.
- **JWKS cached 5 minutes**. Survives short-lived JWKS endpoint blips; fresh enough that key rotation lands within minutes.
- **No `node:crypto`**. Web Crypto API throughout — runs everywhere.

## Provisioning a real client

You need to register your application with Mi Argentina to get `client_id` / `client_secret`. Today the canonical reference is [argob.github.io/mi-argentina-docs](https://argob.github.io/mi-argentina-docs/). The procurement steps are documented separately in [`AGENTS.md`](./AGENTS.md).

## License

MIT © Nazareno Clemente
