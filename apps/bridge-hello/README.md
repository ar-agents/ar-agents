# bridge-hello

Reference app for [`@ar-agents/agentic-commerce-bridge`](../../packages/agentic-commerce-bridge).
Spins up an ACP-compliant facilitator with a mock catalog (5 Argentine
products) and a mock MercadoPago provider, so you can curl the full ACP
surface without any real credentials.

## Run

```bash
pnpm install
pnpm --filter bridge-hello dev
# open http://localhost:3017
```

The landing page shows the live `/.well-known/acp.json` discovery payload,
the catalog, and curl recipes for every endpoint.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/.well-known/acp.json` | Discovery (RFC 8615) |
| `POST` | `/api/acp/checkout_sessions` | Create |
| `POST` | `/api/acp/checkout_sessions/{id}` | Update |
| `GET` | `/api/acp/checkout_sessions/{id}` | Read |
| `POST` | `/api/acp/checkout_sessions/{id}/complete` | Finalize w/ payment |
| `POST` | `/api/acp/checkout_sessions/{id}/cancel` | Cancel |
| `POST` | `/api/demo/seed` | (Demo only) Seed a mock MP "approved" payment |

## End-to-end flow (curl)

```bash
# 1) Create a session.
SESSION=$(curl -s -X POST http://localhost:3017/api/acp/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2026-04-17" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "currency": "ars",
    "line_items": [{ "id": "yerba_amanda", "quantity": 2 }],
    "buyer": { "email": "tere@example.com" }
  }' | tee /tmp/session.json | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Session: $SESSION"

# 2) Seed a matching mock MP payment (production: arrives via MP webhook).
TOTAL=$(python3 -c "import json; print(json.load(open('/tmp/session.json'))['totals'][-1]['amount']/100)")
curl -s -X POST http://localhost:3017/api/demo/seed \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"9001\",\"session_id\":\"$SESSION\",\"amount\":$TOTAL,\"currency\":\"ARS\"}"

# 3) Complete the session.
curl -s -X POST "http://localhost:3017/api/acp/checkout_sessions/$SESSION/complete" \
  -H "Content-Type: application/json" \
  -H "API-Version: 2026-04-17" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "buyer": { "email": "tere@example.com" },
    "payment_data": {
      "handler_id": "mercadopago",
      "instrument": {
        "type": "card",
        "credential": { "type": "mp_payment_id", "token": "9001" }
      }
    }
  }' | python3 -m json.tool
```

You'll see the resulting `CheckoutSessionWithOrder` payload, including
`order.metadata.factura_demo_note` (in production, replaced with a real
AFIP CAE via `@ar-agents/facturacion`).

## What ships in this app

- `src/lib/catalog.ts` — 5 demo products, returned by a `CatalogProvider`.
- `src/lib/mp.ts` — Mock `MercadoPagoPaymentProvider`. Pre-seed payments
  via `seedPayment()`; the bridge validates currency/amount/external_ref
  before authorizing.
- `src/lib/facilitator.ts` — `createFacilitator({...})` with the in-memory
  state adapter and `dispatcher.basePath = "/api/acp"`.
- `src/app/api/acp/[...slug]/route.ts` — Catch-all that dispatches to the
  bridge.
- `src/app/.well-known/acp.json/route.ts` — RFC 8615 discovery surface.
- `src/app/api/demo/seed/route.ts` — Helper to seed mock MP payments.

## Production checklist

When you swap this for a real deployment:

1. Replace `demoCatalog` with `createMeliCatalogProvider({...})` against
   MELI.
2. Replace `mockMpProvider` with `createMercadoPagoPaymentProvider({...})`
   wired against `@ar-agents/mercadopago` or raw fetch.
3. Replace `InMemoryStateAdapter` with `VercelKVStateAdapter` (or your
   preferred Redis-shape adapter).
4. Set `ACP_WEBHOOK_SECRET` env var (32+ bytes, `openssl rand -hex 32`).
5. Add `createFacturacionHook({...})` with your AFIP cert + ARCA padron
   lookup for auto-Factura A/B/C/E emission.
6. Replace `/api/demo/seed` with a real `/api/webhook/mercadopago` route
   that calls `buildAcpEventFromMpWebhook` and forwards to your agent's
   webhook URL via `signWebhook`.

## Deploy to Vercel

```bash
vercel link
vercel deploy --prod
```

The app needs no extra env vars to run as a demo. For production deploys,
set `ACP_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, and your AFIP cert env.

## License

MIT, same as the rest of `@ar-agents/*`.
