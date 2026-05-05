# @ar-agents/mcp — agent guide

This file is for the LLM running INSIDE Claude Desktop, Cursor, or any MCP host that loaded `@ar-agents/mcp`. It explains what's available and how to chain tools.

## What you have access to

`@ar-agents/mcp` registers a subset of up to ~34 tools, depending on which env vars the human configured. Always check `list_payment_methods` (if MercadoPago is enabled) or just call any tool — if it's not registered, the host will tell you.

The tools are organized into 4 groups; each ships its own AGENTS.md you can mentally fold in:

1. **`@ar-agents/identity`** — CUIT validation + AFIP/ARCA padron lookup
2. **`@ar-agents/identity-attest`** — Verification orchestration (WhatsApp OTP, email magic-link), trust-level gating
3. **`@ar-agents/mercadopago`** — Payments, Subscriptions, Cuotas, Customers, Refunds
4. **`@ar-agents/whatsapp`** — WhatsApp Cloud API messaging

## The canonical agent flow (Argentine SaaS billing)

```
User: "quiero cobrarle $50.000 a juan@example.com"

Step 1 → calculate_installments(amount: 50000, payment_method_id: "visa")
   → returns recommended_message strings
Step 2 → create_payment_preference(items, payer_email, max_installments, ...)
   → returns init_point_url
Step 3 → send_whatsapp_text(to: juan_phone, text: "Te paso el link de pago: ...")
Step 4 → (waits for webhook) get_payment(payment_id) when it fires
Step 5 → if amount > $20k AND no recent attestation:
            request_identity_verification(method: "whatsapp_otp", subject_type: "phone", subject_value: juan_phone)
            → user dictates code → submit_otp_code(request_id, code)
            → now you have an attestation at trust 0.3
Step 6 → continue with the charge, log the attestation_id alongside the payment
```

## Tool selection cheat sheet

| User intent | Most likely tool |
|---|---|
| "cobrale $X a [email]" | `create_payment_preference` |
| "validame este CUIT" | `validate_cuit` (then `lookup_cuit_afip`) |
| "cuántas cuotas tiene esta tarjeta?" | `calculate_installments` |
| "necesito verificar al cliente antes de cobrar" | `request_identity_verification` |
| "mandale un mensaje a [phone]" | `send_whatsapp_text` |
| "devolvele la plata" | `refund_payment` |
| "creale una suscripción mensual a $X" | `create_subscription` |
| "buscá los pagos del cliente X" | `search_payments(payer_email)` or `(external_reference)` |

## Cross-package patterns

### Identity gating for payments

```
For amount < $5k → no verification needed (just create_payment_preference)
For amount $5k-$50k → require trust >= 0.5 (email_magic_link)
For amount > $50k → require trust >= 0.85 (KYC; only available with MercadoPago Identity adapter — planned v0.3)
```

The agent checks `check_verification_status` for an existing valid attestation BEFORE kicking off a new one.

### CUIT-validated B2B onboarding

```
Step 1 → validate_cuit → if invalid, explain to user
Step 2 → lookup_cuit_afip → confirm "factura a nombre de [razón social]"
Step 3 → user confirms → create_subscription with proper external_reference
Step 4 → send_whatsapp_text with the init_point_url for first payment
```

### WhatsApp inbound webhook → agent dispatch

If the host integrates WhatsApp webhooks (your app's HTTP layer, not the MCP server itself), the inbound message text becomes a regular user prompt. Then standard tool selection applies.

## Argentine context (key landmines)

- **Mercado Pago payer_email cannot equal seller email** (error 205). Use distinct emails even in sandbox.
- **WhatsApp 24h customer service window**: free-form text only works within 24h of user's last message. Outside → use `send_whatsapp_template`.
- **AFIP `condicion: "DESCONOCIDA"`** — use `ws_sr_constancia_inscripcion` (default in identity v0.4+) for monotributo + IVA condition. A13 is "datos generales only".
- **Cuotas `recommended_message`** — surface VERBATIM, already in compliant Argentine format ("3 cuotas sin interés de $X").
- **Statement descriptor max 13 chars** — use abbreviations.
- **AR phone normalizer** in `@ar-agents/whatsapp` handles all formats automatically.

## When things fail

The MCP server returns `{ isError: true, content: [{ text: "Error calling X: ..." }] }` on any tool failure. Surface the error message to the user (it's already actionable: "El número no tiene WhatsApp", "El CUIT es inexistente", "Te quedan 2 intentos del código", etc.). Don't invent fallbacks — the lib's errors-as-docs philosophy means each error is a clear next-step instruction.

## Composition philosophy

`@ar-agents/mcp` is the meta-package — its purpose is to expose all the lower packages over MCP transport. Read each lower package's AGENTS.md for fuller decision trees:
- [@ar-agents/identity AGENTS.md](https://github.com/ar-agents/ar-agents/blob/main/packages/identity/AGENTS.md)
- [@ar-agents/identity-attest AGENTS.md](https://github.com/ar-agents/ar-agents/blob/main/packages/identity-attest/AGENTS.md)
- [@ar-agents/mercadopago AGENTS.md](https://github.com/ar-agents/ar-agents/blob/main/packages/mercadopago/AGENTS.md)
- [@ar-agents/whatsapp AGENTS.md](https://github.com/ar-agents/ar-agents/blob/main/packages/whatsapp/AGENTS.md)
