/**
 * A tiny cross-isolate advisory lock over Vercel KV (Upstash), edge-safe.
 *
 * WHY: the registry's mutations are read-modify-write on a whole-record KV blob
 * (setGoodStanding, the lifecycle transitions, incident/history appends). Two
 * concurrent Vercel isolates could each read version N, mutate, and blind-write
 * N+1 — a LOST UPDATE (and, on a lifecycle status write that carries a stale
 * good-standing snapshot, a revoked->active RESURRECTION). Serialize the critical
 * section with a `SET key token NX EX` lock and a compare-and-release.
 *
 * Best-effort by design and bounded by the lock's own TTL, so a crashed holder
 * self-heals. In-memory mode (KV not wired: local dev / preview) has a SINGLE
 * isolate, so there is no cross-isolate race to guard — the lock is skipped and
 * `fn` runs directly.
 *
 * NOT a general mutex: it does not guarantee fairness or reentrancy. Callers must
 * not nest two `withKvLock` calls on the SAME key in one call chain (that would
 * self-deadlock until the TTL lapses) — use disjoint lock keys per resource, or
 * an unlocked inner primitive under one outer lock. See registry-store.ts.
 */

import { kv } from "@vercel/kv";

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

/** Thrown when the lock could not be acquired (contention past `retries`, or a
 *  KV error during acquisition). Callers treat it as a transient write failure
 *  (return null / re-queue), never as data corruption. */
export class KvLockError extends Error {
  constructor(lockKey: string) {
    super(`kv-lock: could not acquire lock for "${lockKey}"`);
    this.name = "KvLockError";
  }
}

export interface KvLockOpts {
  /** Lock auto-expiry (seconds). Safety net against a crashed holder. Default 5. */
  ttlSeconds?: number;
  /** Acquire attempts before giving up. Default 25 (~0.5-1s of contention). */
  retries?: number;
  /** Base backoff (ms) between attempts; jittered up to 2x. Default 20. */
  backoffMs?: number;
}

const DEFAULT_TTL_SECONDS = 5;
const DEFAULT_RETRIES = 25;
const DEFAULT_BACKOFF_MS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `fn` while holding a cross-isolate lock on `lockKey`. Skips locking (runs
 * `fn` directly) when KV is not wired. Always releases the lock (compare-and-del,
 * so we never delete a lock a later holder re-acquired after our TTL lapsed).
 *
 * @throws {KvLockError} when the lock cannot be acquired.
 */
export async function withKvLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  opts: KvLockOpts = {},
): Promise<T> {
  if (!isKvWired()) return fn();

  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const key = `lock:${lockKey}`;
  const token = crypto.randomUUID();

  let acquired = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let got: unknown;
    try {
      // SET key token NX EX ttl — the same primitive claimConsume/kvRateLimit use.
      got = await kv.set(key, token, { nx: true, ex: ttlSeconds });
    } catch {
      // A KV error during acquisition is treated as "unavailable": surface it so
      // the caller fails the write rather than proceeding UNSERIALIZED.
      throw new KvLockError(lockKey);
    }
    if (got) {
      acquired = true;
      break;
    }
    if (attempt < retries) {
      await sleep(backoffMs + Math.floor(Math.random() * backoffMs));
    }
  }
  if (!acquired) throw new KvLockError(lockKey);

  try {
    return await fn();
  } finally {
    // Compare-and-release: only delete the lock if WE still hold it, so we never
    // clobber a lock another isolate acquired after ours auto-expired. Best-effort:
    // on any KV hiccup we leave it and the EX TTL self-heals it.
    try {
      const cur = await kv.get<string>(key);
      if (cur === token) await kv.del(key);
    } catch {
      /* leave it; the TTL guarantees the lock self-heals */
    }
  }
}
