// ACP-compatible product feed endpoint.
//
// Buyer agents (ChatGPT, Claude, Gemini, anyone speaking the Agentic
// Commerce Protocol) hit this route to enumerate the merchant's catalog.
// Returns one page of products with a `next_cursor` for pagination.
//
// IMPORTANT — opt-in by design.
//   The default state of this endpoint is **403 Forbidden**. ACP feeds
//   expose seller catalogs to buyer agents that may transact OUTSIDE the
//   marketplace's own checkout (e.g., ChatGPT Instant Checkout). That's
//   useful for some sellers and competitive against others — it MUST be
//   an explicit choice, not a default.
//
//   To enable: set `FEED_OPT_IN=1` (server-wide) OR per-request pass an
//   `Opt-In: agentic-commerce-feed/2026-04-17` header. Without one of
//   those, agents are redirected back to MELI's own checkout flow at
//   /api/acp/checkout_sessions, which keeps the seller-marketplace
//   relationship intact.
//
// Two modes (only when opted in):
//   - When MELI_ACCESS_TOKEN + MELI_SELLER_ID are configured, hits live
//     MELI via @ar-agents/mercadolibre/feed.
//   - When unconfigured, returns a synthesized demo feed using the
//     bridge-hello mock catalog so the demo deployment is explorable
//     without seller credentials.
//
// Caching: page-level cache via Cache-Control + ETag. Buyer agents that
// are polling the feed for changes (typical pattern) get 304s instead of
// re-paying for the full catalog enumeration.

import { NextResponse } from "next/server";
import { MeliClient } from "@ar-agents/mercadolibre";
import { buildFeedPage, type FeedPage } from "@ar-agents/mercadolibre/feed";
import { PRODUCT_LIST } from "@/lib/catalog";
import type { ResolvedItem } from "@ar-agents/agentic-commerce-bridge";

export const runtime = "nodejs";
export const revalidate = 60; // ISR — re-enumerate at most every 60s

const ACP_FEED_VERSION = "2026-04-17";

const OPT_IN_HEADER_VALUE = "agentic-commerce-feed/2026-04-17";

function isOptedIn(req: Request): boolean {
  if (process.env["FEED_OPT_IN"] === "1") return true;
  const optIn = req.headers.get("opt-in");
  return optIn === OPT_IN_HEADER_VALUE;
}

export async function GET(req: Request) {
  // Opt-in gate. The default position is "do not expose the catalog to
  // out-of-marketplace buyer agents." This isn't an inconvenience — it's
  // the seller's primary lever to decide whether they want their listings
  // discovered by ChatGPT-Checkout-class flows that bypass MELI.
  if (!isOptedIn(req)) {
    return NextResponse.json(
      {
        error: "feed_opt_in_required",
        message:
          "This catalog is not exposed via Agentic Commerce Protocol by default. " +
          "Sellers prefer routing buyers through MELI's checkout to keep the " +
          "marketplace relationship intact.",
        how_to_opt_in: {
          server_wide: "Set FEED_OPT_IN=1 in your environment.",
          per_request: `Send the header: "Opt-In: ${OPT_IN_HEADER_VALUE}".`,
        },
        alternative_for_buyers: {
          checkout: new URL("/api/acp/checkout_sessions", req.url).toString(),
          discovery: new URL("/.well-known/acp.json", req.url).toString(),
        },
      },
      {
        status: 403,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-ACP-Version": ACP_FEED_VERSION,
          "X-Feed-Opt-In-Required": "1",
        },
      },
    );
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );

  const accessToken = process.env["MELI_ACCESS_TOKEN"];
  const sellerIdRaw = process.env["MELI_SELLER_ID"];
  const sellerId = sellerIdRaw ? Number.parseInt(sellerIdRaw, 10) : NaN;

  let page: FeedPage;
  let mode: "live" | "demo";

  if (accessToken && Number.isFinite(sellerId)) {
    mode = "live";
    const client = new MeliClient({
      auth: { kind: "bearer", accessToken },
      requestTimeoutMs: 15_000,
    });
    page = await buildFeedPage(client, sellerId, {
      limit,
      ...(cursor !== undefined ? { cursor } : {}),
    });
  } else {
    mode = "demo";
    page = buildDemoPage(cursor, limit);
  }

  const body = {
    protocol: { name: "acp", version: ACP_FEED_VERSION },
    mode,
    ...page,
  };

  // Stable ETag derived from the cursor + product ids in this page —
  // changes only when the catalog mutates within this slice.
  const etagSource = `${cursor ?? "first"}|${page.products
    .map((p) => `${p.id}:${p.price}`)
    .join(",")}`;
  const etag = `W/"${simpleHash(etagSource)}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Content-Type": "application/json; charset=utf-8",
      "X-ACP-Version": ACP_FEED_VERSION,
      ETag: etag,
    },
  });
}

function buildDemoPage(cursor: string | undefined, limit: number): FeedPage {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const slice = PRODUCT_LIST.slice(start, start + limit);
  const next = start + limit;
  return {
    products: slice.map((p: ResolvedItem) => ({
      id: p.id,
      title: p.name,
      currency: p.currency.toUpperCase(),
      // Demo catalog stores price in minor units; the ACP feed convention
      // is major units, so divide by the currency's divisor.
      price: p.unit_amount / 100,
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.available_quantity !== undefined
        ? { available_quantity: p.available_quantity }
        : {}),
      ...(p.images && p.images.length > 0 ? { images: p.images } : {}),
      vendor_metadata: {
        meli: { site_id: "MLA", condition: "new" as const },
      },
    })),
    next_cursor: next < PRODUCT_LIST.length ? String(next) : null,
    generated_at: new Date().toISOString(),
  };
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
