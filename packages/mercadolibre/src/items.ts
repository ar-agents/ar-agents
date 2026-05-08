// Items API — `/items`, `/items/{id}`, `/users/{id}/items/search`.
//
// Covers create / get / update / pause / close / relist / multiget /
// seller-items search with cursor (`scroll_id`) pagination.

import type { MeliClient } from "./client";
import {
  Item,
  ItemCreateRequest,
  ItemUpdateRequest,
  type Item as TItem,
  type ItemCreateRequest as TItemCreateRequest,
  type ItemUpdateRequest as TItemUpdateRequest,
} from "./schemas/item";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Get (single)
// ---------------------------------------------------------------------------

export interface GetItemOptions {
  /** Optionally project a subset of fields via the `attributes` param. */
  attributes?: string[];
  /** Include catalog data in the response. */
  includeCatalog?: boolean;
}

export async function getItem(
  client: MeliClient,
  itemId: string,
  options: GetItemOptions = {},
): Promise<TItem> {
  const query: Record<string, string> = {};
  if (options.attributes) query["attributes"] = options.attributes.join(",");
  if (options.includeCatalog) query["include_attributes"] = "all";
  return client.fetch<TItem>({
    method: "GET",
    path: `/items/${itemId}`,
    query,
    responseSchema: Item,
  });
}

// ---------------------------------------------------------------------------
// Multiget — `/items?ids=ML...,ML...` (max 20 per call)
// ---------------------------------------------------------------------------

const MultigetEntry = z.object({
  code: z.number().int(),
  body: Item,
});
const MultigetResponse = z.array(MultigetEntry);

export async function multigetItems(
  client: MeliClient,
  itemIds: string[],
): Promise<TItem[]> {
  if (itemIds.length === 0) return [];
  if (itemIds.length > 20) {
    throw new Error("MELI multiget supports up to 20 ids per call");
  }
  const response = await client.fetch<z.infer<typeof MultigetResponse>>({
    method: "GET",
    path: `/items`,
    query: { ids: itemIds.join(",") },
    responseSchema: MultigetResponse,
  });
  return response.filter((e) => e.code === 200).map((e) => e.body);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createItem(
  client: MeliClient,
  payload: TItemCreateRequest,
): Promise<TItem> {
  const validated = ItemCreateRequest.parse(payload);
  return client.fetch<TItem>({
    method: "POST",
    path: `/items`,
    body: validated,
    responseSchema: Item,
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateItem(
  client: MeliClient,
  itemId: string,
  payload: TItemUpdateRequest,
): Promise<TItem> {
  const validated = ItemUpdateRequest.parse(payload);
  return client.fetch<TItem>({
    method: "PUT",
    path: `/items/${itemId}`,
    body: validated,
    responseSchema: Item,
  });
}

export async function pauseItem(client: MeliClient, itemId: string): Promise<TItem> {
  return updateItem(client, itemId, { status: "paused" });
}

export async function closeItem(client: MeliClient, itemId: string): Promise<TItem> {
  return updateItem(client, itemId, { status: "closed" });
}

// ---------------------------------------------------------------------------
// Relist (re-activate a closed listing)
// ---------------------------------------------------------------------------

export async function relistItem(
  client: MeliClient,
  itemId: string,
  args: {
    listing_type_id?: TItem["listing_type_id"];
    quantity?: number;
    price?: number;
  } = {},
): Promise<TItem> {
  return client.fetch<TItem>({
    method: "POST",
    path: `/items/${itemId}/relist`,
    body: args,
    responseSchema: Item,
  });
}

// ---------------------------------------------------------------------------
// Seller-side items search with scroll_id pagination
// (the only way to iterate >1k items)
// ---------------------------------------------------------------------------

export const SellerItemsSearchResponse = z.object({
  paging: z.object({
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  }),
  results: z.array(z.string()), // item ids
  scroll_id: z.string().optional(),
});
export type SellerItemsSearchResponse = z.infer<typeof SellerItemsSearchResponse>;

export interface SearchSellerItemsOptions {
  /** Status filter. */
  status?: "active" | "paused" | "closed" | "all";
  /** ISO date filter — items updated after this. */
  updatedAfter?: string;
  /** Sort. */
  sort?: "last_updated_desc" | "last_updated_asc";
  /** Page size. Default 50. */
  limit?: number;
  /** Continuation token from the previous call. */
  scrollId?: string;
}

export async function searchSellerItems(
  client: MeliClient,
  sellerId: number,
  options: SearchSellerItemsOptions = {},
): Promise<SellerItemsSearchResponse> {
  const query: Record<string, string | number> = {
    search_type: "scan",
  };
  if (options.status && options.status !== "all") query["status"] = options.status;
  if (options.sort) query["sort"] = options.sort;
  if (options.limit) query["limit"] = options.limit;
  if (options.scrollId) query["scroll_id"] = options.scrollId;
  return client.fetch<SellerItemsSearchResponse>({
    method: "GET",
    path: `/users/${sellerId}/items/search`,
    query,
    responseSchema: SellerItemsSearchResponse,
  });
}

/**
 * Iterate ALL items for a seller, transparently paging via `scroll_id`.
 * Yields one item id at a time; the caller decides batching.
 */
export async function* iterateSellerItems(
  client: MeliClient,
  sellerId: number,
  options: Omit<SearchSellerItemsOptions, "scrollId"> = {},
): AsyncGenerator<string, void, void> {
  let scrollId: string | undefined;
  while (true) {
    const page = await searchSellerItems(client, sellerId, {
      ...options,
      ...(scrollId !== undefined ? { scrollId } : {}),
    });
    for (const id of page.results) yield id;
    if (!page.scroll_id || page.results.length === 0) return;
    scrollId = page.scroll_id;
  }
}

// ---------------------------------------------------------------------------
// Description (separate resource per spec)
// ---------------------------------------------------------------------------

export const ItemDescription = z.object({
  text: z.string().optional(),
  plain_text: z.string().optional(),
  last_updated: z.string().optional(),
});
export type ItemDescription = z.infer<typeof ItemDescription>;

export async function getItemDescription(
  client: MeliClient,
  itemId: string,
): Promise<ItemDescription> {
  return client.fetch<ItemDescription>({
    method: "GET",
    path: `/items/${itemId}/description`,
    responseSchema: ItemDescription,
  });
}

export async function updateItemDescription(
  client: MeliClient,
  itemId: string,
  description: { plain_text: string },
): Promise<ItemDescription> {
  return client.fetch<ItemDescription>({
    method: "PUT",
    path: `/items/${itemId}/description`,
    body: description,
    responseSchema: ItemDescription,
  });
}
