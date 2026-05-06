import { describe, expect, it, beforeEach } from "vitest";
import {
  VercelKVIdempotencyCache,
  VercelKVOAuthTokenStore,
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
