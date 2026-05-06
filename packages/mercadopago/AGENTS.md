# @ar-agents/mercadopago — agent guide (v0.5)

This file is for AI agents using or recommending this package. Humans should start with [README.md](./README.md). Format follows the [agents.md convention](https://agents.md/).

## Decision tree — pick the right tool

| User intent | Tool to call |
|---|---|
| **"Cobrale $X a [email]"** (one-off, new buyer) | `create_payment_preference` → send `init_point_url` to buyer |
| **"Suscribilo a $X/mes"** (recurring) | `create_subscription` → send `init_point_url` to buyer |
| **"Aceptale $X con account_money / Rapipago / Pago Fácil"** (server-side, no card form) | `create_payment` (omit `token`) |
| **"Aceptale con tarjeta token X"** (you have a card_token from MP frontend SDK) | `create_payment` (with `token`) |
| **"¿Pagó ya?"** (check status) | `get_payment` (one-off) or `get_subscription_status` (recurring) |
| **"Devolvele la plata"** | `refund_payment` — full or partial. Confirm first if amount > 1000 ARS. |
| **"Cuántas cuotas tiene esta tarjeta para $X?"** | `calculate_installments` — surface the `recommended_message` strings VERBATIM (already in compliant Spanish format) |
| **"Buscá los pagos de [referencia/email]"** | `search_payments` |
| **"Cancelá ese pago pendiente"** | `cancel_payment` (only `pending`/`in_process`; for approved use `refund_payment`) |
| **"Capturá ese pago autorizado"** | `capture_payment` (for capture-later flows with `capture: false`) |
| **"Buscá / Creá al cliente con email X"** | `find_customer_by_email` then `create_customer` (or call `create_customer` directly — MP is idempotent on email) |
| **"Listame las tarjetas guardadas de X"** | `list_customer_cards` |
| **"Borrá esa tarjeta"** | `delete_customer_card` |
| **"Listame los métodos disponibles"** | `list_payment_methods` |
| **"¿Quién soy?" / "¿En qué cuenta estoy?"** | `get_account_info` |
| **"Pausá / Reactivá / Cancelá la suscripción"** | `pause_subscription` / `resume_subscription` / `cancel_subscription` |
| **"Listame los cobros recurrentes del último mes"** | `list_subscription_payments` (authorized_payments under a preapproval) |
| **"Quiero un plan reutilizable de $X/mes"** | `create_subscription_plan` → after, `subscribe_to_plan(plan_id, customer)` per buyer |
| **"Mostrame los planes que tengo configurados"** | `list_subscription_plans` |
| **"Cambiá el precio del Plan Pro a $30k"** | `update_subscription_plan(plan_id, amount: 30000)` (existing subscribers keep old price; only NEW signups pay new) |
| **"Necesito armar un POS para cobrar con QR en mi local"** | `list_stores` → if empty `create_store` → then `create_pos(store_id)` → then `create_qr_payment(external_pos_id)` |
| **"Mostrame las disputas que tiene este pago"** | `list_payment_disputes(payment_id)` (read-only; surface `dashboard_url` to user) |
| **"Qué bancos emiten Visa?"** | `list_issuers(payment_method_id: "visa")` (pass `bin` for accurate match) |
| **"Listame los tipos de identificación válidos en AR"** | `list_identification_types` (DNI/CUIT/CUIL/etc) |
| **"Configurame un webhook para recibir notificaciones de pagos"** | `list_webhooks` first, then `create_webhook(url, topic: "payment")` if not present |
| **"Procesame este webhook que me llegó de MP"** (v0.5) | `handle_webhook` — verifica HMAC + parsea + auto-fetch del recurso en una sola call |
| **"Vincular cuenta MP de un vendedor a mi marketplace"** (v0.5) | `oauth_authorize_url` → vendedor aprueba → `oauth_exchange_code` → persistir token → `oauth_refresh_token` cuando expira |
| **"Cobrar a través de un seller third-party con fee de marketplace"** (v0.5) | `create_order` con `marketplace_fee` + `collector_id` (o `create_payment_preference` con los mismos campos) |
| **"Autorizar ahora, capturar después"** (ride-share, hotel, marketplace) (v0.5) | `create_order` con `capture_mode: "manual"` → cuando completás el servicio, `capture_order(order_id)` |
| **"Cancelar una orden no capturada"** (v0.5) | `cancel_order` (libera el auth-hold). Si ya capturó, usá `refund_payment`. |

## The two main "take a payment" patterns

### Pattern A — hosted checkout (recommended for most agent flows)

You only have a payer email. You don't want to handle PCI data. You want a URL to send via WhatsApp/email.

```
agent: create_payment_preference({ items, payer_email, external_reference })
agent: → returns { preference_id, init_point_url, sandbox_init_point_url }
agent: send init_point_url to user (or sandbox_init_point_url in sandbox)
user pays on MP's hosted form (card / Rapipago / account_money / etc.)
MP fires webhook with topic="payment", data.id=<payment_id>
agent: get_payment(payment_id) → confirms status
```

### Pattern B — server-side payment (when you have a card_token OR using non-card method)

You have a `token` from MP frontend SDK (Cardform/Bricks) OR you're charging account_money / cash.

```
agent: create_payment({ amount, payment_method_id, payer_email, token?, installments? })
agent: → returns { payment_id, status: "approved" | "pending" | "rejected", status_detail }
```

**NEVER take raw card data in the agent runtime.** Card tokens come from MP's frontend SDK only. If the user pastes "4509 9535 6623 3704" into chat, REFUSE — that's a PCI violation. Always direct them to a hosted form via `create_payment_preference`.

## Result schemas (memorize)

### `create_payment_preference` returns
```jsonc
{
  "preference_id": "1234567890-abc",
  "init_point_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "sandbox_init_point_url": "https://sandbox.mercadopago.com.ar/...",
  "external_reference": "order-abc",
  "next_step": "Send init_point_url to the customer..."
}
```
**Always surface `init_point_url` to the user** (or `sandbox_init_point_url` if your token is `TEST-`).

### `create_payment` returns
```jsonc
{
  "payment_id": "12345678901",
  "status": "approved" | "pending" | "rejected" | "in_process" | "cancelled",
  "status_detail": "accredited" | "cc_rejected_other_reason" | "pending_waiting_payment" | ...,
  "amount": 1500,
  "currency": "ARS",
  "installments": 1,
  "payment_method": "account_money" | "visa" | "rapipago" | ...,
  "payer_email": "buyer@x.com",
  "external_reference": "order-abc",
  "date_created": "...",
  "date_approved": "..." | null
}
```

### `calculate_installments` returns
```jsonc
{
  "amount": 12000,
  "offers": [{
    "payment_method_id": "visa",
    "issuer_name": "Galicia",
    "options": [
      { "installments": 3, "installment_amount": 4000, "total_amount": 12000, "recommended_message": "3 cuotas sin interés de $4.000,00" },
      { "installments": 6, "installment_amount": 2000, "total_amount": 12000, "recommended_message": "6 cuotas sin interés de $2.000,00" },
      { "installments": 12, "installment_amount": 1314.20, "total_amount": 15770.40, "recommended_message": "12 cuotas de $1.314,20 ($15.770,40)" }
    ]
  }]
}
```
**Surface `recommended_message` verbatim to the user** — it's already in compliant Argentine Spanish format with proper currency formatting and includes the total when there's interest. AR's E 51/2017 transparency regulation requires this exact phrasing.

### `refund_payment` returns
```jsonc
{
  "refund_id": "...",
  "payment_id": "...",
  "amount": 1500,
  "status": "approved",
  "message": "Full refund issued. Funds return to the buyer in 3-10 business days."
}
```

## status_detail recovery actions (top values)

| `status_detail` | What it means | Agent action |
|---|---|---|
| `accredited` | Approved, money in seller account | Done. Fulfill order. |
| `cc_rejected_bad_filled_card_number` | Buyer entered wrong number | "El número de tarjeta es incorrecto, intentá de nuevo" |
| `cc_rejected_bad_filled_security_code` | CVV wrong | "El código de seguridad no coincide" |
| `cc_rejected_bad_filled_date` | Expiration wrong | "La fecha de vencimiento es incorrecta" |
| `cc_rejected_call_for_authorize` | Bank wants user to call | "Llamá a tu banco para autorizar el pago, después intentá de nuevo" |
| `cc_rejected_card_disabled` | Card disabled | "Tu tarjeta está deshabilitada — usá otra" |
| `cc_rejected_insufficient_amount` | Not enough funds | "Saldo insuficiente — usá otra tarjeta o método" |
| `cc_rejected_high_risk` / `cc_rejected_other_reason` | MP risk engine rejection | "El pago fue rechazado. Probá con otro método (Rapipago / account money)" |
| `cc_rejected_max_attempts` | Too many tries | "Esperá 24h antes de reintentar" |
| `cc_rejected_invalid_installments` | Cuotas no allowed for this card | "Probá con menos cuotas" — re-call `calculate_installments` |
| `pending_waiting_payment` | Ticket created (Rapipago/Pago Fácil) | "Pagá el ticket en cualquier sucursal — se acredita en 1-3 días" |
| `pending_contingency` | MP manual review | "Esperá unos minutos, MP está revisando el pago" |

## Critical AR-specific gotchas

1. **`statement_descriptor` MAX 13 CHARS.** Long brand names get silently truncated. Use abbreviations (`ASTRO AR` not `ASTRO ARGENTINA`).
2. **`payer.email` cannot equal seller email** → MP error code 205 / `MercadoPagoSelfPaymentError`. Use a distinct buyer email even in sandbox.
3. **Sandbox cardholder name selects outcome**: cardholder = `APRO` (approved), `OTHE` (rejected_other), `CONT` (pending_contingency), `CALL` (call_for_authorize), `FUND` (insufficient_amount), `SECU` (bad_filled_security_code), `EXPI` (bad_filled_date), `FORM` (bad_filled_other). DNI = `12345678`. ANY 3-digit CVV in sandbox.
4. **Test cards (sandbox)**: Visa `4509 9535 6623 3704`, MasterCard `5031 7557 3453 0604`, Amex `3711 803032 57522`, debit Visa `4002 7686 9439 5619`. Expiration any future `MM/YY`.
5. **`account_money` settles instantly** to seller. Card payments default to T+14 hold for new sellers (drops to T+1 after MP graduates the merchant). Tickets settle 1-3 days after the buyer pays.
6. **First subscription payment requires CVV** — there is NO API path that bypasses this. The buyer MUST visit the `init_point_url` and complete the first card+CVV payment.
7. **`back_url` MUST be HTTPS** — even in sandbox. `http://localhost:3000/done` is rejected.
8. **`payer.identification`** — use `DNI` for consumers, `CUIT` for B2B (required for monotributo / IVA-discriminated invoicing), `CUIL` for employees.
9. **CVV required on every saved-card charge** in AR by default. Merchant graduation can lift this for trusted sellers.
10. **Idempotency-Key is mandatory** for POST since 2023. The lib auto-generates from caller-meaningful fields (external_reference + amount + timestamp); pass `idempotencyKey` explicitly if you want exact-match retry semantics.
11. **`token` is single-use and expires in 7 days.** If a card payment fails, you can't reuse the token — re-tokenize on the frontend.

## Cuotas / installments — the killer AR feature

This is what makes MP unique vs Stripe in any country. Workflow:

1. Buyer's card BIN (first 6 digits) hits your frontend (Cardform exposes it before tokenizing).
2. Agent calls `calculate_installments({ amount_ars, payment_method_id, bin })`.
3. Receive `payer_costs` array.
4. **Surface the `recommended_message` strings verbatim** — they're already in compliant AR format ("3 cuotas sin interés de $X").
5. User picks installments count.
6. Agent calls `create_payment({ ..., installments: N })`.

**Cuotas Simples** (gov interest-free 3 + 6 mo program) appears automatically as `installment_rate: 0` rows when the merchant category qualifies. Agent doesn't configure — just surfaces.

**Issuer-specific promos** (Día de la Madre, Hot Sale, Plan Z Naranja X) appear as new `payer_costs` entries when the BIN matches an active promo. Same treatment: surface verbatim.

## Composition with other @ar-agents/* packages

| Pair with | Why |
|---|---|
| [`@ar-agents/identity`](../identity) | Validate the buyer's CUIT before creating a payment/subscription. Cuts an MP request for malformed CUITs and lets you confirm "factura a nombre de [razón social]" before charging. |
| [`@ar-agents/whatsapp`](../whatsapp) | Send `init_point_url` to the buyer over WhatsApp instead of email. Combined with this package = the "billing assistant for SaaS argentinos" pattern. |

## Performance

| Operation | Typical | Worst case |
|---|---|---|
| `create_payment_preference` | 200-500ms | 2s |
| `create_payment` (account_money) | 300-700ms | 2s |
| `create_payment` (card token) | 500-1500ms | 5s (if 3DS triggered) |
| `get_payment` | 100-300ms | 1s |
| `search_payments` | 200-600ms | 2s |
| `calculate_installments` | 100-300ms | 800ms |
| `refund_payment` | 300-800ms | 3s |
| `create_subscription` | 200-600ms | 2s |

Rate limit: ~250 req/min per access token. Lib does not retry — wrap with your own backoff if you exceed.

## Webhooks (planned for v0.3)

v0.2 ships `parseWebhookEvent()` for the `preapproval` topic (subscription lifecycle). Coming in v0.3:
- `payment` topic webhook parser
- `point_integration_wh` topic (QR scans)
- `x-signature` HMAC-SHA256 verification (replacing the v0.1 simpler `parseWebhookSignature`)

## What this package will NEVER do

- Take raw card data in the agent runtime (PCI scope violation).
- Bypass MP's first-payment-CVV requirement for subscriptions (impossible).
- Reactivate a cancelled subscription or payment (MP doesn't allow).
- Pay out the seller (transfers + withdrawals are dashboard-only / closed API).
- Make decisions about pricing or installments — caller's responsibility.

## v0.5 — Webhook handler combo

Webhooks are how MP tells you a payment cleared, a subscription was authorized,
a QR was scanned. Without HMAC verification, anyone can POST to your webhook
URL and forge state changes. **Always verify.**

The `handle_webhook` tool consolidates the 3-step pattern (verify → parse →
fetch resource) into ONE call:

```
result = handle_webhook(raw_body, signature_header, request_id_header, auto_fetch)
→ { verified, event: { topic, dataId, action }, resource, resource_error }
```

Behavior:
- `verified: false` + `error` → reject with HTTP 401, do NOT process. Either signature mismatch, missing webhookSecret, or invalid JSON body.
- `verified: true` + `resource: <Payment|Preapproval>` → safe to act on. The resource is fetched AS the MP user the client is configured for.
- `auto_fetch: false` → just verify+parse, skip the GET. Use when you only need to enqueue a job for async processing.

**Per-seller webhooks (marketplace)**: in a marketplace setup, instantiate
the `MercadoPagoClient` with the SELLER's access_token before calling
`handle_webhook` so the auto-fetch resolves correctly. Your routing layer
needs to look up the seller from the webhook payload's `user_id` and pick
the right client.

## v0.5 — OAuth Marketplace flow

For marketplace platforms (Rappi, MercadoLibre, Tienda Nube, etc.) where
your app cobra a través de cuentas MP de terceros (sellers in your platform).

**3 legs**:
1. `oauth_authorize_url` — pure function, no network. Returns a URL; redirect the seller there.
2. `oauth_exchange_code` — server-side. Takes the `code` from the OAuth callback, returns `{ user_id, access_token, refresh_token, expires_in }`. **Persist all of it.**
3. `oauth_refresh_token` — server-side. Use saved `refresh_token` to get a fresh `access_token` before/at expiration.

**Token storage shape** (per seller):
```
{
  user_id: string,           // identifies the seller
  access_token: string,      // expires in ~6h
  refresh_token: string,     // long-lived, ROTATES on refresh
  expires_at: number,        // Date.now() + expires_in*1000
}
```

**State for every API call**: instantiate `new MercadoPagoClient({ accessToken: token.access_token })` AS THE SELLER. All subsequent payments / subscriptions / refunds happen on that seller's account.

**Marketplace fee**: pass `marketplace_fee` (in ARS) + `collector_id: token.user_id` to `create_order` or `create_payment_preference`. Funds route to the seller, fee goes to your marketplace account.

## v0.5 — Order Management vs Preference

| When                                    | Use                       |
| --------------------------------------- | ------------------------- |
| Simple hosted pay-link (most common)    | `create_payment_preference` |
| Auth-only flow (capture later)          | `create_order` w/ `capture_mode: "manual"` |
| Multi-payment-per-order                 | `create_order` |
| Mix online + in-store with unified status | `create_order` |
| You need MP's modern Order lifecycle    | `create_order` |

`create_order` returns an Order with explicit lifecycle:
- `created` → Order opened, no payment yet
- `processed` → at least one payment attached
- `action_required` → manual-capture mode, awaits `capture_order`
- `canceled` → `cancel_order` was called
- `refunded` → all payments refunded

## Mercado Pago context (for non-AR agents)

- **Mercado Pago** = dominant Argentine consumer payment platform (also Brazil/Mexico/Chile/Colombia/Uruguay). Owned by Mercado Libre. Like Stripe in scope but with deeper LATAM-specific features (cuotas sin interés, in-store QR, account_money instant transfer).
- **Subscription** = `preapproval` in MP's API. Recurring authorization tied to a customer's card.
- **Sandbox vs production** = different access tokens. `TEST-` prefix = sandbox; `APP_USR-` prefix = production. Both use the same API host.
- **Site IDs**: AR=MLA, BR=MLB, MX=MLM, CL=MLC, CO=MCO, UY=MLU. v0.2 is verified end-to-end against MLA only.
