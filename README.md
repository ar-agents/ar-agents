# ar-agents

> **Mercado Pago Agent Toolkit.** Built on Vercel.

[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ar-agents/ar-agents/badge)](https://scorecard.dev/viewer/?uri=github.com/ar-agents/ar-agents)
[![Socket Security](https://socket.dev/api/badge/npm/package/@ar-agents/mercadopago)](https://socket.dev/npm/package/@ar-agents/mercadopago)
[![license](https://img.shields.io/github/license/ar-agents/ar-agents.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@ar-agents/mercadopago?label=%40ar-agents%2Fmercadopago)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![npm downloads](https://img.shields.io/npm/dm/@ar-agents/mercadopago.svg?label=npm%20downloads)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/mercadopago.svg?label=bundle)](https://bundlephobia.com/package/@ar-agents/mercadopago)
[![types](https://img.shields.io/npm/types/@ar-agents/mercadopago.svg)](https://arethetypeswrong.github.io/?p=@ar-agents/mercadopago)
[![npm provenance](https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7C3AED?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)
[![ar-agents on Glama](https://glama.ai/mcp/servers/ar-agents/ar-agents/badges/score.svg)](https://glama.ai/mcp/servers/ar-agents/ar-agents)

[`@ar-agents/mercadopago`](./packages/mercadopago) is a Mercado Pago Agent
Toolkit for the [Vercel AI SDK](https://ai-sdk.dev) 6 `Experimental_Agent`.
89 typed tools across the agent-relevant Mercado Pago API surface:

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

Deploys [`apps/mp-hello`](./apps/mp-hello), a runnable agent on Vercel with
Edge Runtime API routes, MP webhook handler, and Upstash-backed subscription
state. Around 2 minutes from click to live.

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
| Vercel AI SDK 6 tool schemas                   | ✓                        | no                       | ✓ (Stripe)           |
| Argentine-specific (cuotas, ARCA, AR phone)    | ✓                        | partial                  | no                   |
| Tool count                                     | 89                       | thin REST client         | 26 (Stripe)          |
| Webhooks: HMAC + dedup + replay window         | ✓                        | client only              | ✓                    |
| Edge Runtime + Vercel KV adapters              | ✓                        | Node-only                | optional             |
| OpenTelemetry instrumentation                  | ✓                        | no                       | no                   |
| Deterministic idempotency by default           | ✓                        | no                       | no                   |
| Programmatic HITL on irreversible ops          | ✓                        | no                       | no                   |
| MercadoPago coverage                           | full                     | full                     | n/a                  |

Both official SDKs are excellent at what they do (generic REST clients for
their respective APIs). `@ar-agents/mercadopago` is opinionated for the
agent-operating-an-Argentine-business case, and composes with `mercadopago`
under the hood when needed. See [`MIGRATION.md`](./packages/mercadopago/MIGRATION.md).

## Architecture

```mermaid
flowchart LR
  subgraph user_app["Your Next.js / Edge / Workers app"]
    direction TB
    agent["Vercel AI SDK 6<br/>Experimental_Agent"]
  end

  subgraph ar_agents["@ar-agents/* (this monorepo)"]
    direction TB
    mp["mercadopago<br/>89 tools"]
    id["identity<br/>CUIT + AFIP padrón"]
    fac["facturacion<br/>factura electrónica"]
    wa["whatsapp<br/>Business Cloud"]
    bk["banking<br/>CBU + BCRA"]
    sh["shipping<br/>Andreani / OCA / Correo"]
    att["identity-attest<br/>HMAC-signed orchestrator"]
    mcp["mcp<br/>bundles all 7 over MCP"]
  end

  subgraph adapters["Pluggable state (subpath)"]
    direction TB
    kv["@ar-agents/mercadopago/vercel-kv<br/>state · OAuth · idempotency · audit · ratelimit"]
    otel["@ar-agents/mercadopago/otel<br/>OpenTelemetry instrumentation"]
  end

  subgraph external["External APIs"]
    direction TB
    mpapi["api.mercadopago.com"]
    afip["AFIP/ARCA WSAA + WSFE"]
    meta["Meta WhatsApp Cloud API"]
    bcra["BCRA Central de Deudores"]
    carriers["Andreani · OCA · Correo Argentino"]
  end

  agent -- tool calls --> mp & id & fac & wa & bk & sh & att
  mp -.subpath.-> kv & otel
  mp --> mpapi
  id --> afip
  fac --> afip
  wa --> meta
  bk --> bcra
  sh --> carriers
  mcp -.bundles.-> mp & id & fac & wa & bk & sh & att
```

The agent picks tools from natural-language prompts. Each package is an
independent npm release; there are no cross-package runtime dependencies
beyond the optional adapter subpaths, so you only ship the surface you use.

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
the docs at runtime, following the [agents.md](https://agents.md/) format
(tool-selection rules, result schemas, error patterns).

## Live demos

| App | URL | Shows |
| --- | --- | --- |
| Landing | <https://ar-agents.vercel.app> | Toolkit overview |
| `cuit-hello` | <https://ar-agents-cuit-hello.vercel.app> | CUIT validation + ARCA padrón (real AFIP cert) |
| `whatsapp-hello` | <https://ar-agents-whatsapp-hello.vercel.app> | Billing assistant: MP composed with identity, identity-attest, whatsapp |
| `mp-hello` | dev-only | MP Subscriptions full flow (`pnpm dev`, port 3013) |

## Develop

```bash
pnpm install
pnpm test         # 719 tests across 8 packages
pnpm typecheck
pnpm build
pnpm dev          # mp-hello on http://localhost:3013
```

Requires Node 20+ and pnpm 10+. CI runs build, typecheck, coverage,
manifest-drift, publint, arethetypeswrong, and size-limit on every push.

## Repo layout

```
ar-agents/
├── apps/
│   ├── landing/                 # ar-agents.vercel.app
│   ├── cuit-hello/              # ar-agents-cuit-hello.vercel.app (port 3014)
│   ├── whatsapp-hello/          # ar-agents-whatsapp-hello.vercel.app
│   └── mp-hello/                # dev-only (port 3013)
├── packages/
│   ├── mercadopago/             # 89 tools: subscriptions, payments, OAuth, QR, 3DS, point, ...
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

All packages are pre-1.0. Public API may evolve in 0.x; we follow semver, so
minor bumps may include breaking changes and patch bumps never do. Pinning a
minor in production is safe.

## License

MIT. Built by [Nazareno Clemente](https://github.com/naza00000).
