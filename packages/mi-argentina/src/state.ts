/**
 * State-adapter implementations for `@ar-agents/mi-argentina`.
 *
 * The OAuth flow leaves a session "in flight" between the authorization
 * redirect (when the verifier/state/nonce are generated) and the callback
 * (when they're checked). That session has to live somewhere. This module
 * ships an in-memory store for dev/tests, plus a Vercel KV adapter — both
 * implementing the same `MiArgentinaStateAdapter` contract.
 *
 * # When to use which
 *
 * - **InMemoryStateAdapter** — single-process dev servers, tests, and
 *   demos. State is lost on restart and not shared across instances.
 * - **VercelKVStateAdapter** — production on Vercel. Bring your own KV
 *   instance and pass it in. Per-key TTL; no sweep needed.
 * - **Custom** — implement the interface directly to back state in
 *   Postgres/Redis/Upstash/etc.
 */

import type { MiArgentinaStateAdapter, StoredAuthState } from "./types";

/**
 * Single-process in-memory state store. Each entry has a TTL and is
 * removed on consume or after expiry. Loses state on restart — DO NOT use
 * in production behind multiple instances.
 */
export class InMemoryStateAdapter implements MiArgentinaStateAdapter {
  private map = new Map<string, { value: StoredAuthState; expiresAt: number }>();

  async put(state: string, value: StoredAuthState, ttlSeconds: number): Promise<void> {
    this.map.set(state, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async consume(state: string): Promise<StoredAuthState | null> {
    const entry = this.map.get(state);
    if (!entry) return null;
    this.map.delete(state);
    if (entry.expiresAt < Date.now()) return null;
    return entry.value;
  }

  /** Test helper. Not part of the public adapter contract. */
  size(): number {
    return this.map.size;
  }

  /** Test helper to clear the store. */
  clear(): void {
    this.map.clear();
  }
}

/**
 * Vercel KV (or compatible Upstash Redis) state adapter.
 *
 * Pass any object satisfying the minimal interface — typically the
 * default export of `@vercel/kv` or `@upstash/redis`. The adapter uses
 * `set` with `EX` (TTL in seconds) on put, and an atomic `getdel` on
 * consume so that a `state` value is only good for ONE callback.
 */
export class VercelKVStateAdapter implements MiArgentinaStateAdapter {
  private prefix: string;
  constructor(
    private kv: VercelKVLike,
    options: { prefix?: string } = {},
  ) {
    this.prefix = options.prefix ?? "miarg:state:";
  }

  async put(state: string, value: StoredAuthState, ttlSeconds: number): Promise<void> {
    await this.kv.set(this.prefix + state, JSON.stringify(value), { ex: ttlSeconds });
  }

  async consume(state: string): Promise<StoredAuthState | null> {
    const key = this.prefix + state;
    let raw: string | null = null;
    if (typeof this.kv.getdel === "function") {
      raw = await this.kv.getdel(key);
    } else {
      raw = await this.kv.get(key);
      if (raw !== null) await this.kv.del(key);
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredAuthState;
    } catch {
      return null;
    }
  }
}

/** Minimal subset of @vercel/kv we depend on. */
export interface VercelKVLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Optional atomic getdel — Upstash + recent KV expose it. */
  getdel?(key: string): Promise<string | null>;
}
