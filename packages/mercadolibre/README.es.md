# @ar-agents/mercadolibre

> **Toolkit de agentes para Mercado Libre**, hecho para el Vercel AI SDK 6.
> Proyecto open-source independiente · No afiliado a Mercado Libre S.R.L.
>
> Un SDK tipado de TypeScript production-grade para la superficie API de MELI relevante para agentes — construido por la comunidad para llenar el hueco que dejó [`mercadolibre/nodejs-sdk`](https://github.com/mercadolibre/nodejs-sdk) cuando lo archivaron en febrero 2022.

🇬🇧 [English version](./README.md)

---

### Estado y disclosures

| | |
| --- | --- |
| **Madurez** | Beta — superficie estable, iteración pública |
| **Mantenimiento** | Solo-mantenido ([Nazareno Clemente](mailto:naza@naza.ar)) |
| **SLA** | Ninguno — soporte best-effort de la comunidad |
| **Afiliación** | **Independiente.** Sin endoso, patrocinio o validación de Mercado Libre S.R.L. |
| **Marca registrada** | `MERCADOLIBRE®` es marca registrada de Mercado Libre S.R.L. Este package usa el nombre en sentido descriptivo y de fair-use nominativo para identificar la API que integra. |
| **Disclosures de seguridad** | Email a `naza@naza.ar` con asunto `[security]`. Ver [SECURITY.md](./SECURITY.md). |
| **Bus factor** | 1. Plan accordingly. |

Si lo estás considerando para producción, leé [CHANGELOG.md](./CHANGELOG.md) (señal de velocidad), [SECURITY.md](./SECURITY.md) (threat model), [POSITIONING.md](./POSITIONING.md) (posicionamiento estratégico) y [`evals/results.md`](./evals/results.md) (benchmark LLM-as-judge).

---

## Instalación

```bash
pnpm add @ar-agents/mercadolibre
# o
npm i @ar-agents/mercadolibre
```

Peer deps:

- `ai >= 6.0.0` — solo necesario si importás `@ar-agents/mercadolibre/ai-sdk`.
- `zod >= 3.0.0` — los types salen de Zod 4 con back-compat.

## Tour de 60 segundos

```ts
import { MeliClient, getItem, autoOptInPromotions } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// 1. Traer un listing tipado.
const item = await getItem(client, "MLA1402155766");
console.log(item.title, item.price, item.available_quantity);

// 2. Listar candidatos a promo y auto-opt-in solo si el margen pasa el 20%.
const r = await autoOptInPromotions(client, sellerId, {
  cogsByItem: { MLA1402155766: 600 }, // tu tabla de COGS
  defaultMinimumMargin: 0.2,
});
console.log(`opted in: ${r.optedIn.length}, skipped: ${r.skipped.length}`);
```

Para el crash-course de 5 minutos, ver el [cookbook](./cookbook).

## OAuth — la parte que la mayoría de los SDK arruinan

MELI usa **refresh tokens single-use**. Si dos requests refrescan en paralelo, una gana y la otra recibe `refresh_token_reused` — y ese error invalida **ambos** tokens. La aproximación naïve (un UPDATE en una columna de Postgres) pierde ~5–10% de los refreshes bajo cualquier concurrencia.

Este package coalese refreshes concurrentes por user-id con un mutex in-process y deja que vos enchufes un token-store serializable (Postgres, Redis, KV, etc.):

```ts
import { MeliClient, type OAuthTokenStore } from "@ar-agents/mercadolibre";

const store: OAuthTokenStore = {
  async read(userId) { /* SELECT del DB */ },
  async write(userId, tokens) { /* UPSERT atómico con CAS */ },
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

El mutex es por `userId` así que hosts multi-tenant no serializan entre customers.

> **Caveat de Edge runtime:** los Vercel Edge isolates no comparten estado. El mutex ayuda cuando un solo isolate maneja múltiples requests concurrentes, pero las races cross-isolate todavía necesitan un compare-and-swap a nivel del token store (`UPDATE … WHERE refresh_token = $old`). Esa es la misma constraint que tiene **toda** integración con MELI — este package no pretende magickearla.

## Vercel AI SDK 6 — drop-in tools

```ts
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MeliClient } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({ auth: { kind: "bearer", accessToken: token } });

const agent = new Agent({
  model: anthropic("claude-sonnet-4-6"),
  tools: meliTools(client, {
    siteId: "MLA",
    sellerId: 12345,
    // HITL opcional: gate programático en operaciones irreversibles.
    hitl: {
      requireConfirmation: async (ctx) => {
        const ok = await yourApp.askUser({ summary: ctx.summary, severity: ctx.severity });
        return ok ? { approve: true } : { approve: false };
      },
    },
  }),
});

const r = await agent.generate({
  prompt: "¿Cuántas órdenes pagas tengo hoy y hay alguna pregunta sin responder?",
});
```

Tools shipped (14): `list_my_items`, `get_item`, `create_item`, `update_item_price_or_stock`, `categorize_listing_and_plan_attributes`, `list_unanswered_questions`, `answer_question`, `classify_question_spam`, `list_recent_orders`, `get_order`, `list_open_claims`, `defend_claim`, `get_seller_reputation`, `list_promotion_candidates`.

Cada tool retorna un discriminated union `{ ok: true, ... } | { ok: false, code, message }` así el modelo nunca tiene que adivinar sobre un error tirado. Ver [`AGENTS.md`](./AGENTS.md) para las reglas de selección + result schemas que el LLM lee en runtime.

## Testing — `mockFetch()` builder + cliente pre-armado

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

El builder graba cada request (method, url, headers, body) así podés assertar sobre query strings y request bodies sin tocar `msw`/`nock`.

## Superficie API (módulos)

| Módulo | Highlights |
| --- | --- |
| `client` | `MeliClient`, `MeliClientOptions`, `FetchOptions` |
| `oauth` | `ensureAccessToken`, `OAuthTokenStore`, refresh coalescido por `AsyncLock` |
| `items` | `getItem`, `multigetItems` (auto-chunked), `createItem`, `updateItem`, `pauseItem`, `closeItem`, `relistItem`, `searchSellerItems`, `iterateSellerItems` |
| `categories` | `predictCategory`, `discoverDomain`, `getDomainTechnicalSpecs`, **`categorizeAndPlan`** (one-shot category + atributos requeridos) |
| `questions` | `listQuestions`, `answerQuestion`, `blacklistAsker`, `unblockAsker`, **clasificador de spam heurístico** (URL/teléfono/email + repetición + cuenta nueva) |
| `orders` | `searchOrders`, `getOrder`, `getOrderBillingInfo`, `getPack`, **`partitionByPack`** (carrito vs single) |
| `claims` | `searchClaims`, `getClaim`, `uploadClaimEvidence`, `listClaimEvidences`, `postClaimMessage`, `reviewReturn`, **`defendClaim`** (defensor del SLA de 2 días, con upload secuencial + failure surface honesta) |
| `shipments` | `getShipment`, `getShipmentHistory`, `fetchLabelsBlob` (ZPL/PDF), `getShippingOptions` |
| `reputation` | `getSellerReputation`, **`evaluateReputationAlerts`** (thresholds del termómetro), **`monitorReputation`** (async generator) |
| `promotions` | `listPromotionCandidates`, `optInPromotion`, **`autoOptInPromotions`** (con margin guard) |
| `webhooks` | `parseWebhook`, `extractResourceId`, **`replayMissedFeeds`**, **`iterateAllMissedFeeds`** (recuperación de la ventana de 2 días con dedup) |
| `feed` | `meliItemToFeedProduct`, `buildFeedSnapshot`, `iterateFeed`, `buildFeedPage` — generador de feed ACP **opt-in por defecto** |
| `ai-sdk` | `meliTools(client, opts)` retornando un `ToolSet` de Vercel AI SDK 6 |
| `testing` | `mockFetch()` builder, `makeMeliClient(opts)` factory |

Cada función pública tiene un schema Zod tanto para inputs (cuando aplica) como para responses, validados por default. Pasá `skipResponseValidation: true` en el cliente para hot paths.

## Los 8 blindspots que esto llena

El SDK oficial archivado nunca cubrió, y el ecosistema 2026 sigue ignorando:

1. **Races de refresh-token single-use** — coalescidas + mutex'd acá.
2. **Rate limit por seller** — token bucket (24/s, burst 60 por default) así un tenant no le saca tokens al resto.
3. **Replay de `/missed_feeds`** — la única forma de sobrevivir un outage de 5 min y recuperar el backlog de 2 días.
4. **Predictor de categoría + technical specs** en una sola llamada (`categorizeAndPlan`).
5. **Patrón de defensa de claims** — get + upload secuencial de evidencias + mensaje opcional, todo bajo el SLA.
6. **Alertas del termómetro de reputación** — traduce el level + métricas en severities accionables.
7. **Margin guard en promociones** — nunca te metés debajo del piso, jamás.
8. **Clasificador heurístico de spam para preguntas** — explicable, sin dependencia de LLM, pareado con `borderline` para un second-pass.

## Licencia

MIT © Nazareno Clemente. Esto es un SDK de la comunidad, no afiliado a Mercado Libre S.R.L.
