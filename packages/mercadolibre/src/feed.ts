// Agentic Commerce Protocol (ACP) feed generator for MELI sellers.
//
// IMPORTANT — read this before exposing the feed publicly.
//
//   ACP is the OpenAI/Stripe protocol that lets buyer agents (ChatGPT
//   Instant Checkout, Copilot Checkout) discover and transact against
//   merchant catalogs WITHOUT routing the buyer through the merchant's
//   marketplace.
//
//   For a seller on Mercado Libre, that's a tradeoff:
//     PRO — broader discovery; buyers asking ChatGPT for "yerba amanda 1kg
//           in Argentina" can find your listing instead of a competitor's.
//     CON — the buyer-marketplace relationship MELI cultivates (reviews,
//           Mercado Pago checkout, Mercado Envíos shipping, claims SLA) is
//           bypassed if the buyer agent transacts purely via the feed +
//           an external Stripe checkout. That weakens MELI's role.
//
//   This module gives you the building blocks. It does NOT decide whether
//   you should expose a feed. The reference implementation in
//   `apps/bridge-hello/src/app/api/feed/products/route.ts` is **opt-in by
//   default** (returns 403 unless `FEED_OPT_IN=1` or an explicit `Opt-In`
//   header is sent), and we recommend hosts adopt the same posture.
//
// What's here:
//   1. Iterates a seller's full catalog via `iterateSellerItems` + multiget.
//   2. Maps each MELI Item to an ACP `FeedProduct` shape compatible with
//      OpenAI/Stripe Agentic Commerce Protocol 2026-04-17.
//   3. Yields products as a stream so consumers can serve a paginated feed
//      endpoint without buffering a full catalog in memory.
//
// Three usage patterns:
//
//   a) `buildFeedSnapshot(client, sellerId)` — buffers the whole catalog
//      into memory (good for small sellers or one-shot exports).
//   b) `iterateFeed(client, sellerId)` — async iterator (good for streaming
//      a `/api/feed` endpoint).
//   c) `meliItemToFeedProduct(item)` — pure mapper (use it inside your
//      own enumeration if you have a custom catalog scope).

import type { MeliClient } from "./client";
import * as items from "./items";
import type { Item as TItem } from "./schemas/item";

// ---------------------------------------------------------------------------
// ACP product shape (subset that maps cleanly from MELI Item)
// ---------------------------------------------------------------------------

/** Agent-readable product entry. Compatible with OpenAI/Stripe ACP feed
 *  contract — additional MELI-specific fields are tucked under
 *  `vendor_metadata.meli` so generic agents see only the standard surface. */
export interface FeedProduct {
  /** Stable product id (the MELI item id, e.g. "MLA1402155766"). */
  id: string;
  /** Human-facing product title. */
  title: string;
  /** Product description in plain text. */
  description?: string;
  /** ISO 4217 currency code, uppercase. */
  currency: string;
  /** Price in major units (4500.50 means $4500.50). The ACP convention is
   *  major units; minor-unit conversion is the buyer agent's job. */
  price: number;
  /** Available quantity. Omitted if MELI didn't return a stock figure. */
  available_quantity?: number;
  /** Public listing URL the buyer agent can deep-link to. */
  permalink?: string;
  /** Category id in MELI's taxonomy. */
  category?: string;
  /** Brand if known. */
  brand?: string;
  /** Image URLs (first one is the primary). */
  images?: string[];
  /** Free-form attributes the agent can reason about (color, size, weight). */
  attributes?: Record<string, string>;
  /** Seller id + name. */
  seller?: { id?: string; name?: string };
  /** Shipping affordances. */
  shipping?: { free?: boolean; mode?: string; logistic_type?: string };
  /** Vendor-specific metadata. Generic agents ignore this; MELI-specific
   *  agents can use it for richer behavior. */
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

/** Page envelope for HTTP feed endpoints. The ACP spec recommends this
 *  shape so buyer agents can paginate without scanning per-product. */
export interface FeedPage {
  products: FeedProduct[];
  /** Cursor to pass back to fetch the next page. Null when exhausted. */
  next_cursor: string | null;
  /** Wall-clock timestamp the feed was generated. ISO 8601. */
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Pure mapper — MELI Item → ACP FeedProduct
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["active"]);

/**
 * Map one MELI Item to an ACP FeedProduct. Returns null when the item
 * isn't agent-purchasable (paused, closed, under_review, etc.) so callers
 * can `.filter(Boolean)` cleanly.
 */
export function meliItemToFeedProduct(
  item: Pick<
    TItem,
    | "id"
    | "site_id"
    | "title"
    | "price"
    | "currency_id"
    | "available_quantity"
    | "sold_quantity"
    | "status"
    | "condition"
    | "listing_type_id"
    | "permalink"
    | "category_id"
    | "seller_id"
    | "pictures"
    | "attributes"
    | "shipping"
    | "tags"
  > & { description?: string },
): FeedProduct | null {
  if (item.status && !ACTIVE_STATUSES.has(item.status)) return null;

  const images = (item.pictures ?? [])
    .map((p) => p.secure_url ?? p.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const attributes: Record<string, string> = {};
  if (item.attributes) {
    for (const a of item.attributes) {
      const name = a.name ?? a.id;
      if (a.value_name && name) attributes[name] = a.value_name;
    }
  }

  // Pull the BRAND attribute up to top-level (most agents look there).
  const brand =
    item.attributes?.find((a) => a.id === "BRAND")?.value_name ?? undefined;

  const shipping: NonNullable<FeedProduct["shipping"]> = {};
  if (item.shipping?.free_shipping !== undefined) shipping.free = item.shipping.free_shipping;
  if (item.shipping?.mode !== undefined) shipping.mode = item.shipping.mode;
  if (item.shipping?.logistic_type !== undefined) {
    shipping.logistic_type = item.shipping.logistic_type;
  }

  const out: FeedProduct = {
    id: item.id,
    title: item.title,
    currency: item.currency_id.toUpperCase(),
    price: item.price,
  };
  if (item.description !== undefined) out.description = item.description;
  if (item.available_quantity !== undefined) {
    out.available_quantity = item.available_quantity;
  }
  if (item.permalink !== undefined) out.permalink = item.permalink;
  if (item.category_id !== undefined) out.category = item.category_id;
  if (brand !== undefined) out.brand = brand;
  if (images.length > 0) out.images = images;
  if (Object.keys(attributes).length > 0) out.attributes = attributes;
  if (item.seller_id !== undefined) {
    out.seller = { id: String(item.seller_id) };
  }
  if (Object.keys(shipping).length > 0) out.shipping = shipping;
  out.vendor_metadata = {
    meli: {
      site_id: item.site_id,
      ...(item.condition !== undefined ? { condition: item.condition } : {}),
      ...(item.listing_type_id !== undefined
        ? { listing_type_id: item.listing_type_id }
        : {}),
      ...(item.sold_quantity !== undefined
        ? { sold_quantity: item.sold_quantity }
        : {}),
      ...(item.tags !== undefined ? { tags: item.tags } : {}),
    },
  };
  return out;
}

// ---------------------------------------------------------------------------
// Streaming feed builder
// ---------------------------------------------------------------------------

export interface IterateFeedOptions {
  /** Page size for `iterateSellerItems` (default 100). */
  pageSize?: number;
  /** Concurrency for the multiget calls that hydrate item details
   *  (default 4). MELI multiget is 20 ids per call. */
  concurrency?: number;
  /** Filter to specific MELI item statuses. Default `["active"]` because
   *  agents shouldn't try to buy paused/closed listings. */
  acceptableStatuses?: string[];
}

/**
 * Stream the seller's catalog as ACP `FeedProduct` entries. Use this in a
 * Next.js / Remix / Hono / Express handler that builds a feed endpoint —
 * each yield can be written to the response stream so the buyer agent
 * starts consuming products before the seller's full catalog has loaded.
 */
export async function* iterateFeed(
  client: MeliClient,
  sellerId: number,
  options: IterateFeedOptions = {},
): AsyncGenerator<FeedProduct, void, void> {
  const acceptable = new Set(options.acceptableStatuses ?? ["active"]);
  // Stage 1: enumerate item ids (cheap — single endpoint with scroll).
  const ids: string[] = [];
  for await (const id of items.iterateSellerItems(client, sellerId, {
    status: "active",
    limit: options.pageSize ?? 100,
  })) {
    ids.push(id);
  }
  // Stage 2: hydrate details in chunks (multiget auto-paralellizes).
  const concurrency = options.concurrency ?? 4;
  const CHUNK = 20;
  let idx = 0;
  const inflight: Promise<TItem[]>[] = [];
  while (idx < ids.length || inflight.length > 0) {
    while (inflight.length < concurrency && idx < ids.length) {
      const slice = ids.slice(idx, idx + CHUNK);
      idx += CHUNK;
      inflight.push(items.multigetItems(client, slice));
    }
    let batch: TItem[];
    try {
      batch = await inflight.shift()!;
    } catch (err) {
      // The front chunk rejected. The remaining in-flight promises are still
      // pending and would surface as unhandled rejections once this generator
      // unwinds — settle them all before rethrowing so the host never sees an
      // orphaned `unhandledRejection` (which crashes the Node process).
      await Promise.allSettled(inflight);
      throw err;
    }
    for (const item of batch) {
      if (item.status && !acceptable.has(item.status)) continue;
      const product = meliItemToFeedProduct(item);
      if (product) yield product;
    }
  }
}

/**
 * Buffered version: collect the entire seller catalog into one array.
 * Useful for one-shot exports / daily-cron sitemap-style feeds.
 */
export async function buildFeedSnapshot(
  client: MeliClient,
  sellerId: number,
  options: IterateFeedOptions = {},
): Promise<FeedProduct[]> {
  const products: FeedProduct[] = [];
  for await (const p of iterateFeed(client, sellerId, options)) {
    products.push(p);
  }
  return products;
}

/**
 * Build a single page of the feed (cursor-paginated). The cursor is just
 * the seller's `scroll_id` from MELI — the consumer treats it as opaque.
 */
export interface FeedPageOptions {
  /** Page size (default 50). MELI's hard cap on multiget paging is 50 to
   *  keep response payloads tight. */
  limit?: number;
  /** Cursor returned by the previous page. Omit for the first page. */
  cursor?: string;
  acceptableStatuses?: string[];
}

export async function buildFeedPage(
  client: MeliClient,
  sellerId: number,
  options: FeedPageOptions = {},
): Promise<FeedPage> {
  const limit = options.limit ?? 50;
  const acceptable = new Set(options.acceptableStatuses ?? ["active"]);
  const searchOpts: items.SearchSellerItemsOptions = {
    status: "active",
    limit,
  };
  if (options.cursor !== undefined) searchOpts.scrollId = options.cursor;
  const page = await items.searchSellerItems(client, sellerId, searchOpts);
  if (!page.results.length) {
    return {
      products: [],
      next_cursor: null,
      generated_at: new Date().toISOString(),
    };
  }
  const hydrated = await items.multigetItems(client, page.results);
  const products = hydrated
    .filter((it) => !it.status || acceptable.has(it.status))
    .map((it) => meliItemToFeedProduct(it))
    .filter((p): p is FeedProduct => p !== null);
  return {
    products,
    next_cursor: page.scroll_id ?? null,
    generated_at: new Date().toISOString(),
  };
}
