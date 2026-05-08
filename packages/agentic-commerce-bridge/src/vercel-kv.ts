// Vercel KV (Upstash Redis) state adapter — subpath export.
//
// Loaded only when the consumer imports
// `@ar-agents/agentic-commerce-bridge/vercel-kv`. This isolates the
// `@vercel/kv` peer dep so the core bundle stays Edge-runtime-light.
//
// Duck-typed: accepts any Redis-style client with `get` / `set` / `del` /
// `expire`. Tested against `@vercel/kv` and Upstash Redis directly. If the
// host already wraps Redis with Upstash @upstash/redis, that works too.

import type { CheckoutSession } from "./schemas/checkout-session";
import type { Order } from "./schemas/order";
import type { Cart } from "./schemas/cart";
import type {
  IdempotencyOutcome,
  IdempotencyRecord,
} from "./idempotency";
import { DEFAULT_IDEMPOTENCY_TTL_SECONDS } from "./idempotency";
import type { StateAdapter } from "./state";

/**
 * Minimal duck-typed shape we depend on. `@vercel/kv`, `@upstash/redis`, and
 * raw `ioredis` all expose superset variants of these.
 */
export interface RedisLikeClient {
  /** Returns the deserialized value or `null`. Vercel KV auto-parses JSON. */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Sets a key. `ex` = TTL in seconds, `nx` = only-if-not-exists. */
  set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown>;
  /** Deletes a key. */
  del(key: string): Promise<number | unknown>;
}

export interface VercelKVStateAdapterOptions {
  /** Keyspace prefix for all bridge data. Default `"acp:"`. */
  prefix?: string;
  /**
   * Idempotency TTL in seconds. Default 24h. Set lower if your KV plan has
   * eviction pressure.
   */
  idempotencyTtlSeconds?: number;
  /**
   * Session TTL. Default: undefined (no expiry). Set if you want sessions
   * to garbage-collect after some time.
   */
  sessionTtlSeconds?: number;
}

const DEFAULT_PREFIX = "acp:";

export class VercelKVStateAdapter implements StateAdapter {
  private readonly prefix: string;
  private readonly idempotencyTtl: number;
  private readonly sessionTtl: number | undefined;

  constructor(
    private readonly kv: RedisLikeClient,
    options: VercelKVStateAdapterOptions = {},
  ) {
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.idempotencyTtl =
      options.idempotencyTtlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS;
    this.sessionTtl = options.sessionTtlSeconds;
  }

  // -------- Sessions
  async saveSession(session: CheckoutSession): Promise<void> {
    const opts = this.sessionTtl ? { ex: this.sessionTtl } : undefined;
    await this.kv.set(this.sessionKey(session.id), session, opts);
  }
  async loadSession(id: string): Promise<CheckoutSession | null> {
    return (await this.kv.get<CheckoutSession>(this.sessionKey(id))) ?? null;
  }
  async deleteSession(id: string): Promise<void> {
    await this.kv.del(this.sessionKey(id));
  }

  // -------- Orders
  async saveOrder(order: Order): Promise<void> {
    await this.kv.set(this.orderKey(order.id), order);
    await this.kv.set(this.orderBySessionKey(order.checkout_session_id), order.id);
  }
  async loadOrder(id: string): Promise<Order | null> {
    return (await this.kv.get<Order>(this.orderKey(id))) ?? null;
  }
  async loadOrderBySession(sessionId: string): Promise<Order | null> {
    const id = await this.kv.get<string>(this.orderBySessionKey(sessionId));
    if (!id) return null;
    return this.loadOrder(id);
  }

  // -------- Carts
  async saveCart(cart: Cart): Promise<void> {
    await this.kv.set(this.cartKey(cart.id), cart);
  }
  async loadCart(id: string): Promise<Cart | null> {
    return (await this.kv.get<Cart>(this.cartKey(id))) ?? null;
  }
  async deleteCart(id: string): Promise<void> {
    await this.kv.del(this.cartKey(id));
  }

  // -------- Idempotency
  async tryClaim(
    scope: string,
    key: string,
    bodyHash: string,
    options?: { ttlSeconds?: number; retryAfterSeconds?: number },
  ): Promise<IdempotencyOutcome> {
    const k = this.idempotencyKey(scope, key);
    const ttl = options?.ttlSeconds ?? this.idempotencyTtl;
    const retryAfter = options?.retryAfterSeconds ?? 5;
    const now = Math.floor(Date.now() / 1000);

    const existing = await this.kv.get<IdempotencyRecord>(k);

    if (!existing) {
      // Atomic claim via SET NX. If a concurrent caller wins, our SET is a no-op.
      const record: IdempotencyRecord = {
        scope,
        key,
        bodyHash,
        state: "in_flight",
        createdAt: now,
      };
      const setResult = await this.kv.set(k, record, { ex: ttl, nx: true });
      // Vercel KV returns "OK" when SET succeeded with NX. If it returned null,
      // a concurrent caller beat us — re-read.
      if (setResult === null || setResult === undefined) {
        const winning = await this.kv.get<IdempotencyRecord>(k);
        if (!winning) {
          // Defensive: claim slot ourselves if the racing record vanished.
          await this.kv.set(k, record, { ex: ttl });
          return { kind: "claimed" };
        }
        return raceLost(winning, bodyHash, retryAfter);
      }
      return { kind: "claimed" };
    }

    return raceLost(existing, bodyHash, retryAfter);
  }

  async complete(
    scope: string,
    key: string,
    response: NonNullable<IdempotencyRecord["response"]>,
  ): Promise<void> {
    const k = this.idempotencyKey(scope, key);
    const existing = await this.kv.get<IdempotencyRecord>(k);
    const now = Math.floor(Date.now() / 1000);
    const updated: IdempotencyRecord = {
      ...(existing ?? {
        scope,
        key,
        bodyHash: "",
        state: "in_flight",
        createdAt: now,
      }),
      state: "complete",
      completedAt: now,
      response,
    };
    await this.kv.set(k, updated, { ex: this.idempotencyTtl });
  }

  async release(scope: string, key: string): Promise<void> {
    await this.kv.del(this.idempotencyKey(scope, key));
  }

  // -------- Key helpers
  private sessionKey(id: string): string {
    return `${this.prefix}session:${id}`;
  }
  private orderKey(id: string): string {
    return `${this.prefix}order:${id}`;
  }
  private orderBySessionKey(sessionId: string): string {
    return `${this.prefix}order_by_session:${sessionId}`;
  }
  private cartKey(id: string): string {
    return `${this.prefix}cart:${id}`;
  }
  private idempotencyKey(scope: string, key: string): string {
    return `${this.prefix}idem:${scope}:${key}`;
  }
}

function raceLost(
  existing: IdempotencyRecord,
  bodyHash: string,
  retryAfter: number,
): IdempotencyOutcome {
  if (existing.bodyHash !== bodyHash && existing.bodyHash !== "") {
    return { kind: "conflict" };
  }
  if (existing.state === "in_flight") {
    return { kind: "in_flight", retryAfterSeconds: retryAfter };
  }
  if (existing.response) {
    return {
      kind: "replay",
      status: existing.response.status,
      body: existing.response.body,
      ...(existing.response.headers !== undefined
        ? { headers: existing.response.headers }
        : {}),
    };
  }
  // Defensive: complete record without response — let caller re-execute.
  return { kind: "claimed" };
}
