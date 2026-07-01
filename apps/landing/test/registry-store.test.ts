import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 2 Part A: registry-store KV-or-memory parity + seed fallback.
 *
 * A STATEFUL in-memory KV mock backs the @vercel/kv calls so we can run the
 * SAME assertions against the KV-wired path (KV_REST_API_URL set) and the
 * in-memory fallback path (KV_REST_API_URL unset) and prove they agree. We also
 * prove that a KV outage (mock throws) degrades to the SEED rather than 500ing.
 */

const { kvStore, kvSets, kvControl } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  kvSets: new Map<string, Set<unknown>>(),
  kvControl: { throwAll: false },
}));

function guard() {
  if (kvControl.throwAll) throw new Error("kv down");
}

vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => {
      guard();
      return kvStore.get(k) ?? null;
    },
    set: async (k: string, v: unknown) => {
      guard();
      kvStore.set(k, v);
      return "OK";
    },
    sadd: async (k: string, ...members: unknown[]) => {
      guard();
      const s = kvSets.get(k) ?? new Set<unknown>();
      for (const m of members) s.add(m);
      kvSets.set(k, s);
      return members.length;
    },
    smembers: async (k: string) => {
      guard();
      return Array.from(kvSets.get(k) ?? []);
    },
    sismember: async (k: string, m: unknown) => {
      guard();
      return (kvSets.get(k)?.has(m) ? 1 : 0) as number;
    },
    scard: async (k: string) => {
      guard();
      return kvSets.get(k)?.size ?? 0;
    },
  },
}));

import {
  SEED,
  listRecords,
  getRecord,
  getRecordByUrl,
  upsertRecord,
  createFormingStub,
  setGoodStanding,
  isSeedOrigin,
  hasAuthoritativeCuit,
  UrlTakenError,
  CuitTakenError,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";

// ── createFormingStub regression: the loop's SUPPLY side (HIGH/MEDIUM bugs the
//    post-merge Wave-1 review found). Uses the module-scoped resetAll()/KV mock. ──
describe("registry-store · createFormingStub (loop supply side)", () => {
  beforeEach(() => {
    resetAll();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });
  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("mints distinct stubs for two incorporations with the SAME declared CUIT (no false CuitTaken drop)", async () => {
    const a = await createFormingStub(
      { denominacion: "Sociedad Uno SA", tipo: "automatizada", representante: { nombre: "Juan Perez", cuit: "20-12345678-6" } },
      "sess-a",
    );
    const b = await createFormingStub(
      { denominacion: "Sociedad Dos SA", tipo: "automatizada", representante: { nombre: "Juan Perez", cuit: "20-12345678-6" } },
      "sess-b",
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
    expect(a!.status).toBe("forming");
    // The self-declared CUIT must NOT be an authoritative operatorCuit (that caused
    // the dedup-drop + enabled a CUIT-squat denial-of-registry).
    expect(a!.operatorCuit).toBeUndefined();
    expect(b!.operatorCuit).toBeUndefined();
  });

  it("a CUIT-squatter cannot block a victim's incorporation stub", async () => {
    await createFormingStub(
      { denominacion: "Squatter SA", tipo: "automatizada", representante: { cuit: "27-99999999-3" } },
      "sess-attacker",
    );
    const victim = await createFormingStub(
      { denominacion: "Victima Real SA", tipo: "automatizada", representante: { cuit: "27-99999999-3" } },
      "sess-victim",
    );
    expect(victim).not.toBeNull();
    expect(victim!.status).toBe("forming");
  });

  it("a denominacion that slugifies to <2 chars still mints a stub (ID_RE fallback)", async () => {
    const s = await createFormingStub({ denominacion: "X", tipo: "automatizada" }, "sess-x");
    expect(s).not.toBeNull();
    expect(s!.id.length).toBeGreaterThanOrEqual(2);
    expect(s!.status).toBe("forming");
  });

  it("is idempotent per sessionId (a retry returns the same stub, no second entity)", async () => {
    const first = await createFormingStub({ denominacion: "Idem SA", tipo: "automatizada" }, "sess-idem");
    const again = await createFormingStub({ denominacion: "Idem SA", tipo: "automatizada" }, "sess-idem");
    expect(first).not.toBeNull();
    expect(again!.id).toBe(first!.id);
    expect((await listRecords()).filter((r) => r.source === "formed").length).toBe(1);
  });
});

function makeRecord(id: string, url: string): RegistryRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `Test ${id}`,
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Pérez",
    operatorCuit: "20-12345678-6",
    publicUrl: url,
    rfcConformance: ["rfc-001-v1"],
    disclosure: { es: "demo", en: "demo" },
    status: "draft",
    listedSince: now.slice(0, 10),
    goodStanding: { state: "unverified", lastCheckedAt: null, lastScore: null, lastRating: null },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };
}

function resetAll() {
  kvStore.clear();
  kvSets.clear();
  kvControl.throwAll = false;
  __resetMemoryForTests();
}

const KV_ENV = {
  KV_REST_API_URL: "https://example.upstash.io",
  KV_REST_API_TOKEN: "tok",
};

// Run the parity block under both backends.
for (const backend of ["in-memory", "vercel-kv"] as const) {
  describe(`registry-store · ${backend}`, () => {
    beforeEach(() => {
      resetAll();
      if (backend === "vercel-kv") {
        process.env.KV_REST_API_URL = KV_ENV.KV_REST_API_URL;
        process.env.KV_REST_API_TOKEN = KV_ENV.KV_REST_API_TOKEN;
      } else {
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
      }
    });
    afterEach(() => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    });

    it("listRecords returns the full seed when the store is empty", async () => {
      const recs = await listRecords();
      expect(recs.length).toBe(SEED.length);
      for (const s of SEED) {
        expect(recs.find((r) => r.id === s.id)).toBeTruthy();
      }
    });

    it("upsert adds a new record visible in listRecords + getRecord", async () => {
      const rec = makeRecord("acme-bot", "https://acme.example.com");
      const stored = await upsertRecord(rec);
      expect(stored).toBeTruthy();
      const all = await listRecords();
      expect(all.length).toBe(SEED.length + 1);
      const got = await getRecord("acme-bot");
      expect(got?.publicUrl).toBe("https://acme.example.com");
    });

    it("getRecordByUrl resolves a stored record by origin (path-insensitive)", async () => {
      await upsertRecord(makeRecord("acme-bot", "https://acme.example.com"));
      const byUrl = await getRecordByUrl("https://acme.example.com/some/path?q=1");
      expect(byUrl?.id).toBe("acme-bot");
    });

    it("getRecordByUrl resolves a SEED entry by origin without an index", async () => {
      const seedWithUrl = SEED.find((s) => s.publicUrl.startsWith("http"))!;
      const byUrl = await getRecordByUrl(seedWithUrl.publicUrl);
      expect(byUrl?.id).toBe(seedWithUrl.id);
    });

    it("KV wins on id collision with the seed", async () => {
      const seedId = SEED[0].id;
      const override = makeRecord(seedId, "https://override.example.com");
      override.name = "OVERRIDDEN";
      await upsertRecord(override);
      const all = await listRecords();
      const hit = all.find((r) => r.id === seedId);
      expect(hit?.name).toBe("OVERRIDDEN");
      // And the count is unchanged (override, not append).
      expect(all.length).toBe(SEED.length);
    });

    it("setGoodStanding patches state + materializes a seed entry", async () => {
      const seedId = SEED[0].id;
      const updated = await setGoodStanding(seedId, {
        state: "suspended",
        reason: "test",
        lastCheckedAt: "2026-06-29T00:00:00.000Z",
        lastScore: 30,
        lastRating: "F",
      });
      expect(updated?.goodStanding.state).toBe("suspended");
      expect(updated?.goodStanding.reason).toBe("test");
      // Re-read goes through KV-wins, so the patch persists.
      const reread = await getRecord(seedId);
      expect(reread?.goodStanding.state).toBe("suspended");
    });

    it("rejects an invalid id on upsert", async () => {
      const bad = makeRecord("Bad ID!", "https://x.example.com");
      const stored = await upsertRecord(bad);
      expect(stored).toBeNull();
    });

    // ── FIX 2: by-url index hijack ─────────────────────────────────────────
    it("ATTACK CLOSED: a self-list claiming a SEED origin is refused (url_taken)", async () => {
      const seedOrigin = "https://ar-agents.ar"; // the reference-impl seed origin
      expect(isSeedOrigin(seedOrigin)).toBe(true);
      const hijack = makeRecord("evil-twin", seedOrigin);
      await expect(upsertRecord(hijack)).rejects.toBeInstanceOf(UrlTakenError);
      // Nothing was written: the id is absent and the seed origin still resolves
      // to the seed entry, not the attacker.
      expect(await getRecord("evil-twin")).toBeNull();
      const byUrl = await getRecordByUrl(seedOrigin);
      expect(byUrl?.source).toBe("seed");
    });

    it("ATTACK CLOSED: a self-list claiming an origin already bound to another id is refused", async () => {
      await upsertRecord(makeRecord("first-co", "https://shared.example.com"));
      const second = makeRecord("second-co", "https://shared.example.com");
      await expect(upsertRecord(second)).rejects.toBeInstanceOf(UrlTakenError);
      expect(await getRecord("second-co")).toBeNull();
      // The origin still belongs to the first claimant.
      expect((await getRecordByUrl("https://shared.example.com"))?.id).toBe("first-co");
    });

    it("ATTACK CLOSED: a self-list reusing another entry's operatorCuit is refused (cuit_taken)", async () => {
      const a = makeRecord("victim-co", "https://victim.example.com");
      a.operatorCuit = "20-99999999-7";
      await upsertRecord(a);
      const attacker = makeRecord("attacker-co", "https://attacker.example.com");
      attacker.operatorCuit = "20-99999999-7"; // same CUIT, different entry
      await expect(upsertRecord(attacker)).rejects.toBeInstanceOf(CuitTakenError);
      expect(await getRecord("attacker-co")).toBeNull();
    });

    it("ATTACK CLOSED: a poisoned by-url index never returns a mismatched record", async () => {
      // Legitimate entry at origin A.
      await upsertRecord(makeRecord("real-co", "https://real.example.com"));
      // Simulate a poisoned/stale index: bind origin B to real-co's id, even
      // though real-co's publicUrl origin is A. getRecordByUrl(B) must NOT return
      // real-co (origin mismatch) — it falls back to the structural scan (no match).
      const poisoned = await getRecordByUrl("https://real.example.com");
      expect(poisoned?.id).toBe("real-co");
      // A query for a DIFFERENT origin with no real entry returns null, never the
      // wrong record, even if an index pointed there.
      const wrong = await getRecordByUrl("https://unrelated.example.com");
      expect(wrong).toBeNull();
    });

    it("allows updating an existing entry without tripping the claim-guard", async () => {
      await upsertRecord(makeRecord("update-co", "https://update.example.com"));
      // Re-upsert same id + same origin (an update) is fine.
      const again = makeRecord("update-co", "https://update.example.com");
      again.name = "Renamed";
      const stored = await upsertRecord(again);
      expect(stored?.name).toBe("Renamed");
      // setGoodStanding (an update path) on a SEED entry materializes it without
      // tripping the seed-origin guard.
      const sg = await setGoodStanding(SEED[0].id, {
        state: "suspended",
        reason: "admin test",
      });
      expect(sg?.goodStanding.state).toBe("suspended");
    });
  });
}

describe("registry-store · CUIT authority", () => {
  beforeEach(() => {
    resetAll();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("a self-declared CUIT is NOT authoritative; seed/verified CUIT is", () => {
    const selfListed: RegistryRecord = {
      ...makeRecord("x", "https://x.example.com"),
      operatorCuit: "20-12345678-6",
      source: "self-listed",
    };
    expect(hasAuthoritativeCuit(selfListed)).toBe(false);
    expect(hasAuthoritativeCuit({ ...selfListed, verifiedCuit: true })).toBe(true);
    expect(hasAuthoritativeCuit({ ...selfListed, source: "seed" })).toBe(true);
    // No CUIT at all → not authoritative.
    expect(
      hasAuthoritativeCuit({ ...selfListed, operatorCuit: undefined, source: "seed" }),
    ).toBe(false);
  });
});

describe("registry-store · seed fallback on KV outage", () => {
  beforeEach(() => {
    resetAll();
    process.env.KV_REST_API_URL = KV_ENV.KV_REST_API_URL;
    process.env.KV_REST_API_TOKEN = KV_ENV.KV_REST_API_TOKEN;
  });
  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("listRecords NEVER throws and returns the seed when KV is down", async () => {
    kvControl.throwAll = true;
    const recs = await listRecords();
    expect(recs.length).toBe(SEED.length);
  });

  it("getRecord falls back to the seed when KV is down", async () => {
    kvControl.throwAll = true;
    const got = await getRecord(SEED[0].id);
    expect(got?.id).toBe(SEED[0].id);
  });

  it("getRecordByUrl falls back to the seed scan when KV is down", async () => {
    kvControl.throwAll = true;
    const seedWithUrl = SEED.find((s) => s.publicUrl.startsWith("http"))!;
    const got = await getRecordByUrl(seedWithUrl.publicUrl);
    expect(got?.id).toBe(seedWithUrl.id);
  });
});
