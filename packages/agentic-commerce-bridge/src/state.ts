// State adapter — pluggable storage for sessions, carts, orders, and
// idempotency records. The bridge is framework-agnostic; you supply a
// backing store.
//
// Ships an `InMemoryStateAdapter` for dev/tests and the contract for
// production adapters. The Vercel KV adapter lives at
// `@ar-agents/agentic-commerce-bridge/vercel-kv` and is loaded lazily.

import type { CheckoutSession } from "./schemas/checkout-session";
import type { Order } from "./schemas/order";
import type { Cart } from "./schemas/cart";
import type {
  IdempotencyOutcome,
  IdempotencyRecord,
  IdempotencyStore,
} from "./idempotency";
import { DEFAULT_IDEMPOTENCY_TTL_SECONDS } from "./idempotency";

/**
 * Storage interface that all adapters implement. Sessions/orders/carts have
 * unbounded retention by default; idempotency records have TTLs.
 */
export interface StateAdapter extends IdempotencyStore {
  // -------- Checkout sessions
  saveSession(session: CheckoutSession): Promise<void>;
  loadSession(id: string): Promise<CheckoutSession | null>;
  deleteSession(id: string): Promise<void>;

  // -------- Orders
  saveOrder(order: Order): Promise<void>;
  loadOrder(id: string): Promise<Order | null>;
  /** Look up an order by checkout_session_id (one-to-one). */
  loadOrderBySession(checkoutSessionId: string): Promise<Order | null>;

  // -------- Carts (optional ACP cart surface)
  saveCart(cart: Cart): Promise<void>;
  loadCart(id: string): Promise<Cart | null>;
  deleteCart(id: string): Promise<void>;
}

// --------------------------------------------------------------------------
// In-memory adapter — for dev, tests, and quickstart demos. Not durable.
// Not for production: data is lost on process exit and the idempotency
// records have no atomicity across multiple processes.
// --------------------------------------------------------------------------

export class InMemoryStateAdapter implements StateAdapter {
  private sessions = new Map<string, CheckoutSession>();
  private orders = new Map<string, Order>();
  private ordersBySession = new Map<string, string>(); // session_id -> order_id
  private carts = new Map<string, Cart>();
  private idempotency = new Map<string, IdempotencyRecord>();

  // -------- Sessions

  async saveSession(session: CheckoutSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async loadSession(id: string): Promise<CheckoutSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  // -------- Orders

  async saveOrder(order: Order): Promise<void> {
    this.orders.set(order.id, order);
    this.ordersBySession.set(order.checkout_session_id, order.id);
  }

  async loadOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async loadOrderBySession(
    checkoutSessionId: string,
  ): Promise<Order | null> {
    const orderId = this.ordersBySession.get(checkoutSessionId);
    if (!orderId) return null;
    return this.orders.get(orderId) ?? null;
  }

  // -------- Carts

  async saveCart(cart: Cart): Promise<void> {
    this.carts.set(cart.id, cart);
  }

  async loadCart(id: string): Promise<Cart | null> {
    return this.carts.get(id) ?? null;
  }

  async deleteCart(id: string): Promise<void> {
    this.carts.delete(id);
  }

  // -------- Idempotency

  async tryClaim(
    scope: string,
    key: string,
    bodyHash: string,
    options?: { ttlSeconds?: number; retryAfterSeconds?: number },
  ): Promise<IdempotencyOutcome> {
    const id = `${scope}::${key}`;
    const ttl = options?.ttlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS;
    const retryAfter = options?.retryAfterSeconds ?? 5;
    const now = Math.floor(Date.now() / 1000);

    const existing = this.idempotency.get(id);

    // Expire stale records.
    if (existing && now - existing.createdAt > ttl) {
      this.idempotency.delete(id);
    }

    const current = this.idempotency.get(id);
    if (!current) {
      this.idempotency.set(id, {
        scope,
        key,
        bodyHash,
        state: "in_flight",
        createdAt: now,
      });
      return { kind: "claimed" };
    }

    // Same scope+key already exists. Check body hash.
    if (current.bodyHash !== bodyHash) {
      return { kind: "conflict" };
    }

    if (current.state === "in_flight") {
      return { kind: "in_flight", retryAfterSeconds: retryAfter };
    }

    // state === "complete"
    if (current.response) {
      return {
        kind: "replay",
        status: current.response.status,
        body: current.response.body,
        ...(current.response.headers !== undefined
          ? { headers: current.response.headers }
          : {}),
      };
    }

    // Defensive: complete record without response payload — treat as
    // claim so the operation re-runs.
    this.idempotency.set(id, {
      scope,
      key,
      bodyHash,
      state: "in_flight",
      createdAt: now,
    });
    return { kind: "claimed" };
  }

  async complete(
    scope: string,
    key: string,
    response: NonNullable<IdempotencyRecord["response"]>,
  ): Promise<void> {
    const id = `${scope}::${key}`;
    const existing = this.idempotency.get(id);
    if (!existing) {
      // No claim was made — caller bypassed `tryClaim`. Still record so a
      // retry of the same key sees the cached result.
      this.idempotency.set(id, {
        scope,
        key,
        bodyHash: "",
        state: "complete",
        createdAt: Math.floor(Date.now() / 1000),
        completedAt: Math.floor(Date.now() / 1000),
        response,
      });
      return;
    }
    this.idempotency.set(id, {
      ...existing,
      state: "complete",
      completedAt: Math.floor(Date.now() / 1000),
      response,
    });
  }

  async release(scope: string, key: string): Promise<void> {
    this.idempotency.delete(`${scope}::${key}`);
  }
}
