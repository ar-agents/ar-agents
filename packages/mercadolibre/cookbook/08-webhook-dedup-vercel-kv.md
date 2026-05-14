# Recipe 08 — Production webhook dedup with Vercel KV

[Recipe 05](./05-webhooks-with-replay.md) showed the basic shape. This recipe is the **production-grade** version: every event is deduped against Vercel KV with a 7-day TTL (longer than MELI's 2-day replay window so we never re-process anything during a `/myfeeds` recovery).

## Why dedup matters

MELI redelivers webhooks on:
- Network blips on their side (a few per day, normal).
- Your `/myfeeds` replay after an outage (potentially thousands at once).
- Their gateway's at-least-once guarantee (rare but real).

Without dedup, you double-process: customers get charged twice, agents answer the same question twice, claims get double-defended. The KV store is the cheapest, fastest gate that catches all three cases.

## Setup

```bash
pnpm add @vercel/kv @ar-agents/mercadolibre
```

In your Vercel project, add the KV integration (one click in dashboard) — Vercel sets `KV_REST_API_URL` + `KV_REST_API_TOKEN` automatically.

## Webhook handler

```ts
// app/api/webhooks/meli/route.ts
import { kv } from "@vercel/kv";
import {
  parseWebhook,
  MeliWebhookError,
  type MeliWebhookEvent,
} from "@ar-agents/mercadolibre";

const DEDUP_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const KEY_PREFIX = "meli:webhook:seen:";

async function isFirstDelivery(eventId: string): Promise<boolean> {
  // SET key value NX EX 604800 — atomic test-and-set with TTL.
  // Returns "OK" on first delivery, null on duplicate.
  const result = await kv.set(`${KEY_PREFIX}${eventId}`, 1, {
    nx: true,
    ex: DEDUP_TTL_SECONDS,
  });
  return result === "OK";
}

export async function POST(req: Request) {
  let event: MeliWebhookEvent;
  try {
    event = parseWebhook(await req.json(), {
      expectedTopics: ["orders_v2", "claims", "questions", "messages"],
      expectedApplicationId: Number(process.env.MELI_APP_ID),
    });
  } catch (err) {
    if (err instanceof MeliWebhookError) {
      return new Response("bad request", { status: 400 });
    }
    throw err;
  }

  if (!(await isFirstDelivery(event._id))) {
    // Already processed. Return 200 so MELI stops retrying.
    return new Response(null, { status: 200 });
  }

  // First time — enqueue. Return 200 fast (MELI cuts off at ~3s).
  switch (event.topic) {
    case "orders_v2":
      await enqueueOrderProcessing(event.user_id, event.resource);
      break;
    case "claims":
      await enqueueClaimTriage(event.user_id, event.resource);
      break;
    case "questions":
      await enqueueQuestionAnswer(event.user_id, event.resource);
      break;
    case "messages":
      await enqueueMessageHandling(event.user_id, event.resource);
      break;
  }

  return new Response(null, { status: 200 });
}
```

## Why `SET … NX EX` and not `GET` then `SET`

Two webhooks arriving in the same 100ms window both call `GET` and both see `null` (no key yet). They both call `SET` — and both think they're the first. You've doubled.

`SET … NX EX` is **atomic**: only the request whose `SET` lands first inside KV's single-threaded executor wins. The other gets `null`. This is the same primitive Stripe's webhook docs recommend, just with KV instead of Postgres' `ON CONFLICT … DO NOTHING`.

## Pairing with replay

When you run [`iterateAllMissedFeeds`](./05-webhooks-with-replay.md) after an outage, every recovered event passes through this same dedup gate before processing. So even if MELI re-delivers the same `_id` across the live webhook AND the replay, you process it once.

```ts
import { MeliClient, iterateAllMissedFeeds } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

for await (const event of iterateAllMissedFeeds(
  client,
  Number(process.env.MELI_APP_ID),
  ["orders_v2", "claims", "questions"],
)) {
  if (!(await isFirstDelivery(event._id))) continue;
  // ... same dispatch as the live webhook handler
}
```

The 7-day TTL is the safety margin: even if you run the replay 6 days later (e.g., recovering from a long incident), the dedup still catches anything from before.

## Cost

Vercel KV charges per request, not by storage. A typical seller doing 1k orders/month produces ~5k webhook deliveries; dedup is 5k atomic `SET` ops/month — well inside any free tier and rounds to zero on paid plans.
