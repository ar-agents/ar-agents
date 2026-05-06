/**
 * In-memory record of a subscription. The lib persists the MP-side fields
 * needed to reason about a subscription without hitting the API every time
 * (status, last webhook info, customer email, etc.) plus a free-form metadata
 * bag for callers to attach business context (tenant id, plan name, etc.).
 */
export interface SubscriptionStateRecord {
  status?: string;
  payerEmail?: string;
  amount?: number;
  currency?: string;
  frequency?: number;
  frequencyType?: string;
  initPoint?: string;
  externalReference?: string;
  createdAt?: string;
  cancelledAt?: string;
  lastWebhookStatus?: string;
  lastWebhookAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persistence surface for subscription state. Implementations may back this
 * with Upstash Redis, Vercel KV, Postgres, in-memory, or anything that
 * supports the three operations. The default `InMemoryStateAdapter` is
 * provided for tests and trivial single-process deployments; production
 * setups should plug in a durable store.
 */
export interface SubscriptionStateAdapter {
  set(id: string, state: Partial<SubscriptionStateRecord>): Promise<void>;
  get(id: string): Promise<SubscriptionStateRecord | null>;
  list?(): Promise<string[]>;
}

/**
 * Volatile, single-process state adapter. Useful for tests and demos. Do not
 * use in production: state is lost on restart and is not safe across tenants.
 */
export class InMemoryStateAdapter implements SubscriptionStateAdapter {
  private readonly store = new Map<string, SubscriptionStateRecord>();

  async set(
    id: string,
    state: Partial<SubscriptionStateRecord>,
  ): Promise<void> {
    const existing = this.store.get(id) ?? {};
    this.store.set(id, { ...existing, ...state });
  }

  async get(id: string): Promise<SubscriptionStateRecord | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /** Test helper: drop everything. Not part of the adapter interface. */
  reset(): void {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.8 — OAuthTokenStore
//
// The marketplace OAuth flow needs PERSISTENT storage: after a seller
// authorizes your app, you get { user_id, access_token, refresh_token,
// expires_in }. The access_token is short-lived (~6h); the refresh_token
// is long-lived but rotates on each refresh.
//
// In a marketplace setup you have one record PER SELLER, keyed by user_id.
// Before any per-seller API call you typically:
//   1. `store.get(user_id)` — fetch the persisted token
//   2. If `expires_at` is within the skew window → `oauth_refresh_token`
//      → `store.set(user_id, newToken)`
//   3. Instantiate `new MercadoPagoClient({ accessToken })` AS the seller
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthTokenRecord {
  user_id: string;
  access_token: string;
  refresh_token: string;
  /** Unix-ms timestamp when access_token expires. */
  expires_at: number;
  /** OAuth scope granted, if any. */
  scope?: string;
  /** Optional: any business metadata you want to attach (tenant id, etc.). */
  metadata?: Record<string, unknown>;
}

export interface OAuthTokenStore {
  /** Persist (or update) the token for `user_id`. */
  set(userId: string, token: OAuthTokenRecord): Promise<void>;
  /** Fetch the stored token, or null if no token registered for that seller. */
  get(userId: string): Promise<OAuthTokenRecord | null>;
  /** Forget a seller's token (e.g., they revoked the app). */
  delete(userId: string): Promise<void>;
  /** Optional: enumerate all sellers (useful for batch refresh jobs). */
  list?(): Promise<string[]>;
}

/**
 * Volatile, single-process OAuth token store. NOT for production marketplace
 * setups — tokens are lost on restart. Plug in `VercelKVOAuthTokenStore`
 * (from `@ar-agents/mercadopago/vercel-kv`) or your own Postgres-backed
 * implementation.
 */
export class InMemoryOAuthTokenStore implements OAuthTokenStore {
  private readonly store = new Map<string, OAuthTokenRecord>();

  async set(userId: string, token: OAuthTokenRecord): Promise<void> {
    this.store.set(userId, token);
  }

  async get(userId: string): Promise<OAuthTokenRecord | null> {
    return this.store.get(userId) ?? null;
  }

  async delete(userId: string): Promise<void> {
    this.store.delete(userId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /** Test helper. */
  reset(): void {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.8 — IdempotencyCache
//
// Deduplicate REPEATED tool calls with the same `idempotencyKey` — caches
// the response of the FIRST successful call, returns the cached value on
// subsequent calls within the TTL window.
//
// MP server-side dedup already protects against duplicate transactions
// (same X-Idempotency-Key header → same response). This client-side cache
// is layered on top: it short-circuits the network call entirely, saving
// latency + MP API quota when an agent retries due to LLM non-determinism.
//
// Use this carefully: caching is opt-in per-tool because some flows want
// the network round-trip every time (e.g., status checks).
// ─────────────────────────────────────────────────────────────────────────────

export interface IdempotencyCache {
  /** Get the cached response for a key, or null if not present / expired. */
  get<T>(key: string): Promise<T | null>;
  /**
   * Store a response under `key`. `ttlSeconds` defaults to 24h — match MP's
   * own idempotency window so the cache becomes irrelevant once MP would
   * forget anyway.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Forget a cache entry (force a re-fetch on next call). */
  delete(key: string): Promise<void>;
}

/**
 * Volatile, single-process idempotency cache. Tests + dev only.
 */
export class InMemoryIdempotencyCache implements IdempotencyCache {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds = 86_400): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Test helper. */
  reset(): void {
    this.store.clear();
  }
}
