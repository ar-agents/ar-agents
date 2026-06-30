import { beforeEach, describe, expect, it, vi } from "vitest";

// Stateful in-memory @vercel/kv mock with a fault toggle to prove best-effort.
const state = vi.hoisted(() => ({ store: new Map<string, number>(), fail: false }));
vi.mock("@vercel/kv", () => ({
  kv: {
    incr: async (k: string) => {
      if (state.fail) throw new Error("kv down");
      const n = (state.store.get(k) ?? 0) + 1;
      state.store.set(k, n);
      return n;
    },
    expire: async () => 1,
    get: async (k: string) => {
      if (state.fail) throw new Error("kv down");
      return state.store.get(k) ?? null;
    },
  },
}));

import { recordUsage, getUsage } from "../src/lib/metering";

beforeEach(() => {
  state.store.clear();
  state.fail = false;
});

describe("metering — billable usage tally", () => {
  it("records one unit per call; getUsage reads month-to-date + today", async () => {
    const key = "arag_live_" + "a".repeat(48);
    expect(await recordUsage(key)).toBe(1);
    expect(await recordUsage(key)).toBe(2);
    const u = await getUsage(key);
    expect(u.monthToDate).toBe(2);
    expect(u.today).toBe(2);
    expect(u.month).toMatch(/^\d{6}$/);
  });

  it("isolates usage per key", async () => {
    const k1 = "arag_live_" + "1".repeat(48);
    const k2 = "arag_live_" + "2".repeat(48);
    await recordUsage(k1);
    await recordUsage(k1);
    await recordUsage(k2);
    expect((await getUsage(k1)).monthToDate).toBe(2);
    expect((await getUsage(k2)).monthToDate).toBe(1);
  });

  it("is best-effort: recordUsage returns null and getUsage zeros on KV error", async () => {
    const key = "arag_live_" + "b".repeat(48);
    state.fail = true;
    expect(await recordUsage(key)).toBeNull();
    const u = await getUsage(key);
    expect(u.monthToDate).toBe(0);
    expect(u.today).toBe(0);
  });
});
