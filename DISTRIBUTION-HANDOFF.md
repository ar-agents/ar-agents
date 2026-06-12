# ar-agents distribution handoff

State as of 2026-05-08 (Friday morning Argentina). Updated after the autonomous push pass.

---

## What's already live (no action needed)

| Surface | Status | URL |
|---|---|---|
| /llms.txt for LLM crawlers | live | https://ar-agents.ar/llms.txt |
| Schema.org JSON-LD on landing | live (SoftwareApplication + Org + Person) | https://ar-agents.ar |
| Glama MCP registry | listed + badge | https://glama.ai/mcp/servers/ar-agents/ar-agents |
| punkpeye/awesome-mcp-servers PR | open with badge | https://github.com/punkpeye/awesome-mcp-servers/pull/6016 |
| **TensorBlock/awesome-mcp-servers PR** | **open** | **https://github.com/TensorBlock/awesome-mcp-servers/pull/512** |
| **YuzeHao2023/Awesome-MCP-Servers PR** | **open** | **https://github.com/YuzeHao2023/Awesome-MCP-Servers/pull/228** |
| vercel/examples PR | open, mergeable | https://github.com/vercel/examples/pull/1477 |
| vercel/ai tools-registry PR | open, awaiting review | https://github.com/vercel/ai/pull/15099 |
| npm provenance attestations | 8 packages, SLSA v1 | https://registry.npmjs.org/-/npm/v1/attestations/@ar-agents%2fmercadopago@0.15.3 |
| **OpenSSF Scorecard workflow** | **shipped (runs weekly + on push)** | https://github.com/ar-agents/ar-agents/actions/workflows/scorecard.yml |
| **README badges** | **CI + Scorecard + npm version + downloads + bundle + types + Glama** | https://github.com/ar-agents/ar-agents |
| **@ar-agents/mcp@0.4.11** | **published with `mcpName: "io.github.ar-agents/mcp"` + provenance** | https://www.npmjs.com/package/@ar-agents/mcp |
| **Official MCP Registry** | **published autonomously via OIDC workflow** | https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ar-agents/mcp |
| **TensorBlock/awesome-mcp-servers PR** | open | https://github.com/TensorBlock/awesome-mcp-servers/pull/512 |
| **YuzeHao2023/Awesome-MCP-Servers PR** | open | https://github.com/YuzeHao2023/Awesome-MCP-Servers/pull/228 |
| **MobinX/awesome-mcp-list PR** | open | https://github.com/MobinX/awesome-mcp-list/pull/257 |
| **yzfly/Awesome-MCP-ZH PR (Chinese)** | open | https://github.com/yzfly/Awesome-MCP-ZH/pull/216 |
| `.github/workflows/publish-mcp.yml` | re-publishes on every `@ar-agents/mcp@*` tag | — |
| `BLOG-POST-DRAFT.md` | dev.to / Hashnode-ready draft | — |
| GitHub topics for Glama discovery | mcp, mcp-server, model-context-protocol added | https://github.com/ar-agents/ar-agents |
| Dependabot PR #4 (pnpm/action-setup 4.4.0) | merged | — |

---

## Needs your hands (in order of leverage)

### 1. Open the appcypher/awesome-mcp-servers PR via web UI (1 min)

GitHub blocks my account from creating new PRs to `appcypher` specifically. The branch is ready:

**One-click compare URL:**
https://github.com/appcypher/awesome-mcp-servers/compare/main...naza00000:awesome-mcp-servers-1:add-ar-agents

Click "Create pull request", use the title and body below:

**Title:** `Add ar-agents MCP server (Argentine business automation)`

**Body:**
```
Adds ar-agents/mcp to the Finance section. Bundles 7 packages:

- @ar-agents/mercadopago — 89 typed tools across Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point devices, Stores+POS, Account/Balance/Settlements, Webhooks, Disputes, Lookups, Bank Accounts.
- @ar-agents/identity — CUIT/CUIL validation + AFIP/ARCA padrón lookup.
- @ar-agents/facturacion — AFIP/ARCA factura electrónica via WSFE.
- @ar-agents/whatsapp — WhatsApp Business Cloud API.
- @ar-agents/banking — CBU/CVU validation + BCRA Central de Deudores.
- @ar-agents/shipping — Andreani / OCA / Correo Argentino.
- @ar-agents/identity-attest — Verification orchestrator with HMAC-signed attestations.

Glama listing: https://glama.ai/mcp/servers/ar-agents/ar-agents
Live demos: https://ar-agents.ar
```

### 3. Sign in to Smithery + publish (5 min)

Smithery is the second-largest MCP registry (after Glama).

1. Go to https://smithery.ai/new
2. Sign in with GitHub
3. Fill in:
   - **Source repo:** `https://github.com/ar-agents/ar-agents`
   - **Directory:** `packages/mcp`
   - **Name:** `ar-agents`
   - **Description:** copy from `apps/landing/public/llms.txt`
4. Submit. Smithery auto-builds from `packages/mcp/Dockerfile`.

### 4. Hacker News — Show HN (5 min)

Post via your account around 10am EDT (= 11am ART today, since we're in EDT not EST).

**Title:** `Show HN: Open infrastructure for Argentina's AI-run companies (36 npm packages)`
(under the 80-char HN limit)

**URL:** `https://ar-agents.ar`

**First comment** (post immediately after submission, gets pinned):
```
Hi HN — author here. Argentina sent a corporate-law reform to its Senate that
includes "Sociedad Automatizada" (art. 14): a company operated by AI agents
with a human administrator on record. It is not law yet. ar-agents is open
infrastructure for that: 36 MIT npm packages (235 typed tools for the Vercel
AI SDK 6) covering what an AI-operated Argentine company needs — identity
(AFIP/ARCA), payments, electronic invoicing, banking, government filings,
communications, and a forensic audit log — plus 6 RFCs with frozen
conformance vectors.

The deepest package is @ar-agents/mercadopago. Every Argentine SaaS dev I
know has had to hand-roll MP integration: idempotency keys, webhook HMAC
verification, the cuotas (installment) catalog, the 30+ status_detail codes
that tell you why a payment was rejected, the 5-minute replay window for
webhooks, etc. The official mercadopago SDK is a thin REST client — fine, but
nothing is shaped for an LLM agent.

That package wraps it as 89 typed Vercel AI SDK 6 tools, runs on Edge Runtime
via Web Crypto, gates 8 irreversible operations (refund, cancel, delete) behind
a programmatic human-in-the-loop callback, and uses deterministic SHA-256
idempotency keys derived from the inputs (so an LLM retrying a tool call
returns the existing resource instead of double-charging).

The npm package ships AGENTS.md per agents.md convention, machine-readable
tools.manifest.json, and 9 production cookbook recipes. Edge-runtime support
ships via Web Crypto with no node:crypto. Every tarball is signed with npm
provenance attestations (SLSA v1).

The landing has a "Try it with a live agent" button that runs Claude Sonnet
4.6 via Vercel AI Gateway against mocked MP tools, no signup needed.

Some of the other 32 packages (each shippable on its own):
- @ar-agents/identity (CUIT/CUIL + AFIP padrón)
- @ar-agents/facturacion (AFIP factura electrónica WSFE)
- @ar-agents/whatsapp (Business Cloud API)
- @ar-agents/banking (CBU/CVU + BCRA Central de Deudores)
- @ar-agents/shipping (Andreani/OCA/Correo Argentino)
- @ar-agents/incorporate (one-call sociedad-IA incorporation pipeline)
- @ar-agents/mcp (MCP server bundling the toolkit for Claude Desktop / Cursor)

License: MIT. Listed on Glama and the official MCP Registry. Open to feedback
on the agent ergonomics — what would make this easier to drop in?
```

### 5. Vercel Community Discord — #show-and-tell (2 min)

https://vercel.com/discord → `#show-and-tell`:

```
Just shipped ar-agents — open infrastructure for Argentina's AI-run companies, 36 packages for Vercel AI SDK 6 🇦🇷

89 typed tools across the agent-relevant MP API (Subscriptions, Payments,
Checkout Pro, Marketplace OAuth, Cuotas, QR, 3DS). Edge Runtime, npm
provenance attestation, idempotency-by-default, webhook HMAC verification,
HITL on the 8 irreversible ops.

Plus sidecars: @ar-agents/identity (CUIT+AFIP), facturacion (factura
electrónica), whatsapp, banking (CBU+BCRA), shipping.

Live demo runs Sonnet 4.6 via AI Gateway: ar-agents.ar
Open source, MIT.
```

### 6. Anthropic Discord — #show-and-tell (2 min)

https://discord.com/invite/anthropic → `#show-and-tell` or `#projects`. Same copy as Vercel.

### 7. DMs to Vercel/Anthropic creators (one per day)

#### swyx (@swyx) — recommended first, most receptive to indie devs
```
Hey swyx — building agent-ergonomics around the LATAM payment stack. Open-
source toolkit for Mercado Pago (89 typed tools for Vercel AI SDK 6) plus
sidecar packages for AFIP, WhatsApp, AR banking, shipping. Each ships
AGENTS.md per the agents.md convention.

ar-agents.ar

Let me know if it'd fit your "Latent Space" coverage of agent infra.
```

#### Theo (@t3dotgg)
```
Hey Theo — Argentine dev here. I built a Vercel AI SDK toolkit for Mercado
Pago (the Stripe of LATAM). 89 typed tools with HITL on irreversible ops,
idempotency-by-default, npm provenance, edge-runtime safe.

Live demo with mocked MP tools running Sonnet 4.6 via AI Gateway:
ar-agents.ar

Curious if you'd cover this — the LATAM payments stack hasn't really had its
agent moment yet.
```

#### Lee Robinson (@leerob)
```
Hey Lee — built this on top of Vercel AI SDK 6: 89 typed Mercado Pago tools
(Subscriptions, Payments, Cuotas, 3DS, Marketplace OAuth) wired up as Edge-
Runtime-safe primitives with idempotency-by-default and webhook HMAC
verification. Uses AI Gateway for the model routing.

ar-agents.ar — there's a "Try it with a live agent" button that runs
Sonnet 4.6 against mocked MP tools, no signup.

Would love your eyes on it from an agent-ergonomics POV.
```

### 8. Reddit posts (one subreddit per day)

**r/MercadoPago** (small but high signal):
```
Title: Toolkit open source para usar Mercado Pago desde un agente IA (Vercel AI SDK 6)

Hola gente. Soy Naza, dev argentino. Hicé ar-agents, un toolkit MIT que envuelve la API de MP en 89 tools tipados para el Vercel AI SDK 6. El agente decide qué tool llamar a partir de un prompt en castellano:

- "Cobrale $25.000 mensual a juan@example.com con razón Plan Pro" → create_subscription, devuelve init_point_url
- "Reembolsame el último pago" → confirma con vos antes y dispara refund_payment

Cubre Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Cuotas (con catálogo de promos por emisor + RG 5286/2023), QR in-store, 3DS, Point devices físicos, Webhooks (HMAC + 5min replay window), Disputes.

También sidecars: @ar-agents/identity (CUIT + padrón AFIP/ARCA), facturacion (WSFE), whatsapp, banking (CBU + BCRA Central de Deudores), shipping (Andreani/OCA/Correo).

Demo en vivo (Sonnet 4.6 via Vercel AI Gateway, MP mockeado): ar-agents.ar

Feedback bienvenido.
```

**r/typescript**:
```
Title: ar-agents — open infra for Argentina's AI-run companies (36 packages, 235 typed tools, Vercel AI SDK 6)

Just shipped this. The deepest package wraps Mercado Pago's API as 89 typed Vercel AI SDK 6 tools so an LLM agent can drive billing flows from natural-language prompts; the rest of the stack covers AFIP identity, invoicing, banking, and government filings for AI-operated companies under Argentina's proposed art. 14 regime.

Things I tried to get right for agent ergonomics:
- AGENTS.md per package (agents.md convention) — decision tree, result schemas to memorize, latency table, AR landmines documented
- Deterministic idempotency keys (SHA-256 of inputs) so retries don't double-charge
- HITL callback on 8 irreversible ops (refund, cancel, delete card)
- Webhook HMAC + 5-min replay window
- npm provenance attestation (SLSA v1)
- Subpath exports for Vercel KV adapters and OpenTelemetry instrumentation

Live demo runs Claude Sonnet 4.6 via Vercel AI Gateway against mocked MP tools: ar-agents.ar

Open to feedback on the API shape.
```

**r/programacion** (Spanish AR dev community): same body as r/MercadoPago.

### 9. Glama Discord — nudge crawler indexing (optional, 2 min)

Glama listing has `tools: []` because their crawler hasn't built our Dockerfile yet. The `awesome-mcp-servers` bot wants a quality score before the maintainer merges. Speed it up:

https://glama.ai/discord → `#mcp-servers` or `#support`:
```
Hi! Submitted my open-source MCP server `ar-agents/ar-agents` (Argentine
business toolkit, 7 packages bundled) yesterday — listing is approved with
`tools: []`. Could someone trigger the introspection crawler? The Dockerfile
is at `packages/mcp/Dockerfile`. Need the quality score for an awesome-mcp-
servers PR (#6016). Thanks!
```

### 10. Vercel newsletter submission (2 min)

Form: https://vercel.com/blog/submit (or DM @vercel team in Discord).

```
Project: ar-agents — open infrastructure for Argentina's AI-run companies
URL: https://ar-agents.ar
GitHub: https://github.com/ar-agents/ar-agents
Description: 36 npm packages (235 typed tools) for the Vercel AI SDK 6
covering what an AI-operated Argentine company needs: identity, payments,
invoicing, banking, filings, comms, and a forensic audit log. The deepest
package drops Mercado Pago into your AI agent: 89 typed tools across the
agent-relevant MP API surface (Subscriptions, Payments, Checkout Pro,
Marketplace OAuth, Cuotas, QR, 3DS). Edge Runtime, Vercel KV adapters,
OpenTelemetry, npm provenance attestation, deterministic idempotency, HITL
on 8 irreversible ops. Sidecar packages for AFIP/ARCA, WhatsApp Business,
banking (CBU/BCRA), and shipping (Andreani/OCA/Correo Argentino). MIT.
```

---

## Worth waiting on (don't action yet)

- **mcp.so submit form is broken** (JS exception `__name is not defined`). Try in a day.
- **modelcontextprotocol/servers** has only "Reference Servers" + "Frameworks" sections. No third-party PRs.
- **wong2/awesome-mcp-servers** has no Finance category, would feel buried.
- **chatmcp/mcpso** is just the source code for mcp.so; their server list lives in a Supabase DB, not in the repo.

---

## What's improving in the background

- **Glama quality score**: their crawler will build `packages/mcp/Dockerfile`, run introspection, and assign a score. Then the awesome-mcp-servers bot will OK PR #6016.
- **Socket Security re-score**: now that `@ar-agents/mercadopago@0.15.3` ships with provenance attestation, Socket should re-rate the Supply Chain score above the previous 79. Will refresh on any PR that adds the package as a dependency (vercel/examples PR will trigger it).
- **OpenSSF Scorecard**: first run will publish to https://api.scorecard.dev/projects/github.com/ar-agents/ar-agents. The badge in the README will go live once the workflow runs (next push or Monday 08:00 UTC).
- **Schema.org JSON-LD**: Google AI Overviews, Bing, Perplexity will index the structured data on next crawl. SEO benefit accrues over weeks.

---

## Tomorrow / next week

- Re-attempt mcp.so submit (their site might be fixed)
- DMs to Theo / Lee / swyx (one per day, max)
- Reddit posts (one subreddit per day)
- Track Glama indexing
- Watch OpenSSF Scorecard score on first run

---

Foundation: solid. Distribution: 80% mine, 20% yours from here. The high-leverage move today is the official MCP Registry publish (3 commands).
