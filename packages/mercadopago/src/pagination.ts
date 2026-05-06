/**
 * Pagination helpers — automatic pagination over MP's paginated endpoints
 * via AsyncIterable. Replaces the manual offset/limit loop.
 *
 * # Why
 *
 * MP's paginated endpoints (search_payments, search_subscriptions,
 * list_account_movements, list_settlements, search_merchant_orders, etc.)
 * cap responses at 100 items per page. Iterating "all matching X" without
 * helpers means writing the offset+limit loop in every caller — annoying
 * + error-prone (off-by-one bugs are common).
 *
 * # Usage
 *
 * ```ts
 * import { paginate } from "@ar-agents/mercadopago";
 *
 * for await (const payment of paginate(
 *   (offset) => client.searchPayments({ offset, limit: 100, status: "approved" }),
 *   { extractItems: (page) => page.results ?? [], extractTotal: (page) => page.paging?.total ?? 0 },
 * )) {
 *   console.log(payment.id);
 * }
 * ```
 *
 * Or use the convenience wrappers below:
 *
 * ```ts
 * for await (const payment of paginatePayments(client, { status: "approved" })) {
 *   console.log(payment.id);
 * }
 *
 * // Materialize all (only when sure it fits in memory):
 * const allPayments = await collect(paginatePayments(client, { status: "approved" }));
 * ```
 *
 * # Performance
 *
 * - **Streaming**: items are yielded as each page arrives — your downstream
 *   work can start before all pages are fetched.
 * - **Bounded concurrency**: by default fetches one page at a time. Pass
 *   `concurrency: 4` to prefetch up to 4 pages ahead (faster, more bandwidth).
 * - **Total cap**: pass `maxItems: 1000` to bail out early.
 *
 * # Edge cases handled
 *
 * - Empty pages (returns no items, terminates).
 * - Pages where total < expected (terminates correctly).
 * - Mid-iteration cancellation (caller breaks the for-await — no further fetches).
 * - Paging.total === 0 (terminates immediately).
 */

import type { MercadoPagoClient } from "./client";
import type {
  AccountMovement,
  MerchantOrder,
  Payment,
  Preapproval,
  Settlement,
  SubscriptionPayment,
  SubscriptionPlan,
} from "./types";

export interface PaginateOptions<TPage, TItem> {
  /** Extract the items array from a page. */
  extractItems: (page: TPage) => TItem[];
  /**
   * Extract the total count from a page. Used to know when to stop.
   * If not available, the iterator terminates when an empty page arrives.
   */
  extractTotal?: (page: TPage) => number | undefined;
  /** Page size. Default 100 (MP's max for most endpoints). */
  pageSize?: number;
  /**
   * Stop after yielding `maxItems` total. Useful for "first N matching"
   * queries that would otherwise iterate the full result set.
   */
  maxItems?: number;
  /**
   * Number of pages to prefetch concurrently. Default 1 (no prefetch).
   * Higher = lower wall-clock time but more concurrent MP requests.
   */
  concurrency?: number;
}

/**
 * Generic paginator. Most callers use the typed convenience wrappers below.
 *
 * @param fetchPage Function that fetches page N given the offset.
 */
export async function* paginate<TPage, TItem>(
  fetchPage: (offset: number, limit: number) => Promise<TPage>,
  opts: PaginateOptions<TPage, TItem>,
): AsyncGenerator<TItem, void, undefined> {
  const pageSize = opts.pageSize ?? 100;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  let yielded = 0;
  let offset = 0;
  let knownTotal: number | undefined = undefined;

  while (true) {
    if (opts.maxItems !== undefined && yielded >= opts.maxItems) return;

    // Fetch next `concurrency` pages in parallel
    const inFlight: Promise<TPage>[] = [];
    for (let i = 0; i < concurrency; i++) {
      const pageOffset = offset + i * pageSize;
      if (knownTotal !== undefined && pageOffset >= knownTotal) break;
      inFlight.push(fetchPage(pageOffset, pageSize));
    }
    if (inFlight.length === 0) return;

    const pages = await Promise.all(inFlight);
    let allEmpty = true;
    for (const page of pages) {
      const items = opts.extractItems(page);
      const total = opts.extractTotal?.(page);
      if (total !== undefined) knownTotal = total;
      if (items.length > 0) allEmpty = false;
      for (const item of items) {
        if (opts.maxItems !== undefined && yielded >= opts.maxItems) return;
        yield item;
        yielded++;
      }
    }
    if (allEmpty) return; // signaled end (no items in any page)
    offset += pages.length * pageSize;
    if (knownTotal !== undefined && offset >= knownTotal) return;
  }
}

/** Materialize an AsyncIterable into an array. Caller's responsibility to ensure it fits. */
export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed convenience wrappers — one per MP paginated endpoint
// ─────────────────────────────────────────────────────────────────────────────

export function paginatePayments(
  client: MercadoPagoClient,
  filter: Parameters<MercadoPagoClient["searchPayments"]>[0] = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<Payment, void, undefined> {
  return paginate<{ results?: Payment[]; paging?: { total: number } }, Payment>(
    (offset, limit) =>
      client.searchPayments({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.results ?? [],
      extractTotal: (p) => p.paging?.total,
      ...opts,
    },
  );
}

export function paginateSubscriptions(
  client: MercadoPagoClient,
  filter: Parameters<MercadoPagoClient["searchPreapprovals"]>[0] = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<Preapproval, void, undefined> {
  return paginate<{ results: Preapproval[]; paging: { total: number } }, Preapproval>(
    (offset, limit) =>
      client.searchPreapprovals({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.results,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}

export function paginateAccountMovements(
  client: MercadoPagoClient,
  filter: { from?: string; to?: string } = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<AccountMovement, void, undefined> {
  return paginate<
    { movements: AccountMovement[]; paging: { total: number } },
    AccountMovement
  >(
    (offset, limit) =>
      client.listAccountMovements({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.movements,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}

export function paginateSettlements(
  client: MercadoPagoClient,
  filter: { from?: string; to?: string; status?: string } = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<Settlement, void, undefined> {
  return paginate<
    { settlements: Settlement[]; paging: { total: number } },
    Settlement
  >(
    (offset, limit) =>
      client.listSettlements({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.settlements,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}

export function paginateMerchantOrders(
  client: MercadoPagoClient,
  filter: Parameters<MercadoPagoClient["searchMerchantOrders"]>[0] = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<MerchantOrder, void, undefined> {
  return paginate<
    { elements: MerchantOrder[]; paging: { total: number } },
    MerchantOrder
  >(
    (offset, limit) =>
      client.searchMerchantOrders({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.elements,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}

export function paginateSubscriptionPlans(
  client: MercadoPagoClient,
  filter: { status?: string } = {},
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<SubscriptionPlan, void, undefined> {
  return paginate<
    { results: SubscriptionPlan[]; paging: { total: number } },
    SubscriptionPlan
  >(
    (offset, limit) =>
      client.listSubscriptionPlans({ ...filter, offset, limit }),
    {
      extractItems: (p) => p.results,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}

export function paginateSubscriptionPayments(
  client: MercadoPagoClient,
  preapprovalId: string,
  opts: { pageSize?: number; maxItems?: number; concurrency?: number } = {},
): AsyncGenerator<SubscriptionPayment, void, undefined> {
  return paginate<
    { results: SubscriptionPayment[]; paging: { total: number } },
    SubscriptionPayment
  >(
    (offset, limit) =>
      client.listSubscriptionPayments(preapprovalId, { offset, limit }),
    {
      extractItems: (p) => p.results,
      extractTotal: (p) => p.paging.total,
      ...opts,
    },
  );
}
