import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PATCH /api/registry re-cert lost-update: the certifier runs UNLOCKED for up
 * to 12s, and the branch used to blind-write the whole pre-certifier snapshot
 * afterwards, so a concurrent admin revoke/suspend landed during the certifier
 * was clobbered (goodStanding written from the stale snapshot) and the status
 * flip bypassed the validated lifecycle. The fix re-reads the latest record
 * after the certifier, merges ONLY the certification-result fields, and routes
 * the status change through transitionStatus.
 *
 * The concurrent admin action is injected by making the mocked certifier fetch
 * itself mutate the store before returning its verdict. In-memory mode.
 * Fictional PII only (Juan Perez).
 */

const { kvStore } = vi.hoisted(() => ({ kvStore: new Map<string, unknown>() }));
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
    incr: async (k: string) => {
      const n = ((kvStore.get(k) as number) ?? 0) + 1;
      kvStore.set(k, n);
      return n;
    },
    expire: async () => 1,
  },
}));

import { PATCH as REGISTRY_PATCH } from "../src/app/api/registry/route";
import {
  upsertRecord,
  getRecord,
  setGoodStanding,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import { __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { mintCapabilityToken } from "../src/lib/capability-token";

function rec(id: string, status: RegistryRecord["status"] = "live"): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    name: `Co ${id}`,
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    publicUrl: `https://old-${id}.example.com`,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status,
    listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 90, lastRating: "A" },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };
}

/** Verdict + a side-effect that runs DURING the certifier window (before it returns). */
let CERTIFIER: {
  score: number;
  rating: string;
  duringCertifier?: () => Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.9.0.${ipCounter}`;
}

beforeEach(() => {
  kvStore.clear();
  __resetMemoryForTests();
  __resetIncidentsForTests();
  __resetHistoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  CERTIFIER = { score: 95, rating: "A" };
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/api/certifier")) {
      // Simulate the concurrent write landing while the certifier is running.
      if (CERTIFIER.duringCertifier) await CERTIFIER.duringCertifier();
      return new Response(
        JSON.stringify({ score: CERTIFIER.score, rating: CERTIFIER.rating }),
        { status: 200 },
      );
    }
    // conformance-history trend POST + anything else: harmless.
    return new Response("{}", { status: 200 });
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

async function patchUrl(id: string, ownerToken: string, publicUrl: string): Promise<Response> {
  return REGISTRY_PATCH(
    new Request("https://ar-agents.ar/api/registry", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-registry-token": ownerToken,
        "x-vercel-forwarded-for": freshIp(),
      },
      body: JSON.stringify({ id, publicUrl }),
    }),
  );
}

describe("PATCH re-cert vs concurrent admin sanction", () => {
  it("ATTACK CLOSED: a record revoked DURING the certifier run is not resurrected", async () => {
    const id = "revoke-race-co";
    await upsertRecord(rec(id));
    const owner = (await mintCapabilityToken("registry-owner", "rgo", id))!;

    CERTIFIER = {
      score: 95,
      rating: "A",
      duringCertifier: async () => {
        // The admin kill lands while the (slow, unlocked) certifier is running.
        await setGoodStanding(id, { state: "revoked", reason: "kill-switch" });
      },
    };

    const res = await patchUrl(id, owner, `https://new-${id}.example.com`);
    expect(res.status).toBe(200); // handled, not a 500
    const body = (await res.json()) as { record: RegistryRecord; recertified: { passed: boolean } };
    // The PASSING verdict must not clear the revocation nor flip the entry live.
    expect(body.record.goodStanding.state).toBe("revoked");
    expect(body.record.status).not.toBe("live");
    const after = (await getRecord(id))!;
    expect(after.goodStanding.state).toBe("revoked");
    expect(after.goodStanding.reason).toBe("kill-switch");
    expect(after.status).toBe("draft");
  });

  it("ATTACK CLOSED: a record suspended DURING the certifier run stays suspended", async () => {
    const id = "suspend-race-co";
    await upsertRecord(rec(id));
    const owner = (await mintCapabilityToken("registry-owner", "rgo", id))!;

    CERTIFIER = {
      score: 95,
      rating: "A",
      duringCertifier: async () => {
        await setGoodStanding(id, { state: "suspended", reason: "fraud review" });
      },
    };

    const res = await patchUrl(id, owner, `https://new-${id}.example.com`);
    expect(res.status).toBe(200);
    const after = (await getRecord(id))!;
    expect(after.goodStanding.state).toBe("suspended");
    expect(after.goodStanding.reason).toBe("fraud review");
    expect(after.status).toBe("draft"); // never live while sanctioned
    // The cert result fields were merged onto the LATEST record, not a stale snapshot.
    expect(after.goodStanding.lastScore).toBe(95);
  });

  it("happy path: an uncontended passing re-cert flips the entry live via the lifecycle", async () => {
    const id = "happy-recert-co";
    await upsertRecord(rec(id, "draft"));
    const owner = (await mintCapabilityToken("registry-owner", "rgo", id))!;

    CERTIFIER = { score: 88, rating: "B" };
    const res = await patchUrl(id, owner, `https://new-${id}.example.com`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      record: RegistryRecord;
      recertified: { score: number; passed: boolean };
    };
    expect(body.recertified.passed).toBe(true);
    expect(body.record.status).toBe("live");
    expect(body.record.goodStanding.state).toBe("active");
    expect(body.record.goodStanding.lastScore).toBe(88);
    expect((await getRecord(id))!.status).toBe("live");
  });

  it("a failing re-cert demotes to draft/unverified (no sanction involved)", async () => {
    const id = "fail-recert-co";
    await upsertRecord(rec(id));
    const owner = (await mintCapabilityToken("registry-owner", "rgo", id))!;

    CERTIFIER = { score: 20, rating: "F" };
    const res = await patchUrl(id, owner, `https://new-${id}.example.com`);
    expect(res.status).toBe(200);
    const after = (await getRecord(id))!;
    expect(after.status).toBe("draft");
    expect(after.goodStanding.state).toBe("unverified");
    expect(after.goodStanding.lastScore).toBe(20);
  });
});
