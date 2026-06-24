# @ar-agents/mercadolibre

> **Mercado Libre Agent Toolkit** for the Vercel AI SDK 6.
> Independent open-source project · Not affiliated with Mercado Libre S.R.L.
>
> A production-grade typed SDK for the agent-relevant MELI API surface — community-built to fill the gap left when [`mercadolibre/nodejs-sdk`](https://github.com/mercadolibre/nodejs-sdk) was archived in February 2022.

---

### Status & disclosures

| | |
| --- | --- |
| **Maturity** | Beta — surface-stable but iterating in public |
| **Maintainership** | Solo-maintained ([Nazareno Clemente](mailto:naza@naza.ar)) |
| **SLA** | None — best-effort community support |
| **Affiliation** | **Independent.** Not endorsed, sponsored, or vetted by Mercado Libre S.R.L. |
| **Trademark** | `MERCADOLIBRE®` is a registered trademark of Mercado Libre S.R.L. This package uses the name in a descriptive, nominative-fair-use sense to identify the API it integrates with. |
| **Security disclosures** | Email `naza@naza.ar` with subject `[security]`. See [SECURITY.md](./SECURITY.md). |
| **Bus factor** | 1. Plan accordingly. |

If you're considering this for production:

- 🧭 [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system context, layers, trust boundaries, design decisions
- 🛡️ [`SECURITY.md`](./SECURITY.md) — threat model, agent-runtime risks, disclosure policy
- 📋 [`MIGRATION.md`](./MIGRATION.md) — side-by-side from the archived `mercadolibre/nodejs-sdk`
- 🏛️ [`GOVERNANCE.md`](./GOVERNANCE.md) — decisions log, bus-factor mitigation, co-maintainer path
- 📈 [`evals/results.md`](./evals/results.md) — LLM-as-judge agent benchmark (18.7/20 mean)
- 📜 [`CHANGELOG.md`](./CHANGELOG.md) — versioned history, BREAKING markers explicit
- 👤 [Operated by →](https://mercadolibre.ar-agents.ar/operated-by) — vendor security questionnaire pre-filled (legal, SLA, incident response, SBOM, latency snapshot)

---

[![npm](https://img.shields.io/npm/v/@ar-agents/mercadolibre)](https://npmjs.com/package/@ar-agents/mercadolibre)
[![tests](https://img.shields.io/badge/tests-111%20unit%20%2B%2010%20property-brightgreen)](#)
[![integration](https://github.com/ar-agents/ar-agents/actions/workflows/mercadolibre-integration-cron.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/mercadolibre-integration-cron.yml)
[![publint](https://img.shields.io/badge/publint-passing-brightgreen)](https://publint.dev/@ar-agents/mercadolibre)
[![attw](https://img.shields.io/badge/types-correct-brightgreen)](https://arethetypeswrong.github.io/?p=@ar-agents/mercadolibre)
[![bundle](https://img.shields.io/badge/brotli-11_KB-brightgreen)](#)

🇦🇷 [Versión en español](./README.es.md) · 📋 [POSITIONING](./POSITIONING.md) · 🏛️ [GOVERNANCE](./GOVERNANCE.md) · 🧭 [ARCHITECTURE](./ARCHITECTURE.md) · 📦 [MIGRATION](./MIGRATION.md) · 👤 [Operated by →](https://mercadolibre.ar-agents.ar/operated-by) · 🤝 [Integrate →](https://mercadolibre.ar-agents.ar/integrate) · 📜 [RFC 001 →](https://mercadolibre.ar-agents.ar/rfc/001)

## MCP host compatibility

The bundled `@ar-agents/mcp` server (which includes `@ar-agents/mercadolibre`) has been verified to install + register tools cleanly in:

| MCP host | Install method | Verified |
| --- | --- | --- |
| Claude Desktop | `claude_desktop_config.json` → `npx -y @ar-agents/mcp` | ✓ |
| Cursor | `~/.cursor/mcp.json` → same shape | ✓ |
| Codeium / Windsurf | Workspace settings → `mcpServers` block | ✓ |
| Continue | `~/.continue/config.json` → `mcpServers` | ✓ |
| Cline | VS Code extension → `cline.mcpServers` | ✓ |
| Anthropic / OpenAI native runtime | `Experimental_Agent` from `ai` SDK 6 (no MCP needed) | ✓ |

The same MCP server bundle works across these hosts because we follow the standard MCP `@modelcontextprotocol/sdk@^1.0.0` server interface — no host-specific adaptations.

`@ar-agents/mercadolibre` is the toolkit you wire into a Vercel AI SDK agent so it can:

- list, edit, create and search **items** with the right category and required attributes;
- triage and answer **post-sale questions** (with a heuristic spam classifier);
- pull, monitor and fulfill **orders + packs** (cart vs single);
- defend **claims & returns** within MELI's 2-day SLA window with parallel evidence uploads;
- print **Mercado Envíos labels** and inspect shipment history;
- **monitor seller reputation** (the thermometer + claims-rate, delayed-handling, cancellations) and fire alerts;
- pick **promotion candidates** that respect a minimum margin floor;
- consume **webhooks** with parsed/typed events and recover from outages by replaying `/myfeeds`.

It runs on **Node 20+, browsers, Vercel Edge Runtime** and is **AI SDK 6 / Zod 4 / TypeScript strict** native.

---

## Install

```bash
pnpm add @ar-agents/mercadolibre
# or
npm i @ar-agents/mercadolibre
```

Peer deps:

- `ai >= 6.0.0` — only required if you import `@ar-agents/mercadolibre/ai-sdk`.
- `zod >= 3.0.0` — bundled types are emitted from Zod 4 and back-compatible.

---

## 60-second tour

```ts
import { MeliClient, getItem, listPromotionCandidates, autoOptInPromotions } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// 1. Fetch + type a listing.
const item = await getItem(client, "MLA1402155766");
console.log(item.title, item.price, item.available_quantity);

// 2. List promo candidates and auto-opt-in only if margin clears 20%.
const r = await autoOptInPromotions(client, sellerId, {
  cogsByItem: { MLA1402155766: 600 }, // your cost-of-goods table
  defaultMinimumMargin: 0.2,
});
console.log(`opted in: ${r.optedIn.length}, skipped: ${r.skipped.length}`);
```

For the 5-minute crash course, see the [cookbook](./cookbook).

---

## OAuth — the part most SDKs get wrong

MELI **single-uses refresh tokens**. If two requests refresh in parallel, one wins and the other gets `refresh_token_reused` — and that error invalidates *both* tokens. The naïve approach (a Postgres column update) loses ~5–10% of refreshes under any concurrency.

This package coalesces concurrent refreshes per-user with an in-process mutex and lets you plug a serializable token store (Postgres, Redis, KV, etc.):

```ts
import { MeliClient, type OAuthTokenStore } from "@ar-agents/mercadolibre";

const store: OAuthTokenStore = {
  async read(userId) { /* SELECT FROM meli_tokens WHERE user_id = $userId */ },
  async write(userId, tokens) {
    /* INSERT … ON CONFLICT … DO UPDATE WHERE refresh_token = $old_refresh_token */
  },
  async remove(userId) { /* optional — DELETE FROM meli_tokens WHERE user_id = $userId */ },
};

const client = new MeliClient({
  auth: {
    kind: "oauth",
    userId: 123_456_789,
    app: {
      clientId: process.env.MELI_APP_ID!,
      clientSecret: process.env.MELI_APP_SECRET!,
    },
    store,
  },
});
```

The mutex is per-`userId` so multi-tenant hosts don't serialize across customers.

> **Edge runtime caveat:** Vercel Edge isolates don't share state. The mutex helps when a single isolate handles multiple concurrent requests, but cross-isolate races still need a token-store-level compare-and-swap (`UPDATE … WHERE refresh_token = $old`). That's the same constraint *every* MELI integration has — this package doesn't pretend to magic it away.

---

## Vercel AI SDK 6 — drop-in tools

```ts
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MeliClient } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({ auth: { kind: "bearer", accessToken: token } });

const agent = new Agent({
  model: anthropic("claude-sonnet-4-6"),
  tools: meliTools(client, { siteId: "MLA", sellerId: 12345 }),
});

const r = await agent.generate({
  prompt: "Cuántas órdenes pagas tengo hoy y hay alguna pregunta sin responder?",
});
```

Tools shipped (14): `list_my_items`, `get_item`, `create_item`, `update_item_price_or_stock`, `categorize_listing_and_plan_attributes`, `list_unanswered_questions`, `answer_question`, `classify_question_spam`, `list_recent_orders`, `get_order`, `list_open_claims`, `defend_claim`, `get_seller_reputation`, `list_promotion_candidates`.

Every tool returns a discriminated `{ ok: true, ... } | { ok: false, code, message }` so the model never has to guess about a thrown error. See [`AGENTS.md`](./AGENTS.md) for the LLM-runtime selection rules and result schemas.

---

## Testing — `mockFetch()` builder + pre-wired client

```ts
import { mockFetch, makeMeliClient } from "@ar-agents/mercadolibre/testing";
import { searchOrders } from "@ar-agents/mercadolibre";

const fm = mockFetch()
  .on("GET", "/orders/search", () => ({
    status: 200,
    body: { paging: { total: 1 }, results: [{ id: 1234, status: "paid" /* ... */ }] },
  }))
  .build();

const client = makeMeliClient({ fetch: fm.fetch });
const r = await searchOrders(client, 12345, { status: "paid" });
expect(r.results).toHaveLength(1);
```

The builder records every request (method, url, headers, body) so you can assert on query strings and request bodies without touching `msw`/`nock`.

---

## API surface (modules)

| Module | Highlights |
| --- | --- |
| `client` | `MeliClient`, `MeliClientOptions`, `FetchOptions` |
| `oauth` | `ensureAccessToken`, `OAuthTokenStore`, `AsyncLock`-coalesced refresh |
| `items` | `getItem`, `multigetItems`, `createItem`, `updateItem`, `pauseItem`, `closeItem`, `relistItem`, `searchSellerItems`, `iterateSellerItems` |
| `categories` | `predictCategory`, `discoverDomain`, `getDomainTechnicalSpecs`, **`categorizeAndPlan`** (one-shot category + required attributes) |
| `questions` | `listQuestions`, `answerQuestion`, `blacklistAsker`, `unblockAsker`, **heuristic spam classifier** (URL/phone/email + repetition + new-account features) |
| `orders` | `searchOrders`, `getOrder`, `getOrderBillingInfo`, `getPack`, **`partitionByPack`** (cart vs single) |
| `claims` | `searchClaims`, `getClaim`, `uploadClaimEvidence`, `listClaimEvidences`, `postClaimMessage`, `reviewReturn`, **`defendClaim`** (the 2-day SLA defender pattern) |
| `shipments` | `getShipment`, `getShipmentHistory`, `fetchLabelsBlob` (ZPL/PDF), `getShippingOptions` |
| `reputation` | `getSellerReputation`, **`evaluateReputationAlerts`** (thermometer thresholds), **`monitorReputation`** (async generator) |
| `promotions` | `listPromotionCandidates`, `optInPromotion`, **`autoOptInPromotions`** (margin-guarded auto-opt-in) |
| `webhooks` | `parseWebhook`, `extractResourceId`, **`replayMissedFeeds`**, **`iterateAllMissedFeeds`** (the 2-day window recovery the rest of the JS ecosystem doesn't handle) |
| `ai-sdk` | `meliTools(client, opts)` returning a Vercel AI SDK 6 `ToolSet` |
| `testing` | `mockFetch()` builder, `makeMeliClient(opts)` factory |

Every public function has a Zod schema for both inputs (where relevant) and responses, validated by default. Pass `skipResponseValidation: true` on the client for hot paths.

---

## Eight blindspots this fills

The official archived SDK never covered, and the 2026 ecosystem still ignores:

1. **Single-use refresh-token races** — coalesced + mutex'd here.
2. **Per-seller rate limiting** — token bucket (24/s, burst 60 by default) so one tenant doesn't starve the rest.
3. **`/missed_feeds` replay** — the only way to survive a 5-minute outage and recover the 2-day backlog.
4. **Category predictor + technical specs** in one call (`categorizeAndPlan`).
5. **Claim defense pattern** — get + parallel evidence uploads + optional message, all under the SLA.
6. **Reputation thermometer alerts** — translate the level + metrics into actionable severities.
7. **Promotion margin guard** — never opt in below your floor, ever.
8. **Heuristic spam classifier for questions** — explainable, no LLM dependency, paired with `borderline` for an LLM second pass.

---

## License

MIT © Nazareno Clemente. This is a community SDK, not affiliated with Mercado Libre S.R.L.
