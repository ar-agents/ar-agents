# @ar-agents/uala

Ualá Bis agent toolkit for the Vercel AI SDK 6+. Typed tools for
payment links, QR cobros, transaction history, payouts, balance, and
marketplace OAuth. Adapter pattern: pure-types + validation out of the
box, real API behind a pluggable adapter.

```sh
pnpm add @ar-agents/uala
```

## Quick start

```ts
import { Experimental_Agent as Agent } from "ai";
import { ualaTools, UalaApiAdapter } from "@ar-agents/uala";
import { anthropic } from "@ai-sdk/anthropic";

const tools = ualaTools({
  adapter: new UalaApiAdapter({ apiKey: process.env.UALA_API_KEY! }),
});

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools,
  system: "You are a billing assistant for an Argentine SaaS.",
});

const result = await agent.generate({
  prompt: "Crear un link de cobro por ARS 1.500 con descripción 'plan mensual'.",
});
```

## What you get

Eight tools, all returning typed responses:

| Tool                          | What it does                                          |
| ----------------------------- | ----------------------------------------------------- |
| `uala_create_payment_link`    | Create a shareable payment link (with optional QR).   |
| `uala_get_payment_link`       | Poll a link's status.                                 |
| `uala_cancel_payment_link`    | Revoke an open link.                                  |
| `uala_list_transactions`      | List account movements with pagination.               |
| `uala_get_transaction`        | Fetch a single transaction.                           |
| `uala_get_balance`            | Current available + pending balance.                  |
| `uala_create_payout`          | Initiate a payout to a CBU. Idempotency-keyed.        |
| `uala_get_payout`             | Track payout status to completion.                    |

## Adapter pattern

The tool layer never touches the network directly. It calls an
`UalaAdapter`. The default is `UnconfiguredUalaAdapter`, which throws
`UalaUnconfiguredError` on every call — safe for unit tests, fails
loud in production if you forgot to wire credentials.

```ts
import { UalaApiAdapter } from "@ar-agents/uala";

const adapter = new UalaApiAdapter({
  apiKey: process.env.UALA_API_KEY!,
  // Optional. Override for sandbox / staging:
  baseUrl: "https://api.uala.com.ar/v1",
  // Optional. Custom fetch for tests, OTel, or custom timeouts:
  fetchImpl: fetch,
  timeoutMs: 10_000,
});
```

You can also bring your own adapter by implementing the `UalaAdapter`
interface. Examples: in-memory mock for integration tests, a fake that
simulates timeouts, a metered proxy in front of the real API.

## Marketplace OAuth

For multi-merchant integrations, use the OAuth helpers (pure functions,
no agent tools — the OAuth dance is server-driven by the host):

```ts
import { buildAuthorizeUrl, exchangeCodeForToken } from "@ar-agents/uala";

// Step 1: redirect the merchant.
const authorizeUrl = buildAuthorizeUrl({
  clientId: process.env.UALA_OAUTH_CLIENT_ID!,
  redirectUri: "https://yourapp.com/uala/callback",
  scope: ["payments.read", "payouts.write"],
  state: randomCsrfToken,
});

// Step 2: exchange code for token in your callback handler.
const tokens = await exchangeCodeForToken({
  clientId: process.env.UALA_OAUTH_CLIENT_ID!,
  clientSecret: process.env.UALA_OAUTH_CLIENT_SECRET!,
  redirectUri: "https://yourapp.com/uala/callback",
  code,
});
// Store tokens.accessToken, tokens.refreshToken, tokens.expiresAt per merchant.
```

## Errors

All errors inherit from `UalaError`:

```ts
import {
  UalaError,
  UalaUnconfiguredError,
  UalaAuthError,
  UalaApiError,
  UalaValidationError,
} from "@ar-agents/uala";

try {
  await tools.uala_create_payout.execute({
    amount: 100000,
    destinationCbu: "0".repeat(22),
  });
} catch (e) {
  if (e instanceof UalaAuthError) /* re-auth */;
  else if (e instanceof UalaValidationError) /* bad input, do not retry */;
  else if (e instanceof UalaApiError) /* check e.status */;
  else throw e;
}
```

## Constraints (quick reference)

- Amounts in **centavos for ARS, cents for USD**. No floats.
- CBU is **22 digits** exactly.
- `idempotencyKey` honored for `create_payment_link` and `create_payout`.
- Currency defaults to **ARS**.
- 10-second hard timeout per request.

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
