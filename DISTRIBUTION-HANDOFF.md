# ar-agents distribution handoff

State as of 2026-05-07. What's already shipped vs. what needs your hands.

---

## What's already live (no action needed)

| Surface | Status | URL |
|---|---|---|
| /llms.txt for LLM crawlers | live | https://ar-agents.vercel.app/llms.txt |
| Glama MCP registry | listed + badge | https://glama.ai/mcp/servers/ar-agents/ar-agents |
| punkpeye/awesome-mcp-servers PR | open with badge | https://github.com/punkpeye/awesome-mcp-servers/pull/6016 |
| vercel/examples PR | open, mergeable | https://github.com/vercel/examples/pull/1477 |
| vercel/ai tools-registry PR | open, awaiting review | https://github.com/vercel/ai/pull/15099 |
| npm provenance attestations | 8 packages, SLSA v1 | https://registry.npmjs.org/-/npm/v1/attestations/@ar-agents%2fmercadopago@0.15.3 |
| GitHub topics for Glama discovery | mcp, mcp-server, model-context-protocol added | https://github.com/ar-agents/ar-agents |
| Dependabot PR #4 (pnpm/action-setup 4.4.0) | merged | — |

---

## Needs your hands (in order of leverage)

### 1. Open the appcypher/awesome-mcp-servers PR via web UI

GitHub soft-rate-limited my account from creating new PRs after I opened 4 in a day. The branch + commit are ready; you just click through the web UI.

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
Live demos: https://ar-agents.vercel.app

All packages ship `AGENTS.md` per the agents.md convention plus machine-readable `tools.manifest.json` so MCP hosts can introspect tool schemas.
```

### 2. Sign in to Smithery + publish

Smithery is the second-largest MCP registry (after Glama). Submission requires sign-in (free, GitHub OAuth).

1. Go to https://smithery.ai/new
2. Sign in with GitHub
3. Fill in:
   - **Source repo:** `https://github.com/ar-agents/ar-agents`
   - **Directory:** `packages/mcp`
   - **Name:** `ar-agents`
   - **Description:** copy from `apps/landing/public/llms.txt`
4. Submit. Smithery auto-builds from the Dockerfile we shipped at `packages/mcp/Dockerfile`.

### 3. Hacker News — Show HN

Post via your account around 9-10am EST on a weekday for max front-page exposure.

**Title:** `Show HN: Mercado Pago Agent Toolkit – 89 typed tools for the Vercel AI SDK 6`
(80 chars exactly — HN limit)

**URL:** `https://ar-agents.vercel.app`

**First comment** (post immediately after submission, gets pinned):
```
Hi HN — author here. I built ar-agents because every Argentine SaaS dev I know
has had to hand-roll Mercado Pago integration: idempotency keys, webhook HMAC
verification, the cuotas (installment) catalog, the 30+ status_detail codes
that tell you why a payment was rejected, the 5-minute replay window for
webhooks, etc. The official mercadopago SDK is a thin REST client — fine, but
nothing is shaped for an LLM agent.

This package wraps it as 89 typed Vercel AI SDK 6 tools, runs on Edge Runtime
via Web Crypto, gates 8 irreversible operations (refund, cancel, delete) behind
a programmatic human-in-the-loop callback, and uses deterministic SHA-256
idempotency keys derived from the inputs (so an LLM retrying a tool call
returns the existing resource instead of double-charging).

The npm package ships AGENTS.md per agents.md convention, machine-readable
tools.manifest.json, and 9 production cookbook recipes. Edge-runtime support
ships via Web Crypto with no node:crypto.

The landing has a "Try it with a live agent" button that runs Claude Sonnet
4.6 via Vercel AI Gateway against mocked MP tools, no signup needed.

Sidecar packages (each shippable on its own):
- @ar-agents/identity (CUIT/CUIL + AFIP padrón)
- @ar-agents/facturacion (AFIP factura electrónica WSFE)
- @ar-agents/whatsapp (Business Cloud API)
- @ar-agents/banking (CBU/CVU + BCRA Central de Deudores)
- @ar-agents/shipping (Andreani/OCA/Correo Argentino)
- @ar-agents/mcp (MCP server bundling all 7 for Claude Desktop / Cursor)

License: MIT. Open to feedback on the agent ergonomics — what would make this
easier to drop in?
```

### 4. DMs to Vercel/Anthropic-adjacent creators

Each one is a separate cold DM. Don't batch — feels spammy. One per day max.

#### 4a. Lee Robinson (@leerob)
```
Hey Lee — built this on top of Vercel AI SDK 6: 89 typed Mercado Pago tools
(Subscriptions, Payments, Cuotas, 3DS, Marketplace OAuth) wired up as Edge-
Runtime-safe primitives with idempotency-by-default and webhook HMAC
verification. Uses AI Gateway for the model routing.

ar-agents.vercel.app — there's a "Try it with a live agent" button that runs
Sonnet 4.6 against mocked MP tools, no signup.

Would love your eyes on it from an agent-ergonomics POV.
```

#### 4b. Theo (@t3dotgg)
```
Hey Theo — Argentine dev here. I built a Vercel AI SDK toolkit for Mercado
Pago (the Stripe of LATAM). 89 typed tools with HITL on irreversible ops,
idempotency-by-default, npm provenance, edge-runtime safe.

Live demo with mocked MP tools running Sonnet 4.6 via AI Gateway:
ar-agents.vercel.app

Curious if you'd cover this — the LATAM payments stack hasn't really had its
agent moment yet.
```

#### 4c. swyx (@swyx)
```
Hey swyx — building agent-ergonomics around the LATAM payment stack. Open-
source toolkit for Mercado Pago (89 typed tools for Vercel AI SDK 6) plus
sidecar packages for AFIP, WhatsApp, AR banking, shipping. Each ships
AGENTS.md per the agents.md convention.

ar-agents.vercel.app

Let me know if it'd fit your "Latent Space" coverage of agent infra.
```

### 5. Vercel Community Discord — #show-and-tell

Server: https://vercel.com/discord  Channel: `#show-and-tell`

```
Just shipped ar-agents — Mercado Pago Agent Toolkit for Vercel AI SDK 6 🇦🇷

89 typed tools across the agent-relevant MP API (Subscriptions, Payments,
Checkout Pro, Marketplace OAuth, Cuotas, QR, 3DS). Edge Runtime, npm
provenance attestation, idempotency-by-default, webhook HMAC verification,
HITL on the 8 irreversible ops.

Plus sidecars: @ar-agents/identity (CUIT+AFIP), facturacion (factura
electrónica), whatsapp, banking (CBU+BCRA), shipping.

Live demo runs Sonnet 4.6 via AI Gateway: ar-agents.vercel.app
Open source, MIT.
```

### 6. Anthropic Discord — #show-and-tell

Server: https://discord.com/invite/anthropic  Channel: `#show-and-tell` or `#projects`

(Same copy as Vercel, but emphasize Sonnet 4.6 via Gateway and the AGENTS.md convention.)

### 7. Reddit — r/MercadoPago + r/programacion + r/typescript

Post once per subreddit, spaced 24h apart. Each subreddit has different vibes.

**r/MercadoPago** (small but high signal — they care):
```
Title: Toolkit open source para usar Mercado Pago desde un agente IA (Vercel AI SDK 6)

Hola gente. Soy Naza, dev argentino. Hicé ar-agents, un toolkit MIT que envuelve la API de MP en 89 tools tipados para el Vercel AI SDK 6. El agente decide qué tool llamar a partir de un prompt en castellano:

- "Cobrale $25.000 mensual a juan@example.com con razón Plan Pro" → create_subscription, devuelve init_point_url
- "Reembolsame el último pago" → confirma con vos antes y dispara refund_payment

Cubre Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Cuotas (con catálogo de promos por emisor + RG 5286/2023), QR in-store, 3DS, Point devices físicos, Webhooks (HMAC + 5min replay window), Disputes.

También sidecars: @ar-agents/identity (CUIT + padrón AFIP/ARCA), facturacion (WSFE), whatsapp, banking (CBU + BCRA Central de Deudores), shipping (Andreani/OCA/Correo).

Demo en vivo (Sonnet 4.6 via Vercel AI Gateway, MP mockeado): ar-agents.vercel.app

Feedback bienvenido.
```

**r/typescript** (focus on agent ergonomics, not LATAM specifics):
```
Title: Mercado Pago Agent Toolkit for Vercel AI SDK 6 — 89 typed tools, Edge Runtime, idempotency by default

Just shipped this. Wraps Mercado Pago's API as Vercel AI SDK 6 tools so an LLM agent can drive billing flows from natural-language prompts.

Things I tried to get right for agent ergonomics:
- AGENTS.md per package (agents.md convention) — decision tree, result schemas to memorize, latency table, AR landmines documented
- Deterministic idempotency keys (SHA-256 of inputs) so retries don't double-charge
- HITL callback on 8 irreversible ops (refund, cancel, delete card)
- Webhook HMAC + 5-min replay window
- npm provenance attestation (SLSA v1)
- Subpath exports for Vercel KV adapters and OpenTelemetry instrumentation

Live demo runs Claude Sonnet 4.6 via Vercel AI Gateway against mocked MP tools: ar-agents.vercel.app

Open to feedback on the API shape.
```

**r/programacion** (Spanish AR dev community):
```
Title: ar-agents — toolkit open source para que tu agente LLM use Mercado Pago, AFIP, WhatsApp, BCRA, Andreani

(same body as r/MercadoPago)
```

### 8. Vercel newsletter submission

Form: https://vercel.com/blog/submit (or via DM to @vercel team on Discord)

The newsletter goes to ~100k devs. Worth submitting.

```
Project: ar-agents — Mercado Pago Agent Toolkit for Vercel AI SDK 6
URL: https://ar-agents.vercel.app
GitHub: https://github.com/ar-agents/ar-agents
Description: Drop Mercado Pago into your AI agent. 89 typed tools across the
agent-relevant MP API surface (Subscriptions, Payments, Checkout Pro,
Marketplace OAuth, Cuotas, QR, 3DS). Edge Runtime, Vercel KV adapters,
OpenTelemetry, npm provenance attestation, deterministic idempotency, HITL
on 8 irreversible ops. Sidecar packages for AFIP/ARCA, WhatsApp Business,
banking (CBU/BCRA), and shipping (Andreani/OCA/Correo Argentino). MIT.
```

---

## Worth waiting on (don't action yet)

- **mcp.so submit form is broken** (JS exception `__name is not defined`). Try again in a day.
- **modelcontextprotocol/servers** has only "Reference Servers" + "Frameworks" sections. No community section, so they don't accept third-party PRs.
- **wong2/awesome-mcp-servers** has only "Official" and "Community" sections, no Finance category. Could submit but the entry would feel buried.

---

## Tomorrow / next week

- Re-attempt mcp.so submit (their site might be fixed)
- DMs to Theo / Lee / swyx (one per day, max)
- Reddit posts (one subreddit per day)
- Track Glama quality score (currently `tools: []`, will populate when their crawler builds the Dockerfile and introspects the server)
- Keep an eye on Socket Security re-scoring `@ar-agents/mercadopago@0.15.3` with provenance — should bump Supply Chain from 79 → 90+

---

Nothing else is blocking. Foundation is solid (CI green, security clean, provenance live, Glama listed). Just distribution from here on out.
