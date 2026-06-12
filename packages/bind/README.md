# @ar-agents/bind

BIND APIBANK (Banco Industrial BaaS) agent toolkit for the Vercel AI
SDK 6+. Typed tools for immediate transfers (CBU/CVU/alias), DEBIN
collections, echeqs, account movements, and CBU/CVU ownership lookups.
Adapter pattern: real JWT HTTP client behind a pluggable adapter,
structured unconfigured default so unit tests never call the network.

```sh
pnpm add @ar-agents/bind
```

## Maturity (read this first)

Honest status of v0.1:

- The real HTTP client (`HttpBindAdapter`) is shipped and tested against
  mocked fetch. It defaults to the **unconfigured adapter** until BIND
  onboarding credentials are wired: BIND APIBANK access is granted via
  commercial onboarding with the bank (credentials + a client certificate
  for the TLS channel + the production base URL).
- Endpoint paths, the JWT auth flow, and the request/response field names
  used here are **verified against BIND's public apidoc**
  (`sandbox.bind.com.ar/apidoc`, APIBank SandBox v1.7.15, fetched
  2026-06-12). See AGENTS.md for the per-endpoint verified/designed table.
- What is NOT verified: the production base URL (not published openly),
  the full enum value sets behind "Valores permitidos" links (concepts,
  currencies, echeq statuses), and deep echeq detail fields. Schemas keep
  unknown upstream fields via loose objects so nothing breaks when BIND
  returns more than the docs show. Verify against the sandbox during
  onboarding before moving real money.

## Quick start

```ts
import { Experimental_Agent as Agent } from "ai";
import { bindTools, HttpBindAdapter } from "@ar-agents/bind";
import { anthropic } from "@ai-sdk/anthropic";

const tools = bindTools({
  adapter: new HttpBindAdapter({
    username: process.env.BIND_USERNAME!,
    password: process.env.BIND_PASSWORD!,
    // baseUrl defaults to https://sandbox.bind.com.ar/v1
  }),
  // Deterministic human-in-the-loop gate for transfers. ALWAYS wire
  // this in production: bank transfers are irreversible.
  requireConfirmation: async (op, args) => myUi.confirm(op, args),
});

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools,
  system: "Sos un asistente de tesoreria para una pyme argentina.",
});
```

## What you get

Six tools, all returning a structured `BindResult<T>` envelope
(`{ ok: true, data }` or `{ ok: false, code, message }`), so the LLM
always receives something it can reason about:

| Tool                   | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `bind_list_accounts`   | List bank accounts with balances. Source of `account_id`.     |
| `bind_get_movements`   | Account movements (credits/debits) with date filters + paging.|
| `bind_get_cbu_owner`   | Who owns a CBU/CVU/alias. Call BEFORE paying.                 |
| `bind_create_transfer` | Immediate transfer to CBU/CVU/alias. IRREVERSIBLE. Gated.     |
| `bind_create_debin`    | Pull funds via DEBIN (the buyer approves on their side).      |
| `bind_get_echeqs`      | List echeqs by status and perspective (ISSUER/RECEIVER).      |

## Adapter pattern

The tool layer never touches the network directly. It calls a
`BindAdapter`. The default is `UnconfiguredBindAdapter`, which resolves
`{ ok: false, code: "unconfigured" }` on every call instead of throwing,
so an agent without credentials degrades gracefully and tells the user
the integration is not set up.

```ts
import { HttpBindAdapter, BIND_BANK_ID } from "@ar-agents/bind";

const adapter = new HttpBindAdapter({
  username: process.env.BIND_USERNAME!,
  password: process.env.BIND_PASSWORD!,
  baseUrl: process.env.BIND_BASE_URL, // production URL from onboarding
  bankId: BIND_BANK_ID, // 322; Banco de Valores uses 198
});
```

`HttpBindAdapter` handles the JWT lifecycle for you: lazy login via
`POST /login/jwt`, proactive re-login 60 seconds before `expires_in`
elapses, and a single retry with a fresh login on an unexpected 401.
The auth header is the literal `Authorization: JWT <token>` scheme that
BIND uses (not `Bearer`).

## Safety: the transfer gate

`bind_create_transfer` moves real money and cannot be undone once
`COMPLETED`. Two layers of protection:

1. The tool description instructs the model to verify the destination
   with `bind_get_cbu_owner` and confirm with the user first.
2. The `requireConfirmation` option is a deterministic gate: when set,
   the transfer tool will not execute until your callback resolves
   `true`. Declines return a structured refusal, the adapter is never
   called.

## Amounts

BIND uses **decimal pesos** (`amount: 10.5` = ARS 10,50). This differs
from `@ar-agents/uala` and `@ar-agents/mercadopago` conventions, so do
not copy centavos-based amounts across packages.

## License

MIT
