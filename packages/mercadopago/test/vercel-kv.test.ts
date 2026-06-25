import { describe, expect, it, beforeEach } from "vitest";
import {
  VercelKVIdempotencyCache,
  VercelKVOAuthTokenStore,
  VercelKVRateLimiter,
  VercelKVSubscriptionStateAdapter,
} from "../src/vercel-kv";

/**
 * Minimal fake KV impl that mirrors @vercel/kv's surface used by our
 * adapters: get/set/del + sadd/smembers/srem. Maintains a Map + Set per key
 * pattern. No TTL enforcement (TTL is tested separately via the InMemory cache).
 */
function createFakeKV() {
  const kvStore = new Map<string, unknown>();
  const setStore = new Map<string, Set<string>>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (kvStore.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown, _options?: { ex?: number }): Promise<"OK"> {
      kvStore.set(key, value);
      return "OK";
    },
    async del(key: string): Promise<number> {
      return kvStore.delete(key) ? 1 : 0;
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      const set = setStore.get(key) ?? new Set<string>();
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) {
          set.add(m);
          added++;
        }
      }
      setStore.set(key, set);
      return added;
    },
    async smembers(key: string): Promise<string[]> {
      return Array.from(setStore.get(key) ?? []);
    },
    async srem(key: string, ...members: string[]): Promise<number> {
      const set = setStore.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const m of members) {
        if (set.delete(m)) removed++;
      }
      return removed;
    },
    /**
     * Faithful, ATOMIC emulation of the two limiter Lua scripts. Atomicity is
     * the whole point: the read → compute → write runs to completion with NO
     * `await` in the middle, so concurrently-dispatched eval() promises cannot
     * interleave — exactly mirroring Redis executing the script atomically.
     * (The old read-modify-write awaited between read and write, which is what
     * let concurrent acquirers over-spend.)
     */
    async eval(
      script: string,
      keys: string[],
      args: (number | string)[],
    ): Promise<unknown> {
      const key = keys[0]!;
      const capacity = Number(args[0]);
      const refillPerSecond = Number(args[1]);
      const now = Number(args[2]);
      const ttl = Number(args[4]);
      const stored = kvStore.get(key) as
        | { tokens: number; lastRefillMs: number }
        | undefined;
      let tokens = capacity;
      let lastRefill = now;
      if (
        stored &&
        typeof stored.tokens === "number" &&
        typeof stored.lastRefillMs === "number"
      ) {
        tokens = stored.tokens;
        lastRefill = stored.lastRefillMs;
      }
      const elapsed = Math.max(0, now - lastRefill);
      tokens = Math.min(capacity, tokens + (elapsed / 1000) * refillPerSecond);

      if (script.includes("@op:consume")) {
        const cost = Number(args[3]);
        let allowed = 0;
        if (tokens >= cost) {
          tokens -= cost;
          allowed = 1;
          kvStore.set(key, { tokens, lastRefillMs: now });
        }
        return [allowed, String(tokens)];
      }
      // @op:clamp
      const remaining = Number(args[3]);
      if (remaining < tokens) tokens = Math.max(0, remaining);
      kvStore.set(key, { tokens, lastRefillMs: now });
      // emulate TTL no-op
      void ttl;
      return String(tokens);
    },
    _reset() {
      kvStore.clear();
      setStore.clear();
    },
  };
}

describe("VercelKVSubscriptionStateAdapter", () => {
  let kv: ReturnType<typeof createFakeKV>;
  let adapter: VercelKVSubscriptionStateAdapter;

  beforeEach(() => {
    kv = createFakeKV();
    adapter = new VercelKVSubscriptionStateAdapter({ kv: kv as never });
  });

  it("set + get round-trips a record", async () => {
    await adapter.set("sub-1", { status: "authorized", payerEmail: "buyer@test.com" });
    const got = await adapter.get("sub-1");
    expect(got?.status).toBe("authorized");
    expect(got?.payerEmail).toBe("buyer@test.com");
  });

  it("set merges into existing record (does not overwrite)", async () => {
    await adapter.set("sub-1", { status: "pending", payerEmail: "buyer@test.com" });
    await adapter.set("sub-1", { status: "authorized" });
    const got = await adapter.get("sub-1");
    expect(got?.status).toBe("authorized");
    expect(got?.payerEmail).toBe("buyer@test.com"); // preserved
  });

  it("get returns null for unknown id", async () => {
    expect(await adapter.get("does-not-exist")).toBeNull();
  });

  it("list returns all known ids", async () => {
    await adapter.set("sub-1", { status: "authorized" });
    await adapter.set("sub-2", { status: "paused" });
    const ids = await adapter.list();
    expect(ids.sort()).toEqual(["sub-1", "sub-2"]);
  });

  it("delete removes the record + index entry", async () => {
    await adapter.set("sub-1", { status: "authorized" });
    await adapter.delete("sub-1");
    expect(await adapter.get("sub-1")).toBeNull();
    expect(await adapter.list()).toEqual([]);
  });

  it("uses custom prefix when configured", async () => {
    const a = new VercelKVSubscriptionStateAdapter({
      kv: kv as never,
      prefix: "myapp:sub:",
    });
    await a.set("sub-1", { status: "authorized" });
    // Verify the underlying KV key was prefixed correctly
    const raw = await kv.get("myapp:sub:sub-1");
    expect(raw).toEqual({ status: "authorized" });
  });
});

describe("VercelKVOAuthTokenStore", () => {
  let kv: ReturnType<typeof createFakeKV>;
  let store: VercelKVOAuthTokenStore;

  beforeEach(() => {
    kv = createFakeKV();
    store = new VercelKVOAuthTokenStore({ kv: kv as never });
  });

  it("set + get round-trips a token bundle", async () => {
    await store.set("seller-1", {
      user_id: "seller-1",
      access_token: "at_xyz",
      refresh_token: "rt_xyz",
      expires_at: Date.now() + 3600_000,
    });
    const got = await store.get("seller-1");
    expect(got?.access_token).toBe("at_xyz");
    expect(got?.refresh_token).toBe("rt_xyz");
  });

  it("delete removes the token + index", async () => {
    await store.set("seller-1", {
      user_id: "seller-1",
      access_token: "at",
      refresh_token: "rt",
      expires_at: 0,
    });
    await store.delete("seller-1");
    expect(await store.get("seller-1")).toBeNull();
  });

  it("list returns all sellers", async () => {
    await store.set("seller-1", {
      user_id: "seller-1",
      access_token: "at1",
      refresh_token: "rt1",
      expires_at: 0,
    });
    await store.set("seller-2", {
      user_id: "seller-2",
      access_token: "at2",
      refresh_token: "rt2",
      expires_at: 0,
    });
    const ids = await store.list();
    expect(ids.sort()).toEqual(["seller-1", "seller-2"]);
  });
});

describe("VercelKVIdempotencyCache", () => {
  let kv: ReturnType<typeof createFakeKV>;
  let cache: VercelKVIdempotencyCache;

  beforeEach(() => {
    kv = createFakeKV();
    cache = new VercelKVIdempotencyCache({ kv: kv as never });
  });

  it("set + get round-trips a value", async () => {
    await cache.set("key-1", { paymentId: "12345" });
    const got = await cache.get<{ paymentId: string }>("key-1");
    expect(got?.paymentId).toBe("12345");
  });

  it("get returns null for unknown key", async () => {
    expect(await cache.get("does-not-exist")).toBeNull();
  });

  it("delete removes a cached entry", async () => {
    await cache.set("key-1", "value");
    await cache.delete("key-1");
    expect(await cache.get("key-1")).toBeNull();
  });

  it("forwards TTL via the ex option", async () => {
    let capturedOptions: { ex?: number } | undefined;
    const trackingKv = {
      ...kv,
      async set(key: string, value: unknown, options?: { ex?: number }) {
        capturedOptions = options;
        return kv.set(key, value, options);
      },
    };
    const c = new VercelKVIdempotencyCache({ kv: trackingKv as never });
    await c.set("k", "v", 60);
    expect(capturedOptions?.ex).toBe(60);
  });
});

describe("VercelKVRateLimiter — atomic acquisition (DeepSec MEDIUM)", () => {
  let kv: ReturnType<typeof createFakeKV>;

  beforeEach(() => {
    kv = createFakeKV();
  });

  function makeLimiter(over: Partial<{ capacity: number; refillPerSecond: number }> = {}) {
    return new VercelKVRateLimiter({
      kv: kv as never,
      key: "test",
      capacity: over.capacity ?? 3,
      // effectively no refill within a test tick
      refillPerSecond: over.refillPerSecond ?? 0.0001,
    });
  }

  it("requires a key", () => {
    expect(() => new VercelKVRateLimiter({ kv: kv as never, key: "" })).toThrow(
      /requires a `key`/,
    );
  });

  it("tryAcquire consumes down to zero then denies", async () => {
    const rl = makeLimiter({ capacity: 2 });
    expect(await rl.tryAcquire()).toBe(true);
    expect(await rl.tryAcquire()).toBe(true);
    expect(await rl.tryAcquire()).toBe(false);
  });

  it("does NOT over-spend under concurrency (the bug this fixes)", async () => {
    const rl = makeLimiter({ capacity: 1 });
    // Fire many concurrent acquisitions against a 1-token bucket.
    const results = await Promise.all(
      Array.from({ length: 25 }, () => rl.tryAcquire()),
    );
    const granted = results.filter(Boolean).length;
    expect(granted).toBe(1); // exactly one, never more
  });

  it("acquire() resolves while a token is available", async () => {
    const rl = makeLimiter({ capacity: 1 });
    await expect(rl.acquire()).resolves.toBeUndefined();
  });

  it("acquire() throws (times out) when the bucket is empty and won't refill in time", async () => {
    const rl = new VercelKVRateLimiter({
      kv: kv as never,
      key: "test",
      capacity: 1,
      refillPerSecond: 0.0001,
      acquireTimeoutMs: 5,
    });
    await rl.tryAcquire(); // drain the single token
    await expect(rl.acquire()).rejects.toThrow(/timed out/);
  });

  it("refills over time (lazy refill)", async () => {
    const rl = makeLimiter({ capacity: 1, refillPerSecond: 1000 });
    await rl.tryAcquire(); // drain
    await new Promise((r) => setTimeout(r, 30)); // ~30 tokens worth
    expect(await rl.tryAcquire()).toBe(true);
  });

  it("learnFromHeaders atomically clamps the bucket down to MP's remaining", async () => {
    const rl = makeLimiter({ capacity: 10 });
    await rl.learnFromHeaders({ remaining: 1, resetSeconds: 60 });
    const stats = await rl.getStats();
    expect(stats.tokens).toBeLessThan(1.5); // clamped from 10 down toward 1
    // After clamp to 1, only one acquire should succeed.
    expect(await rl.tryAcquire()).toBe(true);
    expect(await rl.tryAcquire()).toBe(false);
  });

  it("learnFromHeaders never raises the bucket above its current tokens", async () => {
    const rl = makeLimiter({ capacity: 5 });
    await rl.tryAcquire(); // tokens ~4
    await rl.learnFromHeaders({ remaining: 100, resetSeconds: 60 });
    const stats = await rl.getStats();
    expect(stats.tokens).toBeLessThan(4.5); // NOT raised toward 100
  });

  it("learnFromHeaders is a no-op when not adaptive or remaining is null", async () => {
    const nonAdaptive = new VercelKVRateLimiter({
      kv: kv as never,
      key: "test",
      capacity: 5,
      adaptive: false,
    });
    await nonAdaptive.learnFromHeaders({ remaining: 0, resetSeconds: 60 });
    expect((await nonAdaptive.getStats()).tokens).toBe(5);

    const adaptive = makeLimiter({ capacity: 5 });
    await adaptive.learnFromHeaders({ remaining: null, resetSeconds: null });
    expect((await adaptive.getStats()).tokens).toBe(5);
  });

  it("reset refills the bucket to full", async () => {
    const rl = makeLimiter({ capacity: 3 });
    await rl.tryAcquire();
    await rl.tryAcquire();
    await rl.reset();
    expect((await rl.getStats()).tokens).toBe(3);
  });
});
