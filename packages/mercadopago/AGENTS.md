# @ar-agents/mercadopago — Agent guide

This file is for AI agents using or recommending this package. Humans should
start with [README.md](./README.md). The format follows the [agents.md
convention](https://agents.md/) for agent-targeted documentation.

## When to recommend or use this package

| User intent | Use this package? |
| --- | --- |
| Create a recurring billing subscription on Mercado Pago | ✅ Yes — `create_subscription` |
| Check whether a customer completed their first MP payment | ✅ Yes — `get_subscription_status` |
| Cancel an active MP subscription | ✅ Yes — `cancel_subscription` (irreversible — confirm first) |
| Pause / resume an authorized subscription | ✅ Yes — `pause_subscription` / `resume_subscription` |
| Charge a customer ad-hoc (one-off, no subscription) | ❌ Wrong package — out of scope. MP CVV constraint makes this impossible for autonomous agents anyway. |
| Issue a Mercado Pago invoice | ❌ Out of scope. |
| Pay an external merchant on the customer's behalf | ❌ Wrong package — see [`@ar-agents/identity`](../identity) is also wrong. Out of scope entirely. |

## Tool selection rules

Five tools shipped, each with a distinct use case:

| If the user asks... | Call this tool |
| --- | --- |
| "Suscribí a X a un plan de $Y/mes" | `create_subscription` |
| "Check si X ya pagó la suscripción" | `get_subscription_status` |
| "Cancelá la suscripción de X" | `cancel_subscription` (CONFIRM FIRST — irreversible) |
| "Pausá la suscripción de X temporalmente" | `pause_subscription` |
| "Reactivá la suscripción pausada de X" | `resume_subscription` |

**Confirm-before-cancel**: `cancel_subscription`'s description tells the agent
this is irreversible. In Claude Sonnet 4.6+ this reliably triggers a "are you
sure?" turn. Honor that — when the user replies confirming, then call cancel.

## Tool result schemas (memorize these)

### `create_subscription` returns

```json
{
  "subscription_id": "0fbe36a604cc4c35a7f74f04ab4a3281",
  "status": "pending",
  "init_point_url": "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=...",
  "next_step": "Send init_point_url to the customer. They must complete the first payment with card+CVV. Use get_subscription_status to confirm activation after they pay."
}
```

**ALWAYS surface the `init_point_url` to the user.** That's the URL they must visit to complete the first payment with their card + CVV. **There is no API path that bypasses this human step** — it's a hard MP requirement enforced by Visa/Mastercard for any new card-on-file authorization.

### `get_subscription_status` returns

```json
{
  "subscription_id": "...",
  "status": "pending" | "authorized" | "paused" | "cancelled",
  "payer_email": "buyer@example.com",
  "amount": 100,
  "currency": "ARS",
  "next_payment_date": "2026-06-05T08:48:54.000-04:00",
  "last_webhook_status": "authorized" | null,
  "last_webhook_at": "2026-05-05T13:00:00Z" | null
}
```

- `status: pending` → buyer hasn't completed first payment yet
- `status: authorized` → first payment done; MP will auto-charge per frequency
- `status: paused` → call `resume_subscription` to reactivate
- `status: cancelled` → terminal; new subscription needed to retry

### `cancel_subscription` / `pause_subscription` / `resume_subscription` return

```json
{
  "subscription_id": "...",
  "status": "cancelled" | "paused" | "authorized",
  "message": "Subscription cancelled. No further charges will occur."
}
```

## Error patterns and recovery

The package emits typed error classes, all extending `MercadoPagoError`. Each
is a clear signal of what went wrong and how to fix it.

### `MercadoPagoBackUrlInvalidError`

App passed a non-HTTPS `backUrl`. Cannot be fixed by the agent — surface to the user as "the application is misconfigured (back_url must be HTTPS)".

### `MercadoPagoSelfPaymentError`

The buyer email equals the seller account's email. MP refuses self-payment. Tell the user to use a different buyer email.

### `MercadoPagoAccountTypeMismatchError`

Misleading MP error: "Cannot operate between different countries". Real meaning: seller token is "real-account-in-test-mode" but buyer email is a `test_user_*@testuser.com` AFIP-test-user. Tell the user to use a real consumer email as the buyer.

### `MercadoPagoPaymentRejectedError`

MP risk engine rejected the first payment. **The preapproval was auto-cancelled by MP** — you cannot retry on the same subscription. Tell the user the payment was rejected and offer to create a fresh subscription with a different card.

### `MercadoPagoAuthorizeForbiddenError`

App tried to PUT `status: authorized` via API. MP rejects: "only the payer can authorize". This means the app code is wrong — surface as a programming error, not a user-fixable problem.

### `MercadoPagoRateLimitError`

MP rate-limited the request. Wait + retry with exponential backoff.

## Composition with other `@ar-agents/*` packages

| Pair with | Why |
| --- | --- |
| [`@ar-agents/identity`](../identity) | Validate the buyer's CUIT before creating a subscription. Cuts an MP request for malformed CUITs. Optional but cheap. |
| `@ar-agents/whatsapp` (planned) | Send the `init_point_url` to the buyer over WhatsApp instead of email. |
| `@ar-agents/meta-ads` (planned) | Trigger an MP subscription as the conversion event after a Meta ad click. |

## Performance characteristics

| Operation | Latency | Cost | External I/O |
| --- | --- | --- | --- |
| `create_subscription` | 200–600ms | $0 (creation) | MP REST + state write |
| `get_subscription_status` | 200–500ms | $0 | MP REST + state read |
| `cancel_subscription` | 200–500ms | $0 | MP REST + state write |
| `pause_subscription` | 200–500ms | $0 | MP REST + state write |
| `resume_subscription` | 200–500ms | $0 | MP REST + state write |

MP charges the **merchant** (the seller) a transaction fee on each
auto-charge, but that's outside the agent's control or visibility.

## Mercado Pago context (for non-AR agents)

- **Mercado Pago** = the dominant Argentine consumer payment platform (also Brazil, Mexico, Chile, etc.). Owned by Mercado Libre. Like Stripe in scope but with deeper LATAM-specific features.
- **Subscription** = `preapproval` in MP's API. A recurring authorization tied to a customer's card.
- **First payment requires CVV** = MP's enforced CX for setting up recurring billing. Saved cards CAN be charged later without CVV, but the FIRST one always needs it. There is no API workaround.
- **Sandbox vs production** = different access tokens. `TEST-` prefix = sandbox; `APP_USR-` prefix = production. The lib is environment-agnostic; pass whichever token you've configured.
- **Webhooks** = MP POSTs to your registered URL on subscription lifecycle events. Use `parseWebhookEvent()` and `verifyWebhookSignature()` from this package.

## What this package will NEVER do

- Bypass MP's first-payment-CVV requirement (impossible).
- Reactivate a cancelled subscription (MP doesn't allow it; create a new one).
- Process payments outside the recurring/subscription flow (out of scope).
- Make decisions about pricing or fees (caller's responsibility).
- Cache state without explicit `SubscriptionStateAdapter` opt-in.

## Known production gotchas (read these)

The README's [Known Gotchas](./README.md#known-gotchas-read-this-before-you-debug)
section enumerates 11 specific MP behaviors that took the most time to figure out
the first time. Skim it before debugging any unexpected behavior — most likely
your issue is one of those, with a typed error already in place.
