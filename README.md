# ar-agents

> AR Tools for the Vercel AI SDK — drop-in agent tools for Argentine integrations.

[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/ar-agents/ar-agents.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A monorepo of TypeScript packages that expose Argentina-specific services
(Mercado Pago, AFIP, WhatsApp Business Cloud, Meta Ads) as tools the
[Vercel AI SDK](https://ai-sdk.dev/) `Experimental_Agent` can invoke.

The thesis: building an AI agent that operates a real Argentine business
shouldn't take weeks of integration trial-and-error per platform. Each
package encapsulates the documented + undocumented gotchas as typed errors
and clean APIs.

> **Reading this as an agent?** Each package ships an `AGENTS.md` alongside
> its `README.md` — that's the format optimized for LLM consumption (tool
> selection rules, result schemas you can memorize, error patterns,
> composition with other packages, latency tables). See the table below for
> direct links.

## Architecture

```
                                 ┌─────────────────────────────┐
                                 │    Your Agent (Vercel AI    │
                                 │    SDK 6 Experimental_Agent)│
                                 └──────────────┬──────────────┘
                                                │
                          ┌─────────────────────┴──────────────────────┐
                          │            Tool dispatch                   │
                          │            (~70 tools across 8 packages)   │
                          └──────────────────┬─────────────────────────┘
                                             │
   ┌─────────────────┬─────────────────┬─────┴───────┬──────────────────┬─────────────────┐
   │                 │                 │             │                  │                 │
   ▼                 ▼                 ▼             ▼                  ▼                 ▼
identity         identity-attest   mercadopago   whatsapp           facturacion       banking + shipping
─────────        ───────────────   ────────────   ────────           ────────────      ─────────────────
CUIT validate    Trust-level       Subscriptions  Send / receive    Factura A/B/C    CBU/CVU validate
ARCA padrón      attestation       Payments       Templates +       FCE MiPyMEs      Bank lookup
WSAA cert        adapters: WA      OAuth          interactive       Pre-flight       BCRA Central
                 OTP, email,       Marketplace    Webhook + HMAC    validator         de Deudores
                 Auth0, Magic,     QR + Cuotas    Phone normalize                    OCA / Andreani
                 MP Identity       3DS / fraud                                        / Correo
                                   Webhook + HMAC

                  All compose. All ship as Vercel AI SDK 6 tools. All Edge-Runtime safe.
                  Same Argentine X.509 cert reused across identity + facturacion.

   ┌───────────────────────────────────────────────────────────┐
   │   @ar-agents/mcp — wraps everything as an MCP server      │
   │   (use the toolkit from Claude Desktop, Cursor, etc.)     │
   └───────────────────────────────────────────────────────────┘
```

## Packages (8 published to npm)

| Package | Tools | Description |
| --- | --- | --- |
| [`@ar-agents/mercadopago`](./packages/mercadopago) | 30 | Subscriptions, Payments, OAuth marketplace, Cuotas, QR, 3DS, fraud scoring (`additional_info`), webhooks (HMAC + replay protection), idempotency-by-default. Edge Runtime + Vercel KV adapter. Tool middleware (compose). [Cookbook](./packages/mercadopago/cookbook) (8 recipes), [MIGRATION.md](./packages/mercadopago/MIGRATION.md) vs official SDK. |
| [`@ar-agents/identity`](./packages/identity) | 2 | CUIT/CUIL validation (modulo-11) + AFIP/ARCA padrón lookup. WSAA SOAP cert auth via subpath. Constancia inscripción (monotributo + IVA condition). |
| [`@ar-agents/identity-attest`](./packages/identity-attest) | 5 | RENAPER workaround pattern. Agent orchestrates verification (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity), gets back HMAC-signed Attestation with `trustLevel: 0..1`. The pattern that didn't exist anywhere. |
| [`@ar-agents/whatsapp`](./packages/whatsapp) | 6 | WhatsApp Business Cloud API. Send text/template/media/buttons/list. Webhook parser + HMAC verification. AR phone normalizer. **`scopedTo` mode** binds outbound tools to a single sender (prevents agent hijacking). |
| [`@ar-agents/facturacion`](./packages/facturacion) | 10 | AFIP/ARCA factura electrónica (WSFE). Factura A/B/C, NC/ND, FCE MiPyMEs. Local pre-flight validator (catches the 10 most common rejection reasons before round-trip). Reuses identity's X.509. |
| [`@ar-agents/banking`](./packages/banking) | 5 | CBU/CVU validation with bank/PSP identification. Bank/PSP enumeration. BCRA Central de Deudores. Public BCRA adapter ships by default. |
| [`@ar-agents/shipping`](./packages/shipping) | 6 | OCA + Correo Argentino + Andreani rate calculation, label creation, tracking. AR provincia normalizer. |
| [`@ar-agents/mcp`](./packages/mcp) | wraps all | Model Context Protocol server. Drop the entire toolkit into Claude Desktop, Cursor, any MCP-aware client. |

## Live demos

| App | URL | What it shows |
| --- | --- | --- |
| [Landing](./apps/landing) | <https://ar-agents.vercel.app> | Toolkit overview |
| [cuit-hello](./apps/cuit-hello) | <https://ar-agents-cuit-hello.vercel.app> | CUIT validation + ARCA padrón lookup (real AFIP cert) |
| [whatsapp-hello](./apps/whatsapp-hello) | <https://ar-agents-whatsapp-hello.vercel.app> | Billing assistant combining all 5 packages — the full pattern |
| [mp-hello](./apps/mp-hello) | dev-only | MP Subscriptions full flow (run locally, port 3013) |

## Documentation philosophy

This repo treats AI agents as first-class consumers of its docs. Inspired by
[Guillermo Rauch's "agent ergonomics" thesis](https://tech.hub.ms/azure/videos/keynote-interview-vercel-s-guillermo-rauch-on-the-agent-era-azure-cosmos-db-conf-2026)
("your customer is the agent the developer or non-developer is wielding")
and the emerging [agents.md convention](https://agents.md/), every package
ships two doc files:

| File | Audience | Contents |
| --- | --- | --- |
| `README.md` | Humans (devs evaluating the package) | Quick start, install, full API reference, examples |
| `AGENTS.md` | LLMs picking tools at runtime / agent authors | Tool selection rules, result schemas to memorize, error-recovery patterns, latency table, composition with other packages, AR context for non-AR agents |

Concrete principles applied throughout:

1. **Tool descriptions are the #1 surface.** Every tool's description tells
   the LLM WHEN to use it, WHEN NOT TO, what it returns, side effects, and
   constraints. This is the string the agent reads to decide.
2. **Pluggable adapters over global config.** Stateful or environment-dependent
   pieces (state stores, AFIP cert chains) are interfaces the consumer wires;
   the lib ships safe defaults that fail gracefully (e.g., `UnconfiguredAfipPadronAdapter`
   returns `available: false` with setup steps instead of throwing).
3. **Errors as docs.** Every typed error class carries an actionable message
   telling the user OR the agent how to recover. No cryptic codes without
   context.
4. **Progressive disclosure.** Tool results return just-in-time context
   (e.g., `next_step` field telling the agent what to do next) instead of
   bloating system prompts.
5. **JSDoc on every export.** Agents reading source for context need rich
   type-level docs, especially for the public API surface.

## Develop

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm test         # run lib tests across packages
pnpm typecheck    # type-check all packages
pnpm build        # build all packages (writes dist/)
pnpm dev          # start the mp-hello demo on http://localhost:3013
```

To run the cuit-hello demo, use `pnpm --filter cuit-hello dev` (port 3014).

## Repo layout

```
ar-agents/
├── apps/
│   ├── mp-hello/                # Next.js demo for @ar-agents/mercadopago (3013)
│   └── cuit-hello/              # Next.js demo for @ar-agents/identity (3014)
├── packages/
│   ├── mercadopago/             # @ar-agents/mercadopago
│   └── identity/                # @ar-agents/identity
├── .github/workflows/ci.yml     # Typecheck + test + build on every push
├── package.json                 # workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json           # shared strict TS config
```

## Compatibility

- Node 20+
- Vercel AI SDK 6+
- Vercel AI Gateway for LLM routing (recommended; BYOK also works)
- Each package's peer deps in its own `package.json`

## License

MIT.
