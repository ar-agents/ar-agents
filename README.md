# ar-agents

> **Mercado Pago Agent Toolkit.** Built on Vercel.

[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/ar-agents/ar-agents.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@ar-agents/mercadopago?label=%40ar-agents%2Fmercadopago)](https://www.npmjs.com/package/@ar-agents/mercadopago)

[`@ar-agents/mercadopago`](./packages/mercadopago) is a Mercado Pago Agent
Toolkit for the [Vercel AI SDK](https://ai-sdk.dev) 6 `Experimental_Agent`.
87 typed tools across the agent-relevant Mercado Pago API surface:

> Payments · Subscriptions · Checkout Pro · Marketplace OAuth · Order Management ·
> Customers · Cards · Cuotas · QR · 3DS · Point devices · Stores+POS ·
> Account/Balance/Settlements · Webhooks · Disputes · Lookups · Bank Accounts

Edge Runtime. Vercel KV adapters for state, OAuth, idempotency, and audit.
OpenTelemetry instrumentation. Deterministic idempotency by default.
Programmatic HITL on irreversible operations.

```bash
pnpm add @ar-agents/mercadopago ai zod
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello&env=MP_ACCESS_TOKEN%2CANTHROPIC_API_KEY%2CUPSTASH_REDIS_REST_URL%2CUPSTASH_REDIS_REST_TOKEN&envDescription=Mercado%20Pago%20access%20token%2C%20Anthropic%20API%20key%2C%20and%20Upstash%20Redis%20credentials%20for%20subscription%20state.&envLink=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents%2Ftree%2Fmain%2Fapps%2Fmp-hello%23setup&project-name=mp-hello&repository-name=mp-hello)

Deploys [`apps/mp-hello`](./apps/mp-hello) — a runnable agent on Vercel with
Edge Runtime API routes, MP webhook handler, and Upstash-backed subscription
state. ~2 minutes from click to live.

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!, // TEST- for sandbox, APP_USR- for prod
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: mercadoPagoTools(mp, {
    state: new InMemoryStateAdapter(), // swap for VercelKVStateAdapter in prod
    backUrl: "https://yoursite.com/subscription/done",
  }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "Creá una subscription mensual de $1000 ARS para customer@example.com.",
});
```

Full reference, cookbook (9 recipes including OpenTelemetry wiring), and
migration guide vs the official `mercadopago` SDK live in
[`packages/mercadopago/`](./packages/mercadopago).

## How it compares

|                                                | `@ar-agents/mercadopago` | `mercadopago` (official) | Stripe Agent Toolkit |
| ---------------------------------------------- | :----------------------: | :----------------------: | :------------------: |
| Vercel AI SDK 6 tool schemas                   | ✓                        | —                        | ✓ (Stripe)           |
| Argentine-specific (cuotas, ARCA, AR phone)    | ✓                        | partial                  | —                    |
| Tool count                                     | 87                       | thin REST client         | 26 (Stripe)          |
| Webhooks: HMAC + dedup + replay window         | ✓                        | client only              | ✓                    |
| Edge Runtime + Vercel KV adapters              | ✓                        | Node-only                | optional             |
| OpenTelemetry instrumentation                  | ✓                        | —                        | —                    |
| Deterministic idempotency by default           | ✓                        | —                        | —                    |
| Programmatic HITL on irreversible ops          | ✓                        | —                        | —                    |
| MercadoPago coverage                           | full                     | full                     | n/a                  |

Both official SDKs are excellent at what they do — generic REST clients for their
respective APIs. `@ar-agents/mercadopago` is opinionated for the agent-operating-an-
Argentine-business case, and composes with `mercadopago` under the hood when needed.
See [`MIGRATION.md`](./packages/mercadopago/MIGRATION.md).

## Other AR primitives in this monorepo

Same approach, applied to the rest of the stack an Argentine business needs:

| Package | Tools | What it does |
| --- | :---: | --- |
| [`@ar-agents/identity`](./packages/identity) | 2 | CUIT/CUIL validation + AFIP/ARCA padrón lookup (constancia con monotributo + condición IVA). WSAA SOAP via subpath. |
| [`@ar-agents/identity-attest`](./packages/identity-attest) | 5 | Verification orchestrator (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity), returns HMAC-signed attestation with `trustLevel`. |
| [`@ar-agents/whatsapp`](./packages/whatsapp) | 6 | WhatsApp Business Cloud API. Webhook + HMAC. AR phone normalizer. `scopedTo` mode binds outbound tools to a single sender. |
| [`@ar-agents/facturacion`](./packages/facturacion) | 10 | AFIP/ARCA factura electrónica (WSFE). Factura A/B/C, NC/ND, FCE MiPyMEs. Local pre-flight validator. |
| [`@ar-agents/banking`](./packages/banking) | 5 | CBU/CVU validation + bank/PSP lookup + BCRA Central de Deudores. |
| [`@ar-agents/shipping`](./packages/shipping) | 6 | Andreani (full) + OCA + Correo Argentino. Provincia + CPA helpers. |
| [`@ar-agents/mcp`](./packages/mcp) | wraps all | Model Context Protocol server. Drop the toolkit into Claude Desktop, Cursor, any MCP host. |

Each package ships a `README.md` for humans and an `AGENTS.md` for LLMs reading
the docs at runtime ([agents.md](https://agents.md/) format — tool selection
rules, result schemas, error patterns).

## Live demos

| App | URL | Shows |
| --- | --- | --- |
| Landing | <https://ar-agents.vercel.app> | Toolkit overview |
| `cuit-hello` | <https://ar-agents-cuit-hello.vercel.app> | CUIT validation + ARCA padrón (real AFIP cert) |
| `whatsapp-hello` | <https://ar-agents-whatsapp-hello.vercel.app> | Billing assistant — MP composed with identity, identity-attest, whatsapp |
| `mp-hello` | dev-only | MP Subscriptions full flow (`pnpm dev`, port 3013) |

## Develop

```bash
pnpm install
pnpm test         # 719 tests across 8 packages
pnpm typecheck
pnpm build
pnpm dev          # mp-hello on http://localhost:3013
```

Requires Node 20+ and pnpm 10+. CI runs build → typecheck → coverage →
manifest-drift → publint + arethetypeswrong → size-limit on every push.

## Repo layout

```
ar-agents/
├── apps/
│   ├── landing/                 # ar-agents.vercel.app
│   ├── cuit-hello/              # ar-agents-cuit-hello.vercel.app (port 3014)
│   ├── whatsapp-hello/          # ar-agents-whatsapp-hello.vercel.app
│   └── mp-hello/                # dev-only (port 3013)
├── packages/
│   ├── mercadopago/             # 87 tools — subscriptions, payments, OAuth, QR, 3DS, point, ...
│   ├── identity/                # CUIT validate + ARCA padrón
│   ├── identity-attest/         # verification orchestrator
│   ├── whatsapp/                # WhatsApp Cloud
│   ├── facturacion/             # AFIP factura electrónica
│   ├── banking/                 # CBU/CVU + BCRA
│   ├── shipping/                # Andreani / OCA / Correo
│   └── mcp/                     # MCP server wrapping all
├── .github/workflows/           # ci.yml, release.yml
├── package.json                 # workspace root
└── pnpm-workspace.yaml
```

## Stability

All packages are pre-1.0. Public API may evolve in 0.x; we follow semver — minor
bumps may include breaking changes, patch bumps never do. Pinning a minor in
production is safe.

## License

MIT. Built by [Nazareno Clemente](https://github.com/naza00000).
