# whatsapp-hello

Reference app for the [ar-agents stack](../../README.md): a billing assistant
for Argentine SaaS that combines four `@ar-agents/*` packages in one agent
loop. Receives WhatsApp messages, validates CUIT, manages Mercado Pago
subscriptions, and replies via WhatsApp.

Live: https://ar-agents-whatsapp-hello.vercel.app

## What it ships

| Surface | What it does |
| --- | --- |
| `POST /api/agent` | Conversational agent (Vercel AI SDK 6) wired with tools from `@ar-agents/identity`, `@ar-agents/identity-attest`, `@ar-agents/mercadopago`, and `@ar-agents/whatsapp`. |
| `GET/POST /api/whatsapp/webhook` | Meta webhook handler: hub challenge verification (`WA_WEBHOOK_VERIFY_TOKEN`) plus HMAC-SHA256 signature check (`META_APP_SECRET`) on incoming messages. |
| `/` | WhatsApp-style chat UI to drive the agent without a real Meta number. |

Without `WA_ACCESS_TOKEN` + `WA_PHONE_NUMBER_ID` the WhatsApp tools run in
MOCK MODE ([`src/lib/mock-whatsapp-client.ts`](./src/lib/mock-whatsapp-client.ts)):
every `send_*` call is recorded and shown in the demo UI, no real message goes
out. The full flow is demoable before Meta Business Verification clears.

## Setup

```bash
cd /path/to/ar-agents
pnpm install
cd apps/whatsapp-hello
cp .env.local.example .env.local   # fill in AI_GATEWAY_API_KEY
pnpm dev                            # localhost:3015
```

Optional env vars wire the real services (all degrade gracefully when absent):

| Var | Enables |
| --- | --- |
| `MP_ACCESS_TOKEN` | Mercado Pago Subscriptions tools |
| `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID` | Real WhatsApp sends (instead of mock) |
| `WA_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET` | Meta webhook verification |
| `AFIP_CERT_PEM`, `AFIP_KEY_PEM`, `AFIP_CUIT_REPRESENTADO` | Real AFIP/ARCA padron lookups |
| `WSP_AGENT_MODEL` | Override the default model |

## Try it

```bash
curl -X POST http://localhost:3015/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Validá el CUIT 20-12345678-6 y decime si tiene una suscripción activa."}'
```
