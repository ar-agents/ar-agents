# @ar-agents/mercadolibre

## 0.5.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.5.0

### Minor Changes

- [`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep — final wave: every remaining OG package now extends
  `ArAgentsError` from `@ar-agents/core`.

  After this release, **23 of 26 `@ar-agents/*` packages** share the
  uniform `{ code, retryable, context }` family contract. The three
  packages still on plain `Error` (`agentic-commerce-bridge`, `ap2`,
  `mcp`) have no dedicated `errors.ts` module — they throw `Error`
  inline at the call site; their lift is a deeper refactor tracked
  separately.

  For all 12 packages here: backward compatible. Public constructors,
  field names, and `instanceof` checks unchanged. New: `error.retryable`
  flag wired per code (e.g. `wsfe_service_unavailable: true`,
  `bcra_rate_limited: true`, `discovery_failed: true`, `ckan_unreachable:
true`, `fetcher_unreachable: true`, `shipping_carrier_error: true`);
  non-transient codes default to `retryable: false`.

  One **internal-API** rename in `@ar-agents/whatsapp`: `WhatsAppApiError.code`
  (previously the Meta numeric error code) is now exposed as
  `WhatsAppApiError.metaCode` so the family-uniform `code: string`
  contract (`whatsapp_meta_<n>`) can sit on the same instance. Callers
  that read `err.code` as a number must migrate to `err.metaCode`; the
  deserialized webhook event field `event.errors[i].code` is unchanged
  (still numeric, since it's not a `WhatsAppApiError` instance).

  Family-coherence count after this release: **23 / 26 packages**.

## 0.4.3 — 2026-05-09

Strategic positioning + outreach-readiness pass. The package as code is unchanged — what changes is everything around it that a marketplace exec, procurement reviewer, or external co-maintainer would read before deciding to engage.

### Added — Strategic positioning artifacts

- **[`POSITIONING.md`](./POSITIONING.md)** — five-minute strategic doc for a MELI exec. Cites the Q4 2025 earnings call (Szarfsztejn: _"we are developing our own agentic experience inside MercadoLibre"_). Positions explicitly as a Verdi-complement (external sellers + community devs), not a competitor. Three engagement paths spelled out (co-maintain / fork-into-MELI-repo / license).
- **[RFC 001 — Argentine Agentic Commerce 2027](./docs/rfc-001-argentine-agentic-commerce-2027.md)** — the strategic technical document. 3-layer architecture for LATAM marketplaces to participate in agentic commerce without being disintermediated by ChatGPT Instant Checkout / Anthropic / Gemini. Cites Forrester + Flywheel projections (13–20% of LATAM retail intent will route through agents by 2027). Citation-ready public URL at [`/rfc/001`](https://mercadolibre.ar-agents.ar/rfc/001).
- **[`README.es.md`](./README.es.md)** — Spanish-first version of the README. AR cultural fit. Linked from the English README header.
- **[`/integrate` page on the landing](https://mercadolibre.ar-agents.ar/integrate)** — procurement-friendly 3-step adoption path (try / partner / license) with explicit obligations + reversibility per path.

### Added — MCP host compatibility matrix

The bundled `@ar-agents/mcp` server (which includes this package) is verified compatible with: Claude Desktop · Cursor · Codeium / Windsurf · Continue · Cline · Anthropic / OpenAI native runtime via Vercel AI SDK 6. Documented in the README.

### Notes on npm provenance

`publishConfig.provenance: true` is set. Provenance attestations require a publish from GitHub Actions with OIDC (not from a local machine). The first CI-driven release will produce a public provenance trail visible at `https://www.npmjs.com/package/@ar-agents/mercadolibre/v/<version>#provenance`.

### Tests

No code changes; same 142 tests (128 unit + 4 integration vs MELI live + 10 property-based). All green.

## 0.4.2 — 2026-05-09

Vendor-readiness pass. Designed to move adoption probability for risk-averse reviewers (procurement, security, legal) by surfacing answers they normally extract via questionnaire.

### Added — vendor-questionnaire artifacts

- **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — system context, layered architecture (mermaid diagrams), module-responsibility map, trust boundaries, "why each design choice" rationale, and a "where things will probably change" forward-looking section.
- **[`GOVERNANCE.md`](./GOVERNANCE.md)** — current decisions log, bus-factor de-risk plan with the explicit co-maintainer path, strategic-decisions audit trail, and "out of scope" disclaimers.
- **[`MIGRATION.md`](./MIGRATION.md)** — side-by-side guide from the archived `mercadolibre/nodejs-sdk` (still serving ~37 weekly downloads as of mid-2026), with mechanical migration steps and a coverage parity matrix.
- **[`/operated-by` page on the landing](https://mercadolibre.ar-agents.ar/operated-by)** — pre-filled vendor security questionnaire across 10 sections (legal, contact + disclosure, SLA + incident response, bus factor, security posture, supply chain, data privacy, quality signals, production latency snapshot, termination). Honest answers, including the uncomfortable ones.
- **[`/api/openapi.json` on bridge-hello](https://bridge-hello.ar-agents.ar/api/openapi.json)** — OpenAPI 3.1 spec auto-emitted from the running facilitator. Auditable + agent-consumable.

### Added — production latency snapshot

Real numbers from the live `bridge-hello.ar-agents.ar` deployment (50 runs at concurrency 10, measured from a Buenos Aires client, 2026-05-09 17:30 UTC):

| Endpoint                             | p50   | p95    | p99    | errors |
| ------------------------------------ | ----- | ------ | ------ | ------ |
| `GET /.well-known/acp.json`          | 44ms  | 1253ms | 1349ms | 0/50   |
| `GET /.well-known/agentic-feed.json` | 30ms  | 46ms   | 105ms  | 0/50   |
| `GET /api/feed/products` (opt-in)    | 31ms  | 228ms  | 229ms  | 0/50   |
| `POST /api/acp/checkout_sessions`    | 167ms | 396ms  | 399ms  | 0/50   |

The p95 outlier on ACP discovery is one Vercel cold start. Reproducible via `node test/bench/loadtest.mjs`.

### Tests

No code-level changes; same 142 tests (128 unit + 4 integration vs MELI live + 10 property-based).

## 0.4.1 — 2026-05-09

Positioning + posture pass driven by an adversarial review (skeptical MELI engineering manager perspective). No code-level breaking changes; the surface gets honest about what it is and isn't.

### Added — README honest status block + trademark notice

The README now opens with explicit disclosures:

- **Maturity**: Beta — surface-stable but iterating in public.
- **Maintainership**: Solo-maintained ([Nazareno Clemente](mailto:naza@helloastro.co)).
- **SLA**: None.
- **Affiliation**: Independent. Not endorsed, sponsored, or vetted by Mercado Libre S.R.L.
- **Trademark**: `MERCADOLIBRE®` is a registered trademark of Mercado Libre S.R.L. The package name uses it in a descriptive, nominative-fair-use sense.
- **Bus factor**: 1. Plan accordingly.

This addresses the real legal + adopter concern flagged by the adversarial review (medium-high trademark-confusion risk + bus-factor opacity) without renaming the package mid-stream and breaking the existing 41 weekly downloads / @ar-agents/mcp bundling.

### Changed — ACP feed is now opt-in by default

The bridge-hello reference implementation at `/api/feed/products` returns **403 Forbidden** unless one of:

- `FEED_OPT_IN=1` is set in the server environment, OR
- The request includes `Opt-In: agentic-commerce-feed/2026-04-17` header.

The discovery payload at `/.well-known/agentic-feed.json` honestly advertises the opt-in status and includes a `preference_note` directing buyer agents toward MELI's checkout (`/api/acp/checkout_sessions`) by default.

**Why.** ACP feeds let buyer agents transact outside the marketplace, bypassing the marketplace-buyer relationship MELI cultivates (Mercado Pago, Mercado Envíos, claims SLA, reviews). That's a tradeoff some sellers want, others don't. The default position has to be "don't expose by default" — sellers opt in when they understand the tradeoff.

### Added — SECURITY.md hardening

- Disclosure address (`naza@helloastro.co`) + 72h response target + 30d coordinated-disclosure window.
- Explicit "Known limitations" section: bus factor 1, no SLA, not vetted by MELI.
- Agent-runtime-specific threat vectors documented:
  - Prompt injection via tool-result content (question / claim text)
  - MCP supply-chain compromise consequence (full seller-account write on every connected MCP host)
  - Multi-instance OAuth refresh requires database-level CAS
  - ACP feed disintermediation tradeoff

### Tests

No test changes — same 142 (128 unit + 4 integration vs MELI live + 10 property-based). All green.

## 0.4.0 — 2026-05-09

Two strategic features that move the toolkit from "agent-friendly SDK" to "agent-native commerce infrastructure".

### Added — Human-in-the-loop (HITL) gates

A programmatic safety boundary on **irreversible** tool calls. The LLM cannot bypass this — it isn't a system-prompt rule, it's a function call that doesn't fire until the host confirms.

```ts
meliTools(client, {
  siteId: "MLA",
  sellerId: 12345,
  hitl: {
    requireConfirmation: async (ctx) => {
      const ok = await yourApp.askUser({
        summary: ctx.summary,
        severity: ctx.severity,
      });
      return ok ? { approve: true } : { approve: false };
    },
    autoApprove: (ctx) =>
      ctx.kind === "answer_question" && (ctx.input as any).text.length < 200,
  },
});
```

Covers `create_item`, `update_item_price_or_stock`, `pause_item`, `close_item`, `relist_item`, `answer_question`, `defend_claim`, `opt_in_promotion`, `blacklist_asker`. Each context carries a stable `kind`, `resourceId`, Spanish-language `summary`, and `severity` (low/medium/high) so hosts can drive different UIs per op.

When the host rejects, the tool returns `{ ok: false, code: "hitl_rejected", reason }` — the agent never throws, just gets feedback it can adjust on. When the host returns an `override`, the agent's input gets edited in-place before the call fires (useful for "let me edit this draft answer first" UX).

7 new tests cover approve / reject / override / autoApprove / severity classification.

See [Cookbook 11](./cookbook/11-human-in-the-loop.md) for production patterns.

### Added — ACP feed generator (`@ar-agents/mercadolibre/feed` subpath)

Emit your seller catalog as an Agentic Commerce Protocol-compatible product feed. Lets buyer agents (ChatGPT, Claude, Gemini) discover your MELI listings without crawling.

```ts
import {
  buildFeedPage,
  iterateFeed,
  meliItemToFeedProduct,
} from "@ar-agents/mercadolibre/feed";

// Cursor-paginated page (best for HTTP feed endpoints):
const page = await buildFeedPage(client, sellerId, { limit: 50, cursor });

// Streaming iterator (best for /api/feed routes that pipe to the response):
for await (const product of iterateFeed(client, sellerId)) yield product;

// Pure mapper (compose your own enumeration):
const fp = meliItemToFeedProduct(meliItem);
```

`FeedProduct` shape is ACP `2026-04-17`-compatible — generic agents see standard fields (id, title, currency, price, images), MELI-specific agents read `vendor_metadata.meli` for richer reasoning (condition, sold_quantity, listing_type_id, tags). Currency is uppercased per ACP spec; prices are major-units. Active-only by default; pass `acceptableStatuses` to override.

`bridge-hello` ships a reference implementation at:

- `/.well-known/agentic-feed.json` — discovery
- `/api/feed/products?cursor=&limit=` — the feed itself, ETag-cached, ISR 60s

10 new tests covering pure mapper / pagination / cursor threading / streaming / status filtering. Demonstrated end-to-end on https://bridge-hello.ar-agents.ar.

See [Cookbook 12](./cookbook/12-acp-feed-generator.md) for the full pattern.

### Tests

- 17 new tests across HITL + Feed.
- Total: **128 unit + 4 integration + 10 property** = 142 tests.

## 0.3.0 — 2026-05-09

Production-readiness pass — small surface area changes, real correctness fixes.

### Added

- **`multigetItems` auto-chunks** input arrays past MELI's 20-id limit and
  fetches chunks in parallel (default concurrency 4). Caller-side ordering is
  preserved across chunk boundaries. Optional `MultigetOptions.concurrency`
  tunes it. **Breaking on the error path:** previously, calling with > 20
  ids threw `"MELI multiget supports up to 20 ids per call"`. Now it just
  works. If you were catching that string, you can drop the `try`.
- **`MeliApiError.meliCode` + `.meliMessage` + `.meliCauses`** parsed from
  MELI's standard error envelope (`{ error, message, status, cause }`) AND
  the post-purchase variant (`{ error_code, description }`). Type guards
  shipped: `err.isRateLimited()`, `err.isForbidden()`, `err.isUnauthorized()`,
  `err.isValidationError()`. The previous `err.meliErrorCode()` method still
  works (delegates to `meliCode`).

### Tests

- 9 new unit tests (multiget chunking + error parsing edge cases).
- Total: **111 unit + 4 integration + 10 property tests**.

## 0.2.0 — 2026-05-09

Round-2 production-grade pass driven by a multi-agent code review (eng-arch,
correctness, DX). 14 distinct findings, all fixed.

### Breaking

- **Default retry policy now restricts 5xx retries to idempotent verbs**
  (GET / HEAD / OPTIONS / PUT / DELETE). POST / PATCH on 5xx are no longer
  retried by default — MELI's gateway can split-brain (persist a request
  and then 5xx the response), which would create duplicate listings,
  double-answers, or duplicate promo opt-ins on retry. 429 is still safe
  to retry on any verb (the request never reached the application).
  Override per-call with `retryClassifier`.
- **`monitorReputation` now rethrows `MeliAuthError` and
  `MeliValidationError`** instead of swallowing them. Permanent errors
  (revoked seller, schema drift) need to surface — the polling loop is
  for transients only. Pass `onTransientError` to log/instrument
  recoverable failures without breaking the loop.
- **`defendClaim` now uploads evidences sequentially** instead of in
  parallel. MELI's `/claims/{id}/evidences` has one-shot semantics — N
  parallel requests can persist some + reject others, leaving the claim
  half-defended with no way to amend. Sequential uploads cap the blast
  radius. Result type adds `failedEvidences[]` so callers can route
  partial failures to manual review.
- **Falsy guards changed to `!== undefined`** in 5 modules. Previously,
  `if (options.offset) query["offset"] = ...` silently dropped `offset: 0`
  (a legal first-page request).

### Added

- **Telemetry hooks** — `onRequest` / `onResponse` / `onRetry` /
  `onRateLimitWait` for OpenTelemetry, Sentry, Datadog, custom logging.
  Hooks see method/url/status/duration, never headers (no Authorization
  leak) or bodies (no PII leak).
- **`requestTimeoutMs`** on `MeliClient` (default 30s). Composed with the
  caller's `signal` via `AbortSignal.any`. A wedged TCP connection can no
  longer burn an entire Vercel Edge function budget on attempt #1.
- **`client.fetchRaw()`** for binary endpoints (PDF/ZPL labels) — same
  auth + retry + rate-limit + telemetry pipeline as `client.fetch<T>()`,
  just returns the `Response` instead of parsing JSON.
- **`Retry-After` HTTP-date support** — RFC 7231 dates parsed via
  `Date.parse` if the value isn't a plain integer.
- **`iterateAllMissedFeeds` dedup** — `(topic, resource, sent)` tuple key
  prevents double-yielding when the live feed grows during pagination.
- **`TokenBucketRateLimiter.sweepIdleBuckets()`** + auto-sweep every 256
  acquires. Multi-tenant hosts with thousands of distinct seller-IDs no
  longer leak bucket entries.

### Fixed

- **OAuth `postTokenRequest` now uses the configured `fetchImpl`** —
  previously bypassed it via global `fetch`, breaking tests + Edge runtime
  consumers.
- **`promotions.autoOptInPromotions`** no longer falls back to
  `original_price` when MELI didn't suggest a discount. The fallback
  produced a margin computed against full price + an opt-in at full price,
  defeating the entire promotion. Now skips with `reason: "no_suggested_price"`.
- **`questions.PHONE_RE`** tightened. Old regex over-matched MELI order IDs
  (16-digit runs) as phone numbers, polluting the spam classifier with
  false positives. New regex requires word-boundaries + explicit
  separators OR a `+` country prefix.
- **SSRF guard** on `client.buildUrl()` — rejects any path that contains
  a scheme (`http://...`) or protocol-relative authority (`//evil.com/x`).
  Defence in depth — domain helpers always pass `/...` paths, but a future
  helper handling user input is now safe by construction.
- **Bearer-scope key** in rate-limit telemetry no longer leaks the last 8
  chars of the access token. Now hashed via FNV-1a 32-bit.

### Tests

- 12 new tests covering retry semantics, telemetry hooks, claim partial
  failure, rate-limiter GC, and the property-based PHONE_RE invariants.
- Total in 0.2.0: 102 unit + 4 integration + 10 property.
- `pnpm audit --prod`: zero CVEs.

### Docs

- New `SECURITY.md` with full threat model + audit results.
- Cookbook 8-10 added: Vercel KV webhook dedup, Upstash Redis distributed
  rate limiter (GCRA), Cloudflare Durable Objects per-userId OAuth refresh.
- Postman collection (`postman/ar-agents-mercadolibre.postman_collection.json`).
- LLM-as-judge eval suite (`evals/run.ts` + 10 scenarios).

## 0.1.0 — 2026-05-09

First public release. Production-grade TypeScript SDK for Mercado Libre's
agent-relevant API surface. Faithful to the docs at
[developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/).

The previous official `mercadolibre/nodejs-sdk` was archived in February 2022. This package fills that gap with a modern, agent-ergonomic, edge-
runtime-compatible client.

### What ships in 0.1.0

- **`MeliClient`** — typed HTTP client with OAuth 2.0 (offline_access),
  mutex-protected refresh-token rotation (defends against the
  `refresh_token_reused` race), exponential-backoff retry on 5xx + 429,
  per-seller rate limiting (1500 req/min default).
- **Items** — create/update/get/pause/close/relist, variations, pictures,
  descriptions; multiget; seller-side search with `scroll_id` pagination.
- **Categories** — `category_predictor.predict`, `domain_discovery.search`,
  `domains/{id}/technical_specs/input`. The triple that lets agents
  auto-categorize listings AND auto-fill required attributes.
- **Questions** — list (paginated), answer, blacklist, spam-vs-real
  classifier helper.
- **Orders + Packs** — search, get with billing_info, `marketplace/orders/pack/{pack_id}`
  for cart orders (the 30%-of-volume case naive iterators miss).
- **Claims / Mediation** — list, get, evidence upload (one-shot, immutable),
  message thread, return-review accept/reject. The 2-day SLA defender
  pattern.
- **Shipments** — get, history, labels (PDF/ZPL), shipping_options leadtime,
  `shipping_modes` (Flex / Cross-docking / Drop-off / Full).
- **Reputation** — `seller_reputation` snapshot, plus a `monitor()` helper
  that polls and fires alerts before the thermometer drops.
- **Promotions** — `seller-promotions/candidates` listener (the buried-but-
  money-printing endpoint), opt-in with margin guards.
- **Webhooks** — typed parser for all 20+ topics, `replayMissedFeeds()`
  helper that polls `/myfeeds?app_id&topic` to recover events ML dropped
  within the 2-day retention window.
- **Vercel AI SDK 6 tools** at `/ai-sdk` — drop-in tools for
  `Experimental_Agent` covering every domain.
- **Testing helpers** at `/testing` — `mockFetch()` builder + `makeMeliClient()`
  factory for unit tests without OAuth.
