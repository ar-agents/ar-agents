# ar-agents-mp-hello

**Fase 1** del [AR Agents stack](../README.md). Demo end-to-end de un agente Vercel + AI SDK 6 + Mercado Pago Subscriptions.

El objetivo de esta fase: probar que las piezas conectan limpias, antes de extraer cualquier librería.

## Stack

- **Next.js 16** — App Router, route handlers
- **Vercel AI SDK 6** — `Experimental_Agent` con tool loop
- **Vercel AI Gateway** — routing a Anthropic Claude (cualquier provider via gateway)
- **Mercado Pago REST API** — direct fetch, sin SDK oficial
- **Upstash Redis** — persistencia de subscription state

## Setup

### 1. Credenciales

Copiá `.env.local.example` → `.env.local` y completá:

```bash
cp .env.local.example .env.local
```

Necesitás tres servicios:

| Servicio | Dónde sacar el credential |
|---|---|
| **Mercado Pago Sandbox** | [Panel de developers MP](https://www.mercadopago.com.ar/developers/panel/credentials) → usar el TEST access token (NO el de producción) |
| **Vercel AI Gateway** | [Vercel dashboard → AI Gateway → API Keys](https://vercel.com/dashboard/ai-gateway/api-keys) (free $5/mes per team) |
| **Upstash Redis** | [console.upstash.com/redis](https://console.upstash.com/redis) → crear free DB → copiar REST URL + TOKEN |

### 2. Instalar y correr

```bash
pnpm install
pnpm dev
```

Abrí <http://localhost:3000>.

### 3. Test rápido

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Creá una subscription mensual de $100 ARS para test_user@test.com, motivo: Plan básico"}'
```

Respuesta esperada: el agente llama `create_subscription`, devuelve un `init_point_url` de MP.

## Flujo end-to-end de testing

1. **Crear subscription** vía agente (curl arriba). Guardate el `subscription_id` y el `init_point_url`.
2. **Completar primer pago humano**: abrí el `init_point_url` en el browser. Usá una [test card de MP Sandbox](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/additional-content/your-integrations/test/cards) (ej: Mastercard `5031 7557 3453 0604`, CVV `123`, fecha futura). Email del comprador: cualquier email test que NO sea el del seller.
3. **Configurar webhook MP** (una vez, en panel de developers MP):
   - URL: `https://<tu-tunnel>.ngrok.io/api/webhook/mercadopago` (para local) o tu dominio Vercel deployado
   - Topic: `preapproval`
   - Para local con ngrok: `ngrok http 3000` y usar la URL pública
4. **Verificar status** vía agente:
   ```bash
   curl -X POST http://localhost:3000/api/agent \
     -H "Content-Type: application/json" \
     -d '{"message": "qué status tiene la sub <SUBSCRIPTION_ID>?"}'
   ```
   Debería devolver `status: authorized` y un `next_payment_date`.
5. **Recurring automático**: MP cobra solo según frecuencia. No hay que disparar nada desde el agente.

## Estructura

```
src/
├── app/
│   ├── page.tsx                         # Landing simple con instructions
│   └── api/
│       ├── agent/
│       │   └── route.ts                 # POST /api/agent — conversa con agent
│       └── webhook/
│           └── mercadopago/
│               └── route.ts             # POST /api/webhook/mercadopago — recibe events MP
└── lib/
    ├── mercadopago.ts                   # MP REST API client (direct fetch)
    ├── tools.ts                         # AI SDK tools que envuelven MP
    ├── agent.ts                         # Agent instance (Experimental_Agent)
    └── state.ts                         # Upstash Redis helpers para subscription state
```

## Acceptance criteria de Fase 1

- [ ] Agente crea subscription end-to-end
- [ ] Webhook recibe evento `preapproval` y actualiza state en Redis
- [ ] Agente reporta status correcto post-pago humano
- [ ] Recurring charge ocurre sin intervención del agente (segundo mes en sandbox)
- [ ] Cancel funciona

Si todo lo anterior pasa, **listo para Fase 2** (extraer `@ar-agents/mercadopago` como npm package).

## Notas técnicas

- **CVV constraint de MP**: el primer pago de una subscription siempre requiere el cliente humano tipear CVV. No hay forma de saltarse esto. Por eso el flow es "agente crea sub + humano paga primer vez + de ahí en adelante MP cobra solo."
- **Webhook signature**: este v0 NO valida la firma del webhook. Para producción, agregar HMAC verification con el secret de MP.
- **Token storage**: el access token vive solo en env vars. NO en DB. NO en el código.
- **Idempotency**: este v0 NO implementa idempotency keys en el agent. Si el agente llama `create_subscription` dos veces para el mismo customer, crea dos subscriptions. Para producción, el agent debería verificar si ya existe.
- **AI Gateway**: el modelo se setea con string `"anthropic/claude-sonnet-4-6"` y AI SDK 6 enruta automáticamente vía Vercel AI Gateway si `AI_GATEWAY_API_KEY` está seteado. Para BYOK, setear `ANTHROPIC_API_KEY` directamente.

## Roadmap inmediato

- **Fase 2**: Extraer este código a `@ar-agents/mercadopago` npm package, con docs y tests.
- **Fase 3**: Hello CUIT Validator (AFIP).
- **Fase 4**: Lib `@ar-agents/identity`.
- **Fase 5-6**: WhatsApp.

Ver design doc completo: `~/.gstack/projects/claude/nazarenoclemente-unknown-design-20260505-133202.md`.
