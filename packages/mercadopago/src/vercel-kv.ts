/**
 * Vercel KV adapters — drop-in `SubscriptionStateAdapter`,
 * `OAuthTokenStore`, and `IdempotencyCache` implementations backed by
 * [Vercel KV](https://vercel.com/docs/storage/vercel-kv) (Upstash Redis).
 *
 * # Why a separate subpath?
 *
 * `@vercel/kv` is a peer dependency — only consumers who actually use Vercel
 * KV install it. Importing from `@ar-agents/mercadopago/vercel-kv` is
 * lazy: the main `@ar-agents/mercadopago` bundle stays tiny for callers who
 * use the in-memory adapters or a different store.
 *
 * # Setup
 *
 * 1. Create a KV store at https://vercel.com/dashboard/stores
 * 2. Connect it to your project — Vercel auto-injects `KV_*` env vars
 * 3. `pnpm add @vercel/kv`
 * 4. Wire the adapters:
 *
 *    ```ts
 *    import { mercadoPagoTools, MercadoPagoClient } from "@ar-agents/mercadopago";
 *    import {
 *      VercelKVSubscriptionStateAdapter,
 *      VercelKVOAuthTokenStore,
 *    } from "@ar-agents/mercadopago/vercel-kv";
 *
 *    const tools = mercadoPagoTools(client, {
 *      state: new VercelKVSubscriptionStateAdapter(),
 *      backUrl: "https://mysite.com/done",
 *      // ... oauth, webhookSecret, etc.
 *    });
 *
 *    // For marketplace flows, also wire the OAuth token store:
 *    const oauthStore = new VercelKVOAuthTokenStore();
 *    await oauthStore.set(token.user_id, {
 *      user_id: token.user_id,
 *      access_token: token.access_token,
 *      refresh_token: token.refresh_token!,
 *      expires_at: Date.now() + (token.expires_in ?? 21600) * 1000,
 *    });
 *    ```
 *
 * # Edge Runtime
 *
 * `@vercel/kv` works in Vercel Edge Runtime, Node.js, and any environment
 * with `fetch` (it's a thin REST client over Upstash). All adapters here
 * are async and Edge-safe.
 *
 * # Key namespacing
 *
 * Each adapter uses its own prefix so multiple adapters can share the same
 * KV store without collisions:
 * - Subscriptions: `mp:sub:{id}`
 * - OAuth tokens:  `mp:oauth:{userId}`
 * - Idempotency:   `mp:idem:{key}`
 *
 * Pass a custom prefix via the constructor if you need to share the store
 * with other apps.
 */

import { kv as defaultKv } from "@vercel/kv";
import type { VercelKV } from "@vercel/kv";
import type { AuditEntry, AuditLogAdapter, AuditOperation } from "./audit";
import type {
  IdempotencyCache,
  OAuthTokenRecord,
  OAuthTokenStore,
  SubscriptionStateAdapter,
  SubscriptionStateRecord,
} from "./state";

const DEFAULT_SUBSCRIPTION_PREFIX = "mp:sub:";
const DEFAULT_OAUTH_PREFIX = "mp:oauth:";
const DEFAULT_IDEMPOTENCY_PREFIX = "mp:idem:";
const DEFAULT_AUDIT_PREFIX = "mp:audit:";

interface VercelKVAdapterOptions {
  /**
   * Custom KV client. If omitted, uses the default `kv` export from
   * `@vercel/kv` (which reads `KV_REST_API_URL` + `KV_REST_API_TOKEN` from
   * env — auto-injected when you connect a KV store to your Vercel project).
   */
  kv?: VercelKV;
  /** Override the key prefix. */
  prefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionStateAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class VercelKVSubscriptionStateAdapter
  implements SubscriptionStateAdapter
{
  private readonly kv: VercelKV;
  private readonly prefix: string;
  private readonly indexKey: string;

  constructor(options: VercelKVAdapterOptions = {}) {
    this.kv = options.kv ?? defaultKv;
    this.prefix = options.prefix ?? DEFAULT_SUBSCRIPTION_PREFIX;
    this.indexKey = `${this.prefix}__index`;
  }

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }

  async set(
    id: string,
    state: Partial<SubscriptionStateRecord>,
  ): Promise<void> {
    const existing = (await this.kv.get<SubscriptionStateRecord>(this.key(id))) ?? {};
    await this.kv.set(this.key(id), { ...existing, ...state });
    await this.kv.sadd(this.indexKey, id);
  }

  async get(id: string): Promise<SubscriptionStateRecord | null> {
    return (await this.kv.get<SubscriptionStateRecord>(this.key(id))) ?? null;
  }

  async list(): Promise<string[]> {
    const ids = await this.kv.smembers(this.indexKey);
    return ids.map(String);
  }

  /** Forget a subscription record. NOT part of the adapter interface. */
  async delete(id: string): Promise<void> {
    await this.kv.del(this.key(id));
    await this.kv.srem(this.indexKey, id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuthTokenStore (per-seller marketplace token persistence)
// ─────────────────────────────────────────────────────────────────────────────

export class VercelKVOAuthTokenStore implements OAuthTokenStore {
  private readonly kv: VercelKV;
  private readonly prefix: string;
  private readonly indexKey: string;

  constructor(options: VercelKVAdapterOptions = {}) {
    this.kv = options.kv ?? defaultKv;
    this.prefix = options.prefix ?? DEFAULT_OAUTH_PREFIX;
    this.indexKey = `${this.prefix}__index`;
  }

  private key(userId: string): string {
    return `${this.prefix}${userId}`;
  }

  async set(userId: string, token: OAuthTokenRecord): Promise<void> {
    await this.kv.set(this.key(userId), token);
    await this.kv.sadd(this.indexKey, userId);
  }

  async get(userId: string): Promise<OAuthTokenRecord | null> {
    return (await this.kv.get<OAuthTokenRecord>(this.key(userId))) ?? null;
  }

  async delete(userId: string): Promise<void> {
    await this.kv.del(this.key(userId));
    await this.kv.srem(this.indexKey, userId);
  }

  async list(): Promise<string[]> {
    const ids = await this.kv.smembers(this.indexKey);
    return ids.map(String);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Distributed Token Bucket Rate Limiter (KV-backed)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RATELIMIT_PREFIX = "mp:rl:";

/**
 * Distributed token bucket rate limiter backed by Vercel KV.
 *
 * # Why distributed
 *
 * The default in-memory `TokenBucketRateLimiter` is per-process. In
 * serverless (Vercel Functions, Lambda, Cloudflare Workers), each cold
 * start gets its own bucket — meaning N concurrent instances effectively
 * have N×capacity. For multi-region deployments or marketplace setups
 * with shared MP rate budget, that's a footgun.
 *
 * This adapter uses a single Vercel KV (Upstash Redis) bucket per `key`,
 * shared across all instances. Two instances acquiring at the same time
 * decrement the same counter atomically — the rate limit holds globally.
 *
 * # Algorithm
 *
 * Standard token bucket with lazy refill: every `acquire()` call:
 * 1. Reads `{ tokens, lastRefill }` from KV
 * 2. Computes refill since `lastRefill`
 * 3. If tokens >= 1: decrements and writes back
 * 4. Otherwise: computes wait time, sleeps, retries
 *
 * The read-modify-write isn't atomic per-call, so under heavy contention
 * a small over-spend window is possible (worst case: ~N concurrent
 * acquires can succeed when only 1 token was available). Acceptable for
 * MP rate limiting — the "actual" budget is much higher than what we
 * provision.
 *
 * # Usage
 *
 * ```ts
 * import { MercadoPagoClient } from "@ar-agents/mercadopago";
 * import { VercelKVRateLimiter } from "@ar-agents/mercadopago/vercel-kv";
 *
 * // ONE rate limit shared across all serverless instances of this app:
 * const limiter = new VercelKVRateLimiter({
 *   key: "mp-account-prod",
 *   capacity: 50,
 *   refillPerSecond: 25,
 * });
 *
 * const client = new MercadoPagoClient({
 *   accessToken: process.env.MP_ACCESS_TOKEN!,
 *   rateLimiter: limiter,  // (See client.ts — wired the same as in-memory)
 * });
 * ```
 *
 * # Marketplace setups (per-seller rate limit)
 *
 * Use the seller's MP user_id as part of the `key`:
 *
 * ```ts
 * function makeLimiter(sellerUserId: string) {
 *   return new VercelKVRateLimiter({
 *     key: `mp-seller-${sellerUserId}`,
 *     capacity: 10,
 *     refillPerSecond: 5,
 *   });
 * }
 * ```
 *
 * Each seller now has their own globally-distributed bucket.
 */
export interface VercelKVRateLimiterOptions extends VercelKVAdapterOptions {
  /**
   * Unique key for this bucket. Use distinct keys per logical "rate-limit
   * scope" (per-environment, per-seller, per-region, etc.). Required.
   */
  key: string;
  /** Bucket capacity (max burst). Default 50. */
  capacity?: number;
  /** Refill rate in tokens per second. Default 25. */
  refillPerSecond?: number;
  /**
   * Hard cap on how long `acquire()` will wait. If the bucket can't
   * refill in this time, `acquire()` throws. Default 30s.
   */
  acquireTimeoutMs?: number;
  /**
   * If true, `learnFromHeaders` syncs the bucket with MP's stated
   * `x-rate-limit-remaining`. Default true.
   */
  adaptive?: boolean;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export class VercelKVRateLimiter {
  private readonly kv: VercelKV;
  private readonly prefix: string;
  private readonly key: string;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly acquireTimeoutMs: number;
  private readonly adaptive: boolean;

  constructor(options: VercelKVRateLimiterOptions) {
    if (!options.key) {
      throw new Error(
        "VercelKVRateLimiter requires a `key` (use distinct keys per rate-limit scope, e.g., per-environment or per-seller).",
      );
    }
    this.kv = options.kv ?? defaultKv;
    this.prefix = options.prefix ?? DEFAULT_RATELIMIT_PREFIX;
    this.key = options.key;
    this.capacity = options.capacity ?? 50;
    this.refillPerSecond = options.refillPerSecond ?? 25;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 30_000;
    this.adaptive = options.adaptive ?? true;
  }

  private fullKey(): string {
    return `${this.prefix}${this.key}`;
  }

  private async readState(): Promise<BucketState> {
    const stored = await this.kv.get<BucketState>(this.fullKey());
    if (stored && typeof stored.tokens === "number" && typeof stored.lastRefillMs === "number") {
      return stored;
    }
    return { tokens: this.capacity, lastRefillMs: Date.now() };
  }

  private refill(state: BucketState, nowMs: number): BucketState {
    const elapsedMs = Math.max(0, nowMs - state.lastRefillMs);
    const refilled = Math.min(
      this.capacity,
      state.tokens + (elapsedMs / 1000) * this.refillPerSecond,
    );
    return { tokens: refilled, lastRefillMs: nowMs };
  }

  private async writeState(state: BucketState): Promise<void> {
    // TTL = 1h. Long-idle buckets get garbage-collected, capacity rebuilds
    // from initial state on next acquire (which is fine — at the right rate).
    await this.kv.set(this.fullKey(), state, { ex: 3600 });
  }

  /**
   * Acquire a token. Resolves immediately if the distributed bucket has
   * one available; otherwise waits until refilled. Throws if the wait
   * exceeds `acquireTimeoutMs`.
   */
  async acquire(): Promise<void> {
    const start = Date.now();
    while (true) {
      const now = Date.now();
      const state = this.refill(await this.readState(), now);

      if (state.tokens >= 1) {
        state.tokens -= 1;
        await this.writeState(state);
        return;
      }

      // Compute wait time until next token. Cap at remaining timeout budget.
      const tokensNeeded = 1 - state.tokens;
      const waitMs = Math.ceil((tokensNeeded / this.refillPerSecond) * 1000);
      const elapsed = now - start;
      if (elapsed + waitMs > this.acquireTimeoutMs) {
        throw new Error(
          `VercelKVRateLimiter acquire timed out after ${elapsed + waitMs}ms (key=${this.key}).`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /** Best-effort acquire — returns true if a token was available, false otherwise. */
  async tryAcquire(): Promise<boolean> {
    const state = this.refill(await this.readState(), Date.now());
    if (state.tokens >= 1) {
      state.tokens -= 1;
      await this.writeState(state);
      return true;
    }
    return false;
  }

  /**
   * Adaptive learning — call after each MP API response. If MP's stated
   * `x-rate-limit-remaining` is lower than our local count, trust MP and
   * drop the bucket to match (prevents over-spending).
   */
  async learnFromHeaders(headers: {
    remaining: number | null;
    resetSeconds: number | null;
  }): Promise<void> {
    if (!this.adaptive) return;
    if (headers.remaining === null) return;
    const state = this.refill(await this.readState(), Date.now());
    if (headers.remaining < state.tokens) {
      state.tokens = Math.max(0, headers.remaining);
      await this.writeState(state);
    }
  }

  /** Inspect bucket state. */
  async getStats(): Promise<{ tokens: number; capacity: number; refillPerSecond: number }> {
    const state = this.refill(await this.readState(), Date.now());
    return {
      tokens: state.tokens,
      capacity: this.capacity,
      refillPerSecond: this.refillPerSecond,
    };
  }

  /** Reset the bucket to full. Use sparingly (e.g., after a known-clean window). */
  async reset(): Promise<void> {
    await this.writeState({ tokens: this.capacity, lastRefillMs: Date.now() });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IdempotencyCache (KV-backed dedup of agent retries)
// ─────────────────────────────────────────────────────────────────────────────

export class VercelKVIdempotencyCache implements IdempotencyCache {
  private readonly kv: VercelKV;
  private readonly prefix: string;

  constructor(options: VercelKVAdapterOptions = {}) {
    this.kv = options.kv ?? defaultKv;
    this.prefix = options.prefix ?? DEFAULT_IDEMPOTENCY_PREFIX;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.kv.get<T>(this.key(key))) ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds = 86_400): Promise<void> {
    // Vercel KV's `set` supports a TTL in seconds via the `ex` option.
    await this.kv.set(this.key(key), value, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.kv.del(this.key(key));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditLogAdapter — production audit trail with daily-bucket indexing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel KV–backed audit log adapter. Stores each entry under
 * `mp:audit:entry:{id}` AND adds the id to a daily index sorted set
 * `mp:audit:day:{YYYY-MM-DD}` (score = timestamp ms). This gives O(log N)
 * time-range queries ("all entries from May 1 to May 5") without scanning
 * the entire log.
 *
 * # Storage layout
 *
 * - `mp:audit:entry:{id}` → the full entry JSON
 * - `mp:audit:day:{YYYY-MM-DD}` → ZSET of entry ids by timestamp (ms)
 * - `mp:audit:actor:{actor}` → ZSET of entry ids by timestamp (for "all
 *   entries by actor X")
 * - `mp:audit:tenant:{tenantId}` → same, by tenant
 *
 * # Cost considerations
 *
 * Each `append()` does 1-3 KV writes (entry + 1-2 indexes). For high-traffic
 * deployments (>10/s sustained), batch via your own queue (e.g., Vercel
 * Queues with daily flush) and provide a custom adapter that batches.
 */
export class VercelKVAuditLog implements AuditLogAdapter {
  private readonly kv: VercelKV;
  private readonly prefix: string;

  constructor(options: VercelKVAdapterOptions = {}) {
    this.kv = options.kv ?? defaultKv;
    this.prefix = options.prefix ?? DEFAULT_AUDIT_PREFIX;
  }

  async append(entry: AuditEntry): Promise<void> {
    const ts = new Date(entry.timestamp).getTime();
    const day = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    await Promise.all([
      this.kv.set(`${this.prefix}entry:${entry.id}`, entry),
      this.kv.zadd(`${this.prefix}day:${day}`, { score: ts, member: entry.id }),
      this.kv.zadd(`${this.prefix}actor:${entry.actor}`, { score: ts, member: entry.id }),
      ...(entry.tenantId
        ? [
            this.kv.zadd(`${this.prefix}tenant:${entry.tenantId}`, {
              score: ts,
              member: entry.id,
            }),
          ]
        : []),
    ]);
  }

  async query(filter: {
    actor?: string;
    operation?: AuditOperation;
    tenantId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditEntry[]> {
    const limit = filter.limit ?? 100;
    let ids: string[];

    // Pick the most selective index available
    if (filter.actor) {
      ids = await this.zrangeByScore(
        `${this.prefix}actor:${filter.actor}`,
        filter.from,
        filter.to,
        limit,
      );
    } else if (filter.tenantId) {
      ids = await this.zrangeByScore(
        `${this.prefix}tenant:${filter.tenantId}`,
        filter.from,
        filter.to,
        limit,
      );
    } else if (filter.from || filter.to) {
      // Walk daily buckets for the date range
      const fromDate = filter.from?.slice(0, 10) ?? "0000-00-00";
      const toDate = filter.to?.slice(0, 10) ?? "9999-99-99";
      ids = [];
      // Cap walk to ~1 year max to avoid runaway
      const fromTs = new Date(fromDate).getTime();
      const toTs = new Date(toDate).getTime();
      for (let d = fromTs; d <= toTs && ids.length < limit; d += 86_400_000) {
        const day = new Date(d).toISOString().slice(0, 10);
        const dayIds = await this.zrangeByScore(
          `${this.prefix}day:${day}`,
          filter.from,
          filter.to,
          limit - ids.length,
        );
        ids.push(...dayIds);
      }
    } else {
      // No filter — bail (full scan would be unbounded)
      return [];
    }

    // Load entries
    const entries: AuditEntry[] = [];
    for (const id of ids) {
      const entry = await this.kv.get<AuditEntry>(`${this.prefix}entry:${id}`);
      if (!entry) continue;
      if (filter.operation && entry.operation !== filter.operation) continue;
      entries.push(entry);
    }
    return entries;
  }

  private async zrangeByScore(
    key: string,
    from?: string,
    to?: string,
    limit?: number,
  ): Promise<string[]> {
    const min = from ? new Date(from).getTime() : 0;
    const max = to ? new Date(to).getTime() : Number.MAX_SAFE_INTEGER;
    const opts = {
      byScore: true as const,
      offset: 0,
      ...(limit !== undefined ? { count: limit } : { count: 100 }),
    };
    const ids = await this.kv.zrange(key, min, max, opts);
    return ids.map(String);
  }
}
