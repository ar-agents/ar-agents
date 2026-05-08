import { describe, expect, it, vi } from "vitest";
import { InMemoryStateAdapter, VercelKVStateAdapter } from "../src";
import type { StoredAuthState } from "../src";

const sample: StoredAuthState = {
  nonce: "n",
  codeVerifier: "v",
  redirectUri: "https://example.com/cb",
  scope: ["openid"],
  createdAt: Date.now(),
};

describe("InMemoryStateAdapter", () => {
  it("stores and consumes a value once", async () => {
    const a = new InMemoryStateAdapter();
    await a.put("s1", sample, 60);
    expect(a.size()).toBe(1);
    const back = await a.consume("s1");
    expect(back).toEqual(sample);
    const second = await a.consume("s1");
    expect(second).toBeNull();
  });

  it("returns null for unknown state", async () => {
    const a = new InMemoryStateAdapter();
    expect(await a.consume("nope")).toBeNull();
  });

  it("expires after ttl", async () => {
    const a = new InMemoryStateAdapter();
    vi.useFakeTimers();
    try {
      await a.put("s", sample, 1);
      vi.advanceTimersByTime(2_000);
      expect(await a.consume("s")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clear() empties the store", async () => {
    const a = new InMemoryStateAdapter();
    await a.put("s", sample, 60);
    a.clear();
    expect(a.size()).toBe(0);
  });
});

describe("VercelKVStateAdapter", () => {
  it("uses getdel when available for atomicity", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      del: vi.fn(async (k: string) => {
        store.delete(k);
      }),
      getdel: vi.fn(async (k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return v;
      }),
    };
    const a = new VercelKVStateAdapter(kv);
    await a.put("s", sample, 30);
    expect(kv.set).toHaveBeenCalledWith(
      "miarg:state:s",
      JSON.stringify(sample),
      { ex: 30 },
    );
    const back = await a.consume("s");
    expect(back).toEqual(sample);
    expect(kv.getdel).toHaveBeenCalledWith("miarg:state:s");
  });

  it("falls back to get + del when no getdel", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      del: vi.fn(async (k: string) => {
        store.delete(k);
      }),
    };
    const a = new VercelKVStateAdapter(kv);
    await a.put("s", sample, 30);
    const back = await a.consume("s");
    expect(back).toEqual(sample);
    expect(kv.get).toHaveBeenCalled();
    expect(kv.del).toHaveBeenCalled();
  });

  it("supports prefix override", async () => {
    const kv = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
    const a = new VercelKVStateAdapter(kv, { prefix: "test:" });
    await a.put("s", sample, 60);
    expect(kv.set).toHaveBeenCalledWith("test:s", JSON.stringify(sample), { ex: 60 });
  });

  it("returns null on malformed JSON", async () => {
    const kv = {
      get: vi.fn(async () => "not json"),
      set: vi.fn(),
      del: vi.fn(),
    };
    const a = new VercelKVStateAdapter(kv);
    expect(await a.consume("s")).toBeNull();
  });
});
