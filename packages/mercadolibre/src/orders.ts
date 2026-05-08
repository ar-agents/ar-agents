// Orders + Packs — `/orders/search`, `/orders/{id}`,
// `/marketplace/orders/pack/{pack_id}`, `/orders/{id}/billing_info`.

import type { MeliClient } from "./client";
import {
  Order,
  OrdersSearchResponse,
  Pack,
  type Order as TOrder,
  type OrdersSearchResponse as TOrdersSearchResponse,
  type Pack as TPack,
} from "./schemas/order";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Search — `/orders/search?seller=...`
// ---------------------------------------------------------------------------

export interface SearchOrdersOptions {
  /** Filter by order status. */
  status?:
    | "paid"
    | "confirmed"
    | "payment_in_process"
    | "cancelled"
    | "invalid";
  /** Date filter: ISO 8601. */
  dateCreatedFrom?: string;
  dateCreatedTo?: string;
  dateLastUpdatedFrom?: string;
  /** Sort. Default `date_desc`. */
  sort?: "date_desc" | "date_asc";
  limit?: number;
  offset?: number;
  /** Tag filter (e.g. `paid`, `not_delivered`). */
  tags?: string[];
}

export async function searchOrders(
  client: MeliClient,
  sellerId: number,
  options: SearchOrdersOptions = {},
): Promise<TOrdersSearchResponse> {
  const query: Record<string, string | number> = {
    seller: sellerId,
  };
  if (options.status) query["order.status"] = options.status;
  if (options.dateCreatedFrom) query["order.date_created.from"] = options.dateCreatedFrom;
  if (options.dateCreatedTo) query["order.date_created.to"] = options.dateCreatedTo;
  if (options.dateLastUpdatedFrom) {
    query["order.date_last_updated.from"] = options.dateLastUpdatedFrom;
  }
  if (options.sort) query["sort"] = options.sort;
  if (options.limit) query["limit"] = options.limit;
  if (options.offset) query["offset"] = options.offset;
  if (options.tags && options.tags.length) query["tags"] = options.tags.join(",");
  return client.fetch<TOrdersSearchResponse>({
    method: "GET",
    path: `/orders/search`,
    query,
    responseSchema: OrdersSearchResponse,
  });
}

export async function getOrder(
  client: MeliClient,
  orderId: number,
): Promise<TOrder> {
  return client.fetch<TOrder>({
    method: "GET",
    path: `/orders/${orderId}`,
    responseSchema: Order,
  });
}

// ---------------------------------------------------------------------------
// Billing info — `/orders/{id}/billing_info`
// Returns the buyer's tax data (CUIT/CFDI) needed for invoice emission.
// ---------------------------------------------------------------------------

export const OrderBillingInfo = z.object({
  buyer: z.object({
    billing_info: z
      .object({
        doc_type: z.string().nullable().optional(),
        doc_number: z.string().nullable().optional(),
      })
      .optional(),
  }),
});
export type OrderBillingInfo = z.infer<typeof OrderBillingInfo>;

export async function getOrderBillingInfo(
  client: MeliClient,
  orderId: number,
): Promise<OrderBillingInfo> {
  return client.fetch<OrderBillingInfo>({
    method: "GET",
    path: `/orders/${orderId}/billing_info`,
    responseSchema: OrderBillingInfo,
  });
}

// ---------------------------------------------------------------------------
// Packs — `/marketplace/orders/pack/{pack_id}`
//
// 30%+ of MELI sales go through carts (one buyer → multiple orders sharing
// a single shipment). Naive `/orders/search` iterators miss the
// pack-level coordination. Use `getPack(packId)` to load all orders in a
// cart together.
// ---------------------------------------------------------------------------

export async function getPack(
  client: MeliClient,
  packId: number,
): Promise<TPack> {
  return client.fetch<TPack>({
    method: "GET",
    path: `/marketplace/orders/pack/${packId}`,
    responseSchema: Pack,
  });
}

/**
 * Given an array of orders, group cart-orders by `pack_id` and return
 * (single-order, packs) so callers can iterate without double-counting.
 */
export function partitionByPack(
  orders: TOrder[],
): {
  singleOrders: TOrder[];
  packs: Map<number, TOrder[]>;
} {
  const singleOrders: TOrder[] = [];
  const packs = new Map<number, TOrder[]>();
  for (const order of orders) {
    if (order.pack_id) {
      const existing = packs.get(order.pack_id) ?? [];
      existing.push(order);
      packs.set(order.pack_id, existing);
    } else {
      singleOrders.push(order);
    }
  }
  return { singleOrders, packs };
}
