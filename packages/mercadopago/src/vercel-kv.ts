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
