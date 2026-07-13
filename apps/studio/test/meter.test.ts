import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A faithful in-memory @vercel/kv mock (incrby, get, set NX EX, del), with a
// fault toggle to prove recordUsage/getUsage's best-effort contract and
// checkCap's fail-closed contract.
const state = vi.hoisted(() => ({ store: new Map<string, unknown>(), fail: false }));
vi.mock("@vercel/kv", () => ({
  kv: {
    incrby: async (k: string, n: number) => {
      if (state.fail) throw new Error("kv down");
      const cur = Number(state.store.get(k) ?? 0) + n;
      state.store.set(k, cur);
      return cur;
    },
    get: async (k: string) => {
      if (state.fail) throw new Error("kv down");
      return state.store.get(k) ?? null;
    },
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (state.fail) throw new Error("kv down");
      if (opts?.nx && state.store.has(k)) return null;
      state.store.set(k, v);
      return "OK";
    },
    del: async (k: string) => {
      if (state.fail) throw new Error("kv down");
      return state.store.delete(k) ? 1 : 0;
    },
  },
}));

import { checkCap, getUsage, recordUsage } from "../src/lib/meter";

beforeEach(() => {
  state.store.clear();
  state.fail = false;
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  delete process.env.STUDIO_FREE_CAP_MICRO_USD;
  delete process.env.STUDIO_PRICE_MULTIPLIER;
});
afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.STUDIO_FREE_CAP_MICRO_USD;
  delete process.env.STUDIO_PRICE_MULTIPLIER;
});

describe("recordUsage / getUsage", () => {
  it("accumulates tokens + cost across calls for the current month", async () => {
    await recordUsage("acc-1", { inputTokens: 100, outputTokens: 40, model: "m", costMicroUsd: 30 });
    await recordUsage("acc-1", { inputTokens: 20, outputTokens: 5, model: "m", costMicroUsd: 7 });
    const u = await getUsage("acc-1");
    expect(u.inputTokens).toBe(120);
    expect(u.outputTokens).toBe(45);
    expect(u.costMicroUsd).toBe(37);
    expect(u.month).toMatch(/^\d{6}$/);
  });

  it("priceMicroUsd is costMicroUsd times the default price multiplier (the would-be bill; nothing is charged)", async () => {
    await recordUsage("acc-price", { inputTokens: 1, outputTokens: 1, model: "m", costMicroUsd: 1_234 });
    const u = await getUsage("acc-price");
    expect(u.priceMicroUsd).toBe(1_234 * 5);
  });

  it("respects STUDIO_PRICE_MULTIPLIER override", async () => {
    process.env.STUDIO_PRICE_MULTIPLIER = "3";
    await recordUsage("acc-price-override", { inputTokens: 1, outputTokens: 1, model: "m", costMicroUsd: 1_000 });
    const u = await getUsage("acc-price-override");
    expect(u.priceMicroUsd).toBe(3_000);
    delete process.env.STUDIO_PRICE_MULTIPLIER;
  });

  it("falls back to the default multiplier on an invalid STUDIO_PRICE_MULTIPLIER", async () => {
    process.env.STUDIO_PRICE_MULTIPLIER = "not-a-number";
    await recordUsage("acc-price-invalid", { inputTokens: 1, outputTokens: 1, model: "m", costMicroUsd: 100 });
    const u = await getUsage("acc-price-invalid");
    expect(u.priceMicroUsd).toBe(500);
    delete process.env.STUDIO_PRICE_MULTIPLIER;
  });

  it("isolates usage per account", async () => {
    await recordUsage("acc-a", { inputTokens: 10, outputTokens: 0, model: "m", costMicroUsd: 1 });
    await recordUsage("acc-b", { inputTokens: 999, outputTokens: 0, model: "m", costMicroUsd: 999 });
    expect((await getUsage("acc-a")).inputTokens).toBe(10);
    expect((await getUsage("acc-b")).inputTokens).toBe(999);
  });

  it("recordUsage is best-effort: swallows a KV error without throwing", async () => {
    state.fail = true;
    await expect(
      recordUsage("acc-err", { inputTokens: 1, outputTokens: 1, model: "m", costMicroUsd: 1 }),
    ).resolves.toBeUndefined();
  });

  it("getUsage is best-effort: zeros on a KV error", async () => {
    await recordUsage("acc-zero", { inputTokens: 5, outputTokens: 5, model: "m", costMicroUsd: 5 });
    state.fail = true;
    const u = await getUsage("acc-zero");
    expect(u).toMatchObject({ inputTokens: 0, outputTokens: 0, costMicroUsd: 0, priceMicroUsd: 0 });
  });
});

describe("checkCap", () => {
  it("allows spend under the default cap and reports the remaining budget", async () => {
    await recordUsage("acc-cap", { inputTokens: 0, outputTokens: 0, model: "m", costMicroUsd: 100_000 });
    const cap = await checkCap("acc-cap");
    expect(cap.allowed).toBe(true);
    expect(cap.monthlyCostMicroUsd).toBe(500_000);
    expect(cap.remainingMicroUsd).toBe(400_000);
  });

  it("blocks once cost-to-date meets or exceeds the cap", async () => {
    await recordUsage("acc-atcap", { inputTokens: 0, outputTokens: 0, model: "m", costMicroUsd: 500_000 });
    const cap = await checkCap("acc-atcap");
    expect(cap.allowed).toBe(false);
    expect(cap.remainingMicroUsd).toBe(0);
  });

  it("blocks when cost-to-date has gone past the cap", async () => {
    await recordUsage("acc-overcap", { inputTokens: 0, outputTokens: 0, model: "m", costMicroUsd: 600_000 });
    const cap = await checkCap("acc-overcap");
    expect(cap.allowed).toBe(false);
    expect(cap.remainingMicroUsd).toBe(0);
  });

  it("respects STUDIO_FREE_CAP_MICRO_USD override", async () => {
    process.env.STUDIO_FREE_CAP_MICRO_USD = "1000";
    await recordUsage("acc-override", { inputTokens: 0, outputTokens: 0, model: "m", costMicroUsd: 999 });
    const cap = await checkCap("acc-override");
    expect(cap.monthlyCostMicroUsd).toBe(1000);
    expect(cap.allowed).toBe(true);
    expect(cap.remainingMicroUsd).toBe(1);
  });

  it("FAILS CLOSED on a KV error (never lets an unmetered call through)", async () => {
    state.fail = true;
    const cap = await checkCap("acc-kvdown");
    expect(cap.allowed).toBe(false);
    expect(cap.remainingMicroUsd).toBe(0);
  });
});
