// MercadoLibre integrations.
//
// Two pieces:
//   1. `createMeliCatalogProvider` — turn an MELI seller's catalog into a
//      `CatalogProvider` for the bridge. Duck-typed: takes a `getItem`
//      function the host wires against the MELI REST API or an existing
//      MELI client.
//   2. `buildMeliFeed` / `buildMeliFeedBatch` — generate UCP/ACP-compatible
//      product feeds from MELI items so agents can discover them.
//
// MELI item IDs follow the pattern `MLA<digits>` (Argentina), `MLB<digits>`
// (Brazil), `MLM<digits>` (Mexico), etc. The `currency_id` field is uppercase
// (`ARS`, `BRL`); we lowercase it for ACP.

import type { CatalogProvider, ResolvedItem } from "../handlers/types";
import type { Currency } from "../schemas/common";

/** Minimal duck-typed shape of an MELI `/items/{id}` response. */
export interface MeliItem {
  id: string;
  title: string;
  /** Major units as a number (MELI returns floats). */
  price: number;
  /** Uppercase ISO 4217. */
  currency_id: string;
  available_quantity?: number;
  sold_quantity?: number;
  status?: string; // "active" | "paused" | "closed" | "under_review"
  pictures?: Array<{ id?: string; url?: string; secure_url?: string }>;
  thumbnail?: string;
  permalink?: string;
  category_id?: string;
  seller_id?: string | number;
  seller_address?: { city?: { name?: string }; state?: { name?: string } };
  attributes?: Array<{
    id: string;
    name: string;
    value_name?: string | null;
    value_id?: string | null;
    values?: Array<{ id?: string; name?: string }>;
  }>;
  shipping?: {
    mode?: string;
    free_shipping?: boolean;
    logistic_type?: string;
    dimensions?: string;
  };
  variations?: Array<{ id: string; price?: number; available_quantity?: number }>;
  // Other fields ignored.
  [k: string]: unknown;
}

export interface MeliCatalogProviderOptions {
  /**
   * Look up an MELI item by ID. Implementations:
   *   - With `@ar-agents/mercadolibre`: `(id) => mlClient.items.get(id)`
   *   - With raw fetch: `(id) => fetch(\`https://api.mercadolibre.com/items/\${id}\`).then(r => r.json())`
   */
  getItem: (id: string) => Promise<MeliItem | null>;

  /**
   * Currency the merchant is selling in. ACP requires currency consistency
   * across line items. If MELI returns a different currency_id, the
   * `resolveItem` returns `null` (caller will surface as "item not found").
   *
   * If unset, the provider accepts whatever MELI returns (no filter).
   */
  acceptedCurrencies?: Currency[];

  /**
   * MELI prices are floats in major units. Convert to ACP minor-units
   * integers. Default: multiply by `divisorFor(currency)` and round.
   */
  majorToMinor?: (amountMajor: number, currencyLower: string) => number;

  /**
   * Optional pause filter — only return items whose status is in this set.
   * Default: `["active"]`.
   */
  acceptableStatuses?: string[];
}

const TRUE_ZERO_DECIMAL = new Set([
  "clp",
  "pyg",
  "jpy",
  "krw",
  "vnd",
  "ugx",
  "rwf",
  "isk",
  "huf",
]);

function defaultDivisor(currencyLower: string): number {
  return TRUE_ZERO_DECIMAL.has(currencyLower) ? 1 : 100;
}

function defaultMajorToMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * defaultDivisor(currency));
}

/**
 * Build a MELI-backed `CatalogProvider`. The bridge calls `resolveItem(id)`
 * on every `line_item.id` during checkout-session creation/update.
 */
export function createMeliCatalogProvider(
  options: MeliCatalogProviderOptions,
): CatalogProvider {
  const majorToMinor = options.majorToMinor ?? defaultMajorToMinor;
  const acceptableStatuses = options.acceptableStatuses ?? ["active"];

  return {
    async resolveItem(id: string): Promise<ResolvedItem | null> {
      const item = await options.getItem(id);
      if (!item) return null;
      if (item.status && !acceptableStatuses.includes(item.status)) {
        return null;
      }
      const currency = item.currency_id.toLowerCase() as Currency;
      if (
        options.acceptedCurrencies &&
        !options.acceptedCurrencies.includes(currency)
      ) {
        return null;
      }
      const unitMinor = majorToMinor(item.price, currency);
      const images = (item.pictures ?? [])
        .map((p) => p.secure_url ?? p.url)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      const sellerName = pickSellerName(item);
      const resolved: ResolvedItem = {
        id: item.id,
        name: item.title,
        unit_amount: unitMinor,
        currency,
      };
      if (item.available_quantity !== undefined) {
        resolved.available_quantity = item.available_quantity;
      }
      if (images.length > 0) {
        resolved.images = images;
      }
      if (item.category_id !== undefined) {
        resolved.category = item.category_id;
      }
      if (sellerName !== undefined) {
        resolved.seller_name = sellerName;
      }
      return resolved;
    },
  };
}

function pickSellerName(item: MeliItem): string | undefined {
  if (typeof item["seller_address"] === "object" && item["seller_address"]) {
    const sa = item["seller_address"] as {
      city?: { name?: string };
      state?: { name?: string };
    };
    return sa.city?.name ?? sa.state?.name;
  }
  return undefined;
}

// ===========================================================================
// FEED BUILDER
// ===========================================================================

/**
 * UCP/ACP-compatible feed entry. The shape follows the ACP feed API
 * (`openapi.feed.yaml` 2026-04-17) with extras for richer agent UX.
 */
export interface FeedProduct {
  id: string;
  title: string;
  description?: string;
  /** Uppercase ISO 4217 — the ACP feed surface uses uppercase. */
  currency: string;
  /** Major units, ACP feed convention. */
  price: number;
  available_quantity?: number;
  permalink_url?: string;
  category?: string;
  brand?: string;
  images?: string[];
  attributes?: Record<string, string>;
  seller?: { id?: string; name?: string };
  shipping?: {
    free?: boolean;
    mode?: string;
    logistic_type?: string;
  };
}

export interface BuildMeliFeedOptions {
  /** When true, drop paused / closed / under-review items. Default true. */
  filterActiveOnly?: boolean;
}

/**
 * Convert a MELI item to a feed entry. Pure-data; no I/O.
 */
export function meliItemToFeedProduct(
  item: MeliItem,
  options: BuildMeliFeedOptions = {},
): FeedProduct | null {
  const filterActive = options.filterActiveOnly ?? true;
  if (filterActive && item.status && item.status !== "active") return null;

  const images = (item.pictures ?? [])
    .map((p) => p.secure_url ?? p.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const attributes: Record<string, string> = {};
  if (item.attributes) {
    for (const a of item.attributes) {
      if (a.value_name && a.id) {
        attributes[a.name ?? a.id] = a.value_name;
      }
    }
  }

  const product: FeedProduct = {
    id: item.id,
    title: item.title,
    currency: item.currency_id.toUpperCase(),
    price: item.price,
  };
  if (item.available_quantity !== undefined) {
    product.available_quantity = item.available_quantity;
  }
  if (item.permalink !== undefined) product.permalink_url = item.permalink;
  if (item.category_id !== undefined) product.category = item.category_id;
  if (images.length > 0) product.images = images;
  if (Object.keys(attributes).length > 0) product.attributes = attributes;
  if (item.seller_id !== undefined) {
    const sellerName = pickSellerName(item);
    product.seller = {
      id: String(item.seller_id),
      ...(sellerName !== undefined ? { name: sellerName } : {}),
    };
  }
  if (item.shipping) {
    const shipping: NonNullable<FeedProduct["shipping"]> = {};
    if (item.shipping.free_shipping !== undefined) {
      shipping.free = item.shipping.free_shipping;
    }
    if (item.shipping.mode !== undefined) shipping.mode = item.shipping.mode;
    if (item.shipping.logistic_type !== undefined) {
      shipping.logistic_type = item.shipping.logistic_type;
    }
    if (Object.keys(shipping).length > 0) product.shipping = shipping;
  }
  return product;
}

/**
 * Build a feed payload for a single page of MELI items. Returns the
 * `{ products, count }` shape suitable for emission as a feed file or feed
 * API response.
 */
export function buildMeliFeedBatch(
  items: MeliItem[],
  options: BuildMeliFeedOptions = {},
): { products: FeedProduct[]; count: number } {
  const products: FeedProduct[] = [];
  for (const item of items) {
    const fp = meliItemToFeedProduct(item, options);
    if (fp) products.push(fp);
  }
  return { products, count: products.length };
}

/**
 * Stream a feed: takes an async iterable of MELI items and yields
 * `FeedProduct` entries. Use with the merchant's pagination helper to build
 * a streaming feed for large catalogs.
 */
export async function* buildMeliFeed(
  source: AsyncIterable<MeliItem>,
  options: BuildMeliFeedOptions = {},
): AsyncGenerator<FeedProduct, void, void> {
  for await (const item of source) {
    const fp = meliItemToFeedProduct(item, options);
    if (fp) yield fp;
  }
}
