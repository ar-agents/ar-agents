import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TOCTOU on the upsert claim guard: the guard that rejects a self-list claiming
 * an origin/CUIT already bound to a DIFFERENT id used to run only under the
 * per-entity lock, which is keyed on the NEW entry's id. Two concurrent POSTs
 * with the same publicUrl and different names took disjoint locks and BOTH
 * passed, hijacking the by-url index. upsertRecord now also serializes on the
 * claimed origin + CUIT (claim locks in KV mode, a synchronous final re-check
 * in memory mode), so the second racer must always lose.
 *
 * Fictional PII only (Juan Perez, CUIT 20-12345678-6).
 */

const { kvStore, kvSets } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  kvSets: new Map<string, Set<unknown>>(),
}));

// Faithful mock: honors SET NX and DEL so withKvLock actually serializes.
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean; ex?: number }) => {
      void o?.ex;
      if (o?.nx && kvStore.has(k)) return null;
      kvStore.set(k, v);
      return "OK";
    },
    del: async (k: string) => (kvStore.delete(k) ? 1 : 0),
    sadd: async (k: string, ...m: unknown[]) => {
      const s = kvSets.get(k) ?? new Set<unknown>();
      for (const x of m) s.add(x);
      kvSets.set(k, s);
      return m.length;
    },
    smembers: async (k: string) => Array.from(kvSets.get(k) ?? []),
    sismember: async (k: string, m: unknown) => (kvSets.get(k)?.has(m) ? 1 : 0),
    scard: async (k: string) => kvSets.get(k)?.size ?? 0,
  },
}));

import {
  upsertRecord,
  getRecordByUrl,
  UrlTakenError,
  CuitTakenError,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";

function rec(id: string, publicUrl: string, operatorCuit?: string): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    name: `Co ${id}`,
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    ...(operatorCuit ? { operatorCuit } : {}),
    publicUrl,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "draft",
    listedSince: "2026-06-01",
    goodStanding: { state: "unverified", lastCheckedAt: null, lastScore: null, lastRating: null },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };
}

/** Race two upserts; exactly one must store, the other must reject with `err`. */
async function raceMustSerialize(
  a: RegistryRecord,
  b: RegistryRecord,
  err: string,
): Promise<void> {
  const settled = await Promise.allSettled([upsertRecord(a), upsertRecord(b)]);
  const wins = settled.filter((s) => s.status === "fulfilled" && s.value !== null);
  const losses = settled.filter((s) => s.status === "rejected");
  expect(wins, JSON.stringify(settled)).toHaveLength(1);
  expect(losses).toHaveLength(1);
  expect((losses[0] as PromiseRejectedResult).reason?.name).toBe(err);
}

describe("concurrent claim of the same origin (in-memory mode)", () => {
  beforeEach(() => {
    kvStore.clear();
    kvSets.clear();
    __resetMemoryForTests();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("ATTACK CLOSED: two racing self-lists of the SAME origin under different ids; second loses", async () => {
    await raceMustSerialize(
      rec("acme-uno", "https://claimed.example.com"),
      rec("acme-dos", "https://claimed.example.com"),
      "UrlTakenError",
    );
    // The by-url index resolves to exactly the surviving entry.
    const bound = await getRecordByUrl("https://claimed.example.com");
    expect(bound).not.toBeNull();
    expect(["acme-uno", "acme-dos"]).toContain(bound!.id);
  });

  it("ATTACK CLOSED: two racing self-lists declaring the SAME CUIT; second loses", async () => {
    await raceMustSerialize(
      rec("cuit-uno", "https://uno.example.com", "20-12345678-6"),
      rec("cuit-dos", "https://dos.example.com", "20-12345678-6"),
      "CuitTakenError",
    );
  });

  it("sequential behavior is unchanged: same-id update keeps its own origin", async () => {
    const first = rec("stable-co", "https://stable.example.com");
    expect(await upsertRecord(first)).not.toBeNull();
    // Updating the SAME id (its own origin) is always allowed.
    const updated = await upsertRecord({ ...first, name: "Co stable-co v2" });
    expect(updated?.name).toBe("Co stable-co v2");
    // A different id claiming that origin still fails sequentially.
    await expect(upsertRecord(rec("thief-co", "https://stable.example.com"))).rejects.toThrow(
      UrlTakenError,
    );
  });
});

describe("concurrent claim of the same origin (KV-wired mode, claim locks)", () => {
  beforeEach(() => {
    kvStore.clear();
    kvSets.clear();
    __resetMemoryForTests();
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "tok";
  });

  it("ATTACK CLOSED: the claim lock on the origin serializes two racing upserts; second loses", async () => {
    await raceMustSerialize(
      rec("kv-uno", "https://kv-claimed.example.com"),
      rec("kv-dos", "https://kv-claimed.example.com"),
      "UrlTakenError",
    );
    const bound = await getRecordByUrl("https://kv-claimed.example.com");
    expect(bound).not.toBeNull();
  });

  it("ATTACK CLOSED: the claim lock on the CUIT serializes two racing upserts; second loses", async () => {
    await raceMustSerialize(
      rec("kv-cuit-uno", "https://kv-uno.example.com", "20-12345678-6"),
      rec("kv-cuit-dos", "https://kv-dos.example.com", "20-12345678-6"),
      "CuitTakenError",
    );
  });

  it("no deadlock when both origin and CUIT are contended (deterministic lock order)", async () => {
    // Both racers claim the SAME origin AND the SAME CUIT: the sorted lock-key
    // order means they cannot each hold one lock while waiting for the other.
    await raceMustSerialize(
      rec("kv-both-uno", "https://kv-both.example.com", "20-12345678-6"),
      rec("kv-both-dos", "https://kv-both.example.com", "20-12345678-6"),
      "UrlTakenError",
    );
  });

  it("disjoint claims do not contend: two racing upserts with different origins both win", async () => {
    const settled = await Promise.allSettled([
      upsertRecord(rec("kv-free-uno", "https://kv-free-uno.example.com")),
      upsertRecord(rec("kv-free-dos", "https://kv-free-dos.example.com")),
    ]);
    expect(settled.every((s) => s.status === "fulfilled" && s.value !== null)).toBe(true);
  });

  it("CuitTakenError still propagates sequentially in KV mode", async () => {
    expect(
      await upsertRecord(rec("kv-seq-uno", "https://kv-seq-uno.example.com", "20-12345678-6")),
    ).not.toBeNull();
    await expect(
      upsertRecord(rec("kv-seq-dos", "https://kv-seq-dos.example.com", "20.12345678.6")),
    ).rejects.toThrow(CuitTakenError); // digit-normalized dedup
  });
});
