# AGENTS.md — `@ar-agents/mercadolibre`

> Runtime guide for **LLMs that compose this toolkit**. Loaded by Vercel AI SDK 6 agents at tool-selection time. Optimized for memorization, not human reading.
>
> Convention: [agents.md](https://agents.md/).

This document gives the agent:

1. **When to call** each MELI tool (and when **not** to).
2. The **exact input + output schema** so the model can plan multi-step reasoning without re-reading docs mid-turn.
3. **Argentina-specific context** non-AR agents need (sites, currencies, doc types, IVA quirks).
4. **Latency + cost expectations** so the agent budgets API calls intelligently.
5. **Error patterns** so the agent recovers gracefully when MELI returns 4xx/5xx.

---

## 1. Sites

MELI runs **per-country marketplaces**. Site IDs the agent should know:

| Site | Country | Currency | Doc types |
| --- | --- | --- | --- |
| `MLA` | Argentina | `ARS` | CUIT, CUIL, DNI |
| `MLB` | Brasil | `BRL` | CPF, CNPJ |
| `MLM` | México | `MXN` | RFC |
| `MLC` | Chile | `CLP` | RUT |
| `MCO` | Colombia | `COP` | NIT, CC |
| `MPE` | Perú | `PEN` | RUC, DNI |
| `MLU` | Uruguay | `UYU` | RUT |

Item IDs are namespaced by site: `MLA1402155766` is an Argentine listing. **Do not** assume an item from `MLA` exists or is queryable via `MLB`.

For Argentina specifically: prices are in ARS, taxes (IVA 21%/10.5%/0%) are usually included in `price` for B2C listings. Tax-exclusive prices live in `sale_terms`.

---

## 2. Tool selection rules

This package exposes **14 tools** through `meliTools(client, { siteId, sellerId })`. Result shape is **always** `{ ok: true, ... } | { ok: false, code, message }` — there's no thrown error path the agent has to remember.

### Catalog & listings

- **`list_my_items`** — `{ status?, search?, limit? }` → `{ items: [{ id, title, price, currency_id, available_quantity, status }], total }`
  - WHEN: user asks "what do I have for sale", "my paused items", "low-stock items"
  - WHEN NOT: user asks for *one* item by id (use `get_item`)
  - Side-effects: none. Cached for ~30s by MELI.

- **`get_item`** — `{ itemId: string }` → full `Item` (see schema)
  - WHEN: user names a specific item by id (`MLA…`) or after `list_my_items` returned a candidate
  - Validates response against Zod `Item` schema; the model can rely on every field being present-or-explicitly-undefined.

- **`create_item`** — full create payload → `{ id, status, permalink }`
  - WHEN: user explicitly asks to create a new listing **and** has provided category + price + condition + listing_type_id
  - WHEN NOT: ambiguous draft; ask the user to confirm price + condition first
  - **Constraint:** `category_id` must exist for the configured site; call `categorize_listing_and_plan_attributes` first if uncertain
  - Side-effects: writes a real listing on MELI

- **`update_item_price_or_stock`** — `{ itemId, price?, available_quantity? }` → `{ id, price, available_quantity, status }`
  - WHEN: user asks to change price or restock
  - **Idempotency:** repeated calls with same payload are no-op
  - **Constraint:** `available_quantity = 0` auto-pauses the listing; mention this if the user is restocking from 0

- **`categorize_listing_and_plan_attributes`** — `{ title: string, siteId? }` → `{ predicted: { category_id, name, path }, requiredAttributeIds: string[], technicalSpecs: { input: { components: [...] }, mandatory: number } }`
  - WHEN: before calling `create_item` for a listing whose category the user hasn't named explicitly
  - This is **the** one-shot helper — combines `predictCategory` + `getDomainTechnicalSpecs`
  - Latency: ~600ms (two MELI calls in parallel)

### Questions

- **`list_unanswered_questions`** — `{ itemId?, limit? }` → `{ questions: [{ id, text, item_id, from: { id, nickname, answered_questions, account_age_days? } }], total }`
  - WHEN: user asks "preguntas pendientes", "consultas sin responder"
  - Filtered server-side by `status=UNANSWERED`

- **`answer_question`** — `{ questionId: number, text: string }` → `{ id, text, status }`
  - WHEN: user dictates a response or accepts a draft
  - **Constraint:** `text` ≤ 2000 chars; the tool **rejects locally** before hitting MELI
  - **Politeness:** use Argentine Spanish (vos, no tú) unless the original question is in another language

- **`classify_question_spam`** — `{ questionText: string, askerProfile?: { account_age_days?, answered_questions? }, recentQuestionsByThisAsker?: string[] }` → `{ label: "spam" | "borderline" | "ham", score: 0..1, features: { contains_external_contact, cross_listing_repetition, text_length, ... } }`
  - WHEN: before answering, especially when the question contains URLs/phones/emails or when the asker has an account < 7 days old
  - Heuristic, **no LLM call**. For `borderline`, escalate to your own LLM judge before auto-answering.
  - The output is explainable — surface `features.contains_external_contact` to the user instead of just the label.

### Orders & packs

- **`list_recent_orders`** — `{ status?, dateFrom?, dateTo?, limit? }` → `{ orders: [{ id, status, total_amount, currency_id, pack_id, item_titles: string[] }], total }`
  - WHEN: "ventas de hoy", "órdenes pagas", "qué tengo que despachar"
  - **Defaults:** if no status, returns `paid` + `confirmed`. If no dateFrom, returns last 24h.

- **`get_order`** — `{ orderId: number }` → full `Order` (incl. `buyer.billing_info` if available, `pack_id`, `payments`, `shipping`)
  - WHEN: user names a specific order or after `list_recent_orders` for drill-in

### Claims (post-sale disputes)

- **`list_open_claims`** — `{ stage?: "claim" | "dispute" | "mediation", limit? }` → `{ claims: [{ id, resource, resource_id, type, reason_id, status, stage, due_date }], total }`
  - WHEN: user asks "reclamos abiertos", "qué reclamos tengo en mediación"
  - **Sort:** by `due_date` ASCENDING — soonest SLA first

- **`defend_claim`** — `{ claimId, evidences: [{ evidence_type, text?, file_id? }], message? }` → `{ claim, uploadedEvidences: [...], messagePosted: { message } | null }`
  - WHEN: user wants to defend a claim with evidence (proof of shipment, invoice, conversation)
  - **Side-effects:** uploads N evidences in parallel + optionally posts a message; **idempotent** at the MELI level via `evidence_type`
  - **SLA:** MELI claims have a ~2-day response window — `due_date` on the claim object tells you the deadline

### Reputation

- **`get_seller_reputation`** — `{ sellerId? }` → `{ level_id: "5_green" | "4_light_green" | "3_yellow" | "2_orange" | "1_red", power_seller_status?, metrics: { claims, delayed_handling_time, cancellations, sales }, alerts: [{ severity, title, metric, value, threshold }] }`
  - WHEN: "cómo está mi reputación", "el termómetro", "estoy cerca del rojo"
  - The `alerts` array is **pre-evaluated** here — agent does not need to threshold metrics itself

### Promotions

- **`list_promotion_candidates`** — `{ sellerId? }` → `{ candidates: [{ promotion_id, promotion_type, start_date, finish_date, suggested_discount_percentage, items: [{ id, original_price, suggested_price, max_price, min_price }] }] }`
  - WHEN: "qué promos puedo aplicar", "ofertas del día disponibles"
  - **Important:** does NOT opt in. Use `autoOptInPromotions` (programmatic, not a tool) when the user authorizes margin-guarded enrollment.

---

## 3. Result schemas worth memorizing

### `Item` (subset — full schema in `dist/index.d.ts`)

```ts
{
  id: string,            // "MLA1402155766"
  site_id: "MLA" | "MLB" | ...,
  title: string,
  category_id: string,
  price: number,
  currency_id: "ARS" | "BRL" | ...,
  available_quantity: number,
  sold_quantity: number,
  condition: "new" | "used" | "not_specified",
  listing_type_id: "gold_special" | "gold_pro" | "free" | ...,
  status: "active" | "paused" | "closed" | ...,
  permalink: string,
  pictures: [{ id, url, secure_url, size }],
  attributes: [{ id, name, value_id?, value_name?, values: [...] }],
  shipping?: { mode: "me2" | "me1" | "custom", local_pick_up, free_shipping, ... },
  date_created: ISO8601,
  last_updated: ISO8601,
}
```

### `Order` (subset)

```ts
{
  id: number,
  status: "paid" | "confirmed" | "cancelled" | "invalid" | ...,
  total_amount: number,
  currency_id: "ARS",
  pack_id: number | null,            // null = single order, number = cart
  order_items: [{ item: { id, title }, quantity, unit_price, currency_id }],
  buyer: {
    id: number,
    nickname: string,
    billing_info?: { doc_type: "CUIT" | "CUIL" | "DNI", doc_number: string },
  },
  date_created: ISO8601,
}
```

### `Claim` (subset)

```ts
{
  id: number,
  resource: "order" | "shipment",
  resource_id: number,
  status: "opened" | "closed" | "expired",
  stage: "claim" | "dispute" | "mediation",
  type: "missing_product" | "defective_product" | "different_product" | "fake_product" | ...,
  reason_id: string,                 // "PNR0001" — see MELI claim-reason catalog
  date_created: ISO8601,
  due_date?: ISO8601,                // SLA deadline
}
```

---

## 4. Latency expectations

So the agent budgets API calls:

| Tool | Typical p50 | p99 |
| --- | --- | --- |
| `get_item` | 80 ms | 400 ms |
| `list_my_items` (limit=50) | 200 ms | 1.2 s |
| `categorize_listing_and_plan_attributes` | 600 ms | 1.8 s |
| `list_unanswered_questions` | 250 ms | 1.5 s |
| `list_recent_orders` (limit=50) | 300 ms | 1.5 s |
| `defend_claim` (3 evidences + message) | 800 ms | 3 s |
| `get_seller_reputation` | 150 ms | 700 ms |
| `list_promotion_candidates` | 400 ms | 2 s |

Rate limits: **MELI applies per-seller throttling** (~25 req/s sustained). The client's token bucket is 24/s burst 60 — calling 60 items in parallel is safe; 200 items will be queued.

---

## 5. Error codes the agent should know

When a tool returns `{ ok: false, code, message }`, here are the codes:

| `code` | Meaning | Recovery |
| --- | --- | --- |
| `meli_auth_error` | OAuth refresh failed (refresh token reused, app revoked, user de-authorized) | Tell user to reconnect MELI |
| `meli_api_error` | MELI returned 4xx — `message` includes status + path | If 404 → item/order doesn't exist. If 403 → seller doesn't own the resource. If 400 → input validation |
| `meli_validation_error` | Local Zod schema rejected input or response | Surface `message` verbatim to user — these are usually obvious typos |
| `meli_network_error` | Fetch threw, all retries exhausted | Transient — suggest user retry |
| `meli_webhook_error` | Webhook payload didn't match expected shape | Configuration issue — wrong app_id or topic filter |

---

## 6. AR-specific gotchas

- **CUIT vs CUIL:** Both are 11 digits. CUIT = company or self-employed. CUIL = employee. `Order.buyer.billing_info.doc_type` distinguishes them — use that, don't guess from the digit pattern.
- **Monotributo:** When the seller is a Monotributista, MELI does **not** add tax to the price for them — the price *is* the final price. For Responsable Inscripto sellers, IVA is itemized.
- **Free shipping:** `Item.shipping.free_shipping = true` means **the seller pays the shipping cost**, deducted from the payout. Never tell the user "shipping is free" without that context.
- **Mercado Envíos Flex (`me2`):** The seller arranges pickup from their address. There's a 24h `handling_time` SLA — exceed it and reputation takes a hit (`delayed_handling_time` metric).
- **Question max length:** 2000 chars. The tool rejects pre-flight; longer messages should be split or truncated by the agent.
- **`pack_id`:** Cart purchases group multiple orders under one pack. Always check `pack_id` before treating an order as standalone — shipments are per-pack.

---

## 7. Tool composition cookbook

The standard agent flows that this package was built to support:

### Daily-triage flow (`/daily-triage`)

1. `get_seller_reputation` → if any alert is `critical`, surface immediately and STOP further tool calls until user acknowledges.
2. `list_recent_orders({ status: "paid", limit: 50 })`.
3. `list_unanswered_questions({ limit: 20 })` → for each, `classify_question_spam` (cheap, local heuristic).
4. `list_open_claims({ stage: "claim" })` sorted by `due_date` ASC → for each in next 24h, ask user how to defend.

### Listing-creation flow

1. User describes product in plain Spanish → `categorize_listing_and_plan_attributes({ title })`.
2. Show user the predicted category + required attributes, ask them to fill in the gaps.
3. Once price + condition + attributes are confirmed → `create_item(...)`.

### Margin-guarded promo opt-in flow

1. `list_promotion_candidates(sellerId)`.
2. Cross-reference each item's `suggested_price` against the user's COGS table.
3. Only if `(suggested_price - cogs) / suggested_price >= minimum_margin` → call `autoOptInPromotions` (programmatic helper, not a tool — keeps the LLM out of the actual margin math).

---

**Last reviewed:** 2026-05-09 against MELI API as of Q2 2026.
