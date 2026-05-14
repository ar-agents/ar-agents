# Recipe 12 — ACP product feed for agent-driven shopping

> **Read this before turning the feed on.** ACP feeds are a tradeoff, not a free win.

## The tradeoff

When a buyer asks ChatGPT/Claude/Gemini *"buy me yerba mate amanda 1kg in Argentina"*, the agent looks for an **agent-readable product catalog** — specifically, an ACP (Agentic Commerce Protocol) feed.

The honest framing:

| If you expose an ACP feed | If you don't |
| --- | --- |
| **Pro:** ChatGPT Instant Checkout / Copilot Checkout can find your listings. | Buyer agents fall back to MELI's existing surfaces (web, app, API). |
| **Pro:** Discovery in a buyer surface that doesn't exist today (and may grow fast). | Your relationship with MELI's checkout / Mercado Pago / Mercado Envíos / claims SLA stays intact. |
| **Con:** Buyers may transact OUTSIDE MELI's checkout — bypassing reviews, MP, ME, SLAs. | You miss the agent buyers who can't find non-feed catalogs. |
| **Con:** Easier for competitors (Amazon, Shein, scrapers) to harvest your catalog. | You don't accelerate the disintermediation of LATAM marketplaces. |

There's no objectively-correct answer. **It depends on the seller.** A long-tail seller without strong MELI reputation might want broader discovery; a high-volume seller with a 5_green thermometer probably doesn't.

The reference implementation in `bridge-hello` is **opt-in by default** — returns 403 unless `FEED_OPT_IN=1` or an `Opt-In: agentic-commerce-feed/2026-04-17` header is sent. We strongly recommend hosts adopt the same posture.

## The flow

```
                                        ┌──────────────────────┐
[ChatGPT shopping turn] ────────────────▶│ /.well-known/        │
                                        │   agentic-feed.json  │
                                        └──────────────────────┘
                                                  │
                                                  ▼ "feed lives at /api/feed/products"
                                        ┌──────────────────────┐
                                        │ /api/feed/products   │
                                        │   ?cursor=…          │
                                        └──────────────────────┘
                                                  │
                                                  ▼ ACP FeedPage JSON
                                        [agent picks a product, hits /api/acp/checkout_sessions]
```

## The discovery payload

```ts
// app/.well-known/agentic-feed.json/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    protocol: { name: "acp", version: "2026-04-17" },
    feed: {
      url: `${origin}/api/feed/products`,
      paginated: true,
      cursor_param: "cursor",
      limit_param: "limit",
      max_limit: 200,
      cache_seconds: 60,
      content_type: "application/json",
    },
    checkout: {
      url: `${origin}/api/acp/checkout_sessions`,
      bridge: `${origin}/.well-known/acp.json`,
    },
  });
}
```

Buyer agents follow the well-known convention to find the feed without hardcoded URLs. RFC 8615.

## The feed endpoint (Next.js)

```ts
// app/api/feed/products/route.ts
import { NextResponse } from "next/server";
import { MeliClient } from "@ar-agents/mercadolibre";
import { buildFeedPage } from "@ar-agents/mercadolibre/feed";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );

  const client = new MeliClient({
    auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
    requestTimeoutMs: 15_000,
  });

  const page = await buildFeedPage(client, Number(process.env.MELI_SELLER_ID), {
    limit,
    ...(cursor ? { cursor } : {}),
  });

  // ETag for free pagination cache hits — buyer agents that re-poll
  // unchanged feed slices get 304s instead of paying for re-enumeration.
  const etag = `W/"${simpleHash(`${cursor ?? ""}|${page.products.map((p) => `${p.id}:${p.price}`).join(",")}`)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json(
    {
      protocol: { name: "acp", version: "2026-04-17" },
      ...page,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "X-ACP-Version": "2026-04-17",
        ETag: etag,
      },
    },
  );
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
```

That's it. Five MELI calls (one search + N×multiget) per page, ETag-cached for 60s.

## What `FeedProduct` contains

```ts
interface FeedProduct {
  id: string;                    // "MLA1402155766"
  title: string;
  description?: string;
  currency: string;              // "ARS" (uppercase per ACP spec)
  price: number;                 // major units (4500, not 450000)
  available_quantity?: number;
  permalink?: string;            // deep-link the agent can open
  category?: string;
  brand?: string;
  images?: string[];             // secure_url preferred over url
  attributes?: Record<string, string>;  // "Marca" -> "Amanda", etc.
  seller?: { id?: string; name?: string };
  shipping?: { free?: boolean; mode?: string; logistic_type?: string };
  vendor_metadata?: {
    meli?: {
      site_id: string;
      condition?: "new" | "used" | "not_specified";
      listing_type_id?: string;
      sold_quantity?: number;
      tags?: string[];
    };
  };
}
```

The `vendor_metadata.meli` namespace lets MELI-specific agents do richer reasoning (`condition === "used"`, `sold_quantity > 1000`) while generic agents just see the standard ACP shape.

## Streaming a giant catalog

For sellers with 10k+ items, buffering the whole catalog into one HTTP response is wasteful. Use the streaming variant:

```ts
import { iterateFeed } from "@ar-agents/mercadolibre/feed";

const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue(encoder.encode("[\n"));
    let first = true;
    for await (const product of iterateFeed(client, sellerId)) {
      const prefix = first ? "" : ",\n";
      controller.enqueue(encoder.encode(prefix + JSON.stringify(product)));
      first = false;
    }
    controller.enqueue(encoder.encode("\n]"));
    controller.close();
  },
});

return new Response(stream, {
  headers: { "Content-Type": "application/json" },
});
```

The buyer agent starts consuming products before MELI has finished enumerating the seller's full catalog. Lower TTFB, lower memory, same total bytes.

## What this defends against

- **ChatGPT shopping in 2026+** — when OpenAI ships agent-driven purchases natively, this is the surface they read. If MELI sellers don't emit feeds, they're invisible.
- **Claude shopping via MCP** — same shape.
- **Anthropic's `web-search` tool already opens permalinks** — having the feed means the answer is "I found it on this MELI seller" instead of "let me search…"
- **Gemini's product graph** — Google indexes feeds, not search results. ACP overlap with `Schema.org/Product` is high.

The seller doesn't have to do anything different. The agent layer handles discovery on behalf of the buyer; the seller just keeps listing on MELI like always.

## What it doesn't replace

The feed is **discovery**, not **transaction**. The buyer agent finds your product in the feed → opens a checkout session via the ACP facilitator (`/api/acp/checkout_sessions`) → the actual MELI order happens through the facilitator's MELI integration, not the feed. See [bridge-hello](https://bridge-hello.ar-agents.ar) for the full transaction flow.
