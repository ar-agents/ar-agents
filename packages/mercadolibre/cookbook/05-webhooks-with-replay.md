# Recipe 05 — Webhooks + 2-day replay window

MELI fires webhooks for `orders_v2`, `claims`, `messages`, etc. Your server is going to be down sometimes. The `/myfeeds` endpoint lets you replay the **last 2 days** of missed events — but only if you actually ask for them. This is the gap the rest of the JS ecosystem ignores.

## 1. Receiving and parsing webhooks

```ts
// Next.js App Router: app/api/webhooks/meli/route.ts
import { parseWebhook, MeliWebhookError } from "@ar-agents/mercadolibre";

export async function POST(req: Request) {
  let event;
  try {
    event = parseWebhook(await req.json(), {
      expectedTopics: ["orders_v2", "claims", "questions"],
      expectedApplicationId: Number(process.env.MELI_APP_ID),
    });
  } catch (err) {
    if (err instanceof MeliWebhookError) {
      console.error("invalid webhook", err.message);
      return new Response("bad request", { status: 400 });
    }
    throw err;
  }

  // event is now typed: { _id, resource, user_id, topic, application_id, attempts, sent }
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
  }

  // ALWAYS 200 fast. Otherwise MELI retries and your queue doubles.
  return new Response(null, { status: 200 });
}
```

## 2. Replaying missed feeds (the 2-day window)

When your service was down for 5 minutes — or 2 hours — call `/myfeeds` to recover the events MELI couldn't deliver:

```ts
import { MeliClient, iterateAllMissedFeeds } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// Run on app startup, after deploys, or on a 30-minute cron.
async function recoverMissedEvents() {
  const recovered: { topic: string; resource: string }[] = [];

  for await (const event of iterateAllMissedFeeds(
    client,
    Number(process.env.MELI_APP_ID),
    ["orders_v2", "claims", "questions"], // topics you care about
  )) {
    recovered.push({ topic: event.topic, resource: event.resource });

    // Re-dispatch through the same pipeline as live webhooks.
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
    }
  }

  console.log(`recovered ${recovered.length} missed events`);
}
```

`iterateAllMissedFeeds` pages through `/myfeeds` until empty across every topic you list — handles the pagination automatically.

## 3. Idempotency guard

MELI sometimes redelivers webhooks (network blip on their side). Always dedupe by `_id`:

```ts
async function processOnce(event: MeliWebhookEvent) {
  const { rowCount } = await sql`
    INSERT INTO meli_webhook_log (id, topic, resource, processed_at)
    VALUES (${event._id}, ${event.topic}, ${event.resource}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  if (rowCount === 0) {
    return; // already processed
  }
  // ... actually handle the event
}
```

## 4. The full reliability story

Putting it together:

| Mechanism | Recovers | Latency |
| --- | --- | --- |
| Live POST webhook | Single event | ~1s after the change on MELI |
| `_id` dedup at sink | Duplicate redeliveries | n/a — sub-ms guard |
| `/myfeeds` replay | Up to 2 days of missed events | up to 2-day backlog window |

Run the replay on every cold start and on a 30-minute cron. **The combination is the only way to guarantee you won't miss orders.**
