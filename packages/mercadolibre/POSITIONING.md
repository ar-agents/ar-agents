# Positioning — `@ar-agents/mercadolibre`

> Where this fits in Mercado Libre's AI strategy. Five-minute read for a MELI exec; argument-by-argument for an engineering reviewer.

## The 30-second pitch

In Mercado Libre's Q4 2025 earnings call (Feb 26 2026), CEO Ariel Szarfsztejn told the street: *"we are developing our own agentic experience inside MercadoLibre."* That's a 24-month internal roadmap.

Meanwhile, every Argentine seller running ads on Publi and selling on MELI is **already** asking ChatGPT and Claude to do their listing work today — and falling back to scraping when MELI's API doesn't expose the action. The seller-agent surface that competes with Shopee, Tiendanube, and Mercado Pago's Claude Code marketplace is being built **without** MELI in the loop.

`@ar-agents/mercadolibre` is the open-source seller-agent SDK that surface needs. It's MIT-licensed, npm-published, used by `@ar-agents/mercadopago` (a sibling package built off the same architecture), and engineered to hand off to MELI on day one if MELI wants it.

## What this is — explicitly

> **A typed TypeScript SDK + Vercel AI SDK 6 toolkit + opt-in ACP feed generator + MCP server for the agent-relevant Mercado Libre API surface.**

Concretely:

- 9 domains covered (items, categories, questions, orders + packs, claims, shipments, reputation, promotions, webhooks).
- 14 drop-in tools for any Vercel AI SDK 6 agent, with HITL gates on the 4 irreversible ones.
- ACP-2026-04-17 product feed (opt-in by default — sellers preserve their MELI relationship unless they explicitly opt to expose).
- MCP server bundled into `@ar-agents/mcp` for Claude Desktop / Cursor / Codeium / Continue.
- 142 tests (128 unit + 4 integration vs MELI's live public API + 10 property-based), 0 production CVEs, 11 KB brotli.
- Independent and MIT-licensed. **Not affiliated with Mercado Libre S.R.L.**

## What this is **not** — explicitly

- ❌ Not a replacement for **Verdi** ([OpenAI case study](https://openai.com/index/mercado-libre/)). Verdi is MELI's internal LLM platform serving 17,000 employees + 30,000 microservices. This SDK is for the **external developer + seller surface**, which Verdi doesn't address.
- ❌ Not a buyer-side disintermediation play. The ACP feed is opt-in by default and the discovery payload explicitly directs buyer agents to MELI's checkout (`preferred: true`).
- ❌ Not an enterprise vendor. There is no SLA, no SOC-2, no insurance, no formal support. See [`/operated-by`](https://mercadolibre.ar-agents.ar/operated-by) for honest answers across all 10 questionnaire sections.
- ❌ Not a fork of `mercadolibre/nodejs-sdk`. That repo was archived in February 2022 with the explicit notice "we will stop maintaining our SDKs." This is a fresh implementation built for the agent era.

## Positioning matrix

| | Verdi (MELI internal) | `mercadolibre/mercadolibre-mcp-server` (MELI public) | Tiendanube Lumi | `mercadopago-claude-marketplace` | **`@ar-agents/mercadolibre`** |
| --- | --- | --- | --- | --- | --- |
| Audience | 17k MELI employees | Devs reading docs | Tiendanube sellers | MP integrators | MELI sellers + agencies + community devs |
| Surface | Internal microservices | Doc-RAG only | Catalog AI features | Mercado Pago APIs | **MELI marketplace API** |
| AI runtime | OpenAI partnership | Read tools only | Proprietary | Anthropic-only | **AI SDK 6 + MCP (any host)** |
| License | Proprietary | Proprietary | Proprietary | Apache-2.0 | **MIT** |
| Status | Production | Beta (Oct 2025) | Production | Beta v3 (Apr-May 2026) | Beta v0.4.2 |

The empty cell that should be filled but isn't: **MELI marketplace × external sellers × any AI runtime**. That's where this lives.

## The Verdi complement framing

A reasonable concern from MELI engineering: *"We have Verdi. Why would we ratify an outsider's SDK?"*

Honest answer:

| Verdi serves | This serves |
| --- | --- |
| 17,000 internal employees | 1M+ external sellers |
| 30,000 microservices | The 9 agent-relevant API domains a seller actually uses |
| OpenAI partnership for support automation | Bring-your-own-runtime: AI SDK 6, MCP, LangChain, etc. |
| Closed-source, internal | MIT, npm-published, forkable |

These are non-overlapping audiences. Verdi can't and shouldn't ship to a Tere-vending-yerba-amanda's WhatsApp business agent, and a community SDK can't and shouldn't ship to MELI's internal ticket triage. The agent layer needs both.

## Why MELI should care (the strategic argument)

1. **You publicly told the street you're building an agentic experience.** Internal roadmaps for that are 12-24 months. The community has already built half of it. You can take it.

2. **ChatGPT Instant Checkout shipped with Etsy + Shopify**, not MELI. That's the canary. Buyer agents will discover catalogs that emit ACP feeds first; the rest get crawled and disintermediated. **The defense isn't blocking the protocol — it's emitting a controlled feed and routing buyers back through your checkout** (which is exactly what this SDK does, with the `checkout: { preferred: true }` discovery flag).

3. **Mercado Pago shipped a Claude Code marketplace** ([repo](https://github.com/mercadopago/mercadopago-claude-marketplace)) for payment integrators. There's no equivalent for marketplace sellers. The seller-side gap is currently **unstaffed and visibly empty** in your public surface.

4. **Tiendanube's Lumi (launched InovA 2026)** is the direct LATAM competitor. They moved first on the seller-AI assistant. Every month MELI doesn't have an answer, mid-market sellers see Tiendanube as the AI-friendly platform.

## Three paths to engagement

If the case above lands, here's how to act on it. Each path has a different cost/control tradeoff.

### Path A — Co-maintain (lowest friction)

A MELI engineer joins as co-maintainer on `@ar-agents/mercadolibre`. We keep the package independent, MIT-licensed, but the contributor list reflects formal MELI participation. Decisions are made jointly, the package gets a "co-maintained with Mercado Libre S.R.L." line in the README.

- **What MELI gets:** influence on roadmap, public credit, no IP transfer, ability to fork at any time.
- **What we get:** legitimacy, insider technical signal on what to ship next.
- **Reversibility:** total. Either side walks at any time.

### Path B — Fork into `mercadolibre/mercadolibre-mcp-server` (medium)

The `@ar-agents/mercadolibre` toolkit gets ported into MELI's existing public MCP server repo, expanding it from doc-RAG to seller-side actions. Naza assists with the migration as a contractor for ~30 days. The community npm package stays alive but gets superseded by the MELI-branded one for production use.

- **What MELI gets:** full IP control, your repo, your audit history.
- **What we get:** a 30-day contract + the credibility of having built MELI's official agent SDK.
- **Reversibility:** one-way (the IP transfers).

### Path C — License the source code (most formal)

MELI buys an exclusive or non-exclusive license to the package's source. Naza either sunsets the public repo or assigns IP rights. Terms negotiable.

- **What MELI gets:** legal certainty, indemnification, full IP.
- **What we get:** a financial outcome + a clean handoff.
- **Reversibility:** terms-dependent.

All three preserve MELI's ability to publicly ship an agentic seller experience faster than the 24-month internal roadmap implies. We are not asking for a vendor contract; we are offering an OSS contributor track that lets you skip 60-80% of the build.

## Who decides

The right targets at MELI for this conversation, per our research:

- **Pablo Zamudio** — ML Expert at GenAI Engineering Research, built+shipped the existing MCP servers. ([LinkedIn](https://www.linkedin.com/in/pzamudio/), [Medium](https://medium.com/@pablo.zamudio_45072)). The right first conversation.
- **Sebastian Barrios** — SVP Tech, public face of Verdi. ([QCon SF 2024 speaker](https://qconsf.com/speakers/sebastianbarrios)). Strategic leverage if Pablo escalates.
- **Daniel Rabinovich** — COO + CTO. ([LinkedIn](https://ar.linkedin.com/in/drabinovich)). Decision authority if Sebastian endorses.
- **Ariel Szarfsztejn** — CEO, owns the "agentic experience" framing from the earnings call. Final reach if it gets there.

Path of least resistance: open a substantive PR to [`mercadolibre/mercadolibre-mcp-server`](https://github.com/mercadolibre/mercadolibre-mcp-server) extending it with seller-side read tools, then DM Pablo Zamudio with the PR linked. The artifact is the introduction.

## Contact

- **Strategic / commercial:** `naza@helloastro.co` subject `[meli-strategic]`
- **Technical:** `naza@helloastro.co` subject `[meli-technical]`
- **Repo for direct review:** [github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre](https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre)
