import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A faithful in-memory @vercel/kv mock (SET NX EX returns "OK"/null; GET; DEL).
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => (store.delete(k) ? 1 : 0),
  },
}));

import { withKvLock, KvLockError } from "../src/lib/kv-lock";

beforeEach(() => {
  store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
});
afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("withKvLock", () => {
  it("runs fn, releases the lock, and a second acquire on the same key succeeds", async () => {
    let ran = 0;
    await withKvLock("k", async () => {
      ran++;
    });
    expect(ran).toBe(1);
    expect(store.has("lock:k")).toBe(false); // compare-and-released

    await withKvLock("k", async () => {
      ran++;
    });
    expect(ran).toBe(2); // could re-acquire because release worked
  });

  it("serializes concurrent critical sections on the same key (no interleave)", async () => {
    const order: string[] = [];
    const crit = (id: string) =>
      withKvLock("same", async () => {
        order.push(`${id}:start`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`${id}:end`);
      });
    await Promise.all([crit("A"), crit("B")]);
    const first = order[0]!.split(":")[0]!;
    const second = first === "A" ? "B" : "A";
    // The winner fully finishes before the loser starts — never A:start,B:start,…
    expect(order).toEqual([`${first}:start`, `${first}:end`, `${second}:start`, `${second}:end`]);
  });

  it("does NOT serialize DIFFERENT keys (they run independently)", async () => {
    const order: string[] = [];
    await Promise.all([
      withKvLock("a", async () => {
        order.push("a:start");
        await new Promise((r) => setTimeout(r, 10));
        order.push("a:end");
      }),
      withKvLock("b", async () => {
        order.push("b:start");
        order.push("b:end");
      }),
    ]);
    // b never waits for a — both starts precede a's end.
    expect(order.indexOf("b:end")).toBeLessThan(order.indexOf("a:end"));
  });

  it("skips locking entirely when KV is not wired (single isolate, no KV touched)", async () => {
    delete process.env.KV_REST_API_URL;
    let ran = 0;
    await withKvLock("k", async () => {
      ran++;
    });
    expect(ran).toBe(1);
    expect(store.size).toBe(0);
  });

  it("propagates a fn throw AND still releases the lock", async () => {
    await expect(
      withKvLock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(store.has("lock:k")).toBe(false);
  });

  it("KvLockError is thrown when acquisition is impossible", async () => {
    // Pre-plant the lock so NX always conflicts, and give zero retries.
    store.set("lock:stuck", "someone-else");
    await expect(
      withKvLock("stuck", async () => undefined, { retries: 0 }),
    ).rejects.toBeInstanceOf(KvLockError);
  });
});
