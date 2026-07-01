import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 2 — adversarial security review: route-level "attack CLOSED" proofs.
 *
 * Covers the holes the review found in the signed good-standing / certifier path:
 *  - FIX 1: cert issuance must bind the certified URL to an OWNED registry entry
 *           (a token-holder for X cannot mint a cert for some other origin).
 *  - FIX 4: a GLOBAL ar-agents admin (REGISTRY_ADMIN_TOKEN) can revoke a cert AND
 *           suspend an entry's good-standing WITHOUT the owner token; a later
 *           passing certifier run must NOT un-suspend a manual sanction.
 *  - FIX 7: PATCH is kv-rate-limited (fail-closed) and a direct status:"live" is
 *           NOT honored unless the entry has certified >= C.
 *
 * A stateful in-memory @vercel/kv mock backs the stores. `fetch` is mocked so the
 * server-side certifier returns a controllable verdict (no network).
 */

const { kvStore, kvSets } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  kvSets: new Map<string, Set<unknown>>(),
}));

vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && kvStore.has(k)) return null;
      kvStore.set(k, v);
      return "OK";
    },
    sadd: async (k: string, ...m: unknown[]) => {
      const s = kvSets.get(k) ?? new Set<unknown>();
      for (const x of m) s.add(x);
      kvSets.set(k, s);
      return m.length;
    },
    smembers: async (k: string) => Array.from(kvSets.get(k) ?? []),
    sismember: async (k: string, m: unknown) => (kvSets.get(k)?.has(m) ? 1 : 0),
    scard: async (k: string) => kvSets.get(k)?.size ?? 0,
    incr: async (k: string) => {
      const n = ((kvStore.get(k) as number) ?? 0) + 1;
      kvStore.set(k, n);
      return n;
    },
    // del is used by the withKvLock compare-and-release; a faithful mock must
    // implement it or a held lock would never be freed within a test.
    del: async (k: string) => (kvStore.delete(k) ? 1 : 0),
    expire: async () => 1,
  },
}));

import { POST as ISSUE } from "../src/app/api/certifier/issue/route";
import { POST as REVOKE } from "../src/app/api/certifier/revoke/route";
import { PATCH as REGISTRY_PATCH } from "../src/app/api/registry/route";
import {
  upsertRecord,
  getRecord,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import {
  __resetMemForTests as resetCerts,
  getLatestForUrl,
  getCertificate,
} from "../src/lib/certificate";
import { mintCapabilityToken } from "../src/lib/capability-token";

// Real Ed25519 keypair (so issued certs actually sign).
const PRIV = "MC4CAQAwBQYDK2VwBCIEIGW8zyK1X-q0ILg2EjyzDdZU43pHsva8CfRRZ_ZibcGv";
const PUB = "MCowBQYDK2VwAyEAjFW5_BXTil8F7Jxhg269rWf7ulhKbo_mVHGf7bBwAoA";

const ADMIN = "global-admin-secret-token-abc123";

function freshRecord(id: string, origin: string): RegistryRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `Co ${id}`,
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Pérez",
    publicUrl: origin,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "live",
    listedSince: now.slice(0, 10),
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 90, lastRating: "A" },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };
}

/** Certifier verdict the mocked fetch returns. Mutable per-test. */
let CERTIFIER_VERDICT = { score: 95, rating: "A" as const };

function installFetchMock() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.includes("/api/certifier")) {
      return new Response(
        JSON.stringify({
          score: CERTIFIER_VERDICT.score,
          rating: CERTIFIER_VERDICT.rating,
          rfcConformance: { "rfc-002-v1": "pass", "rfc-004-draft": "pass" },
        }),
        { status: 200 },
      );
    }
    // conformance-history POST + any well-known probe.
    return new Response("{}", { status: 404 });
  });
}

let fetchSpy: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
  __resetMemoryForTests();
  resetCerts();
  process.env.KV_REST_API_URL = "https://example.upstash.io";
  process.env.KV_REST_API_TOKEN = "tok";
  process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
  process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  process.env.REGISTRY_ADMIN_TOKEN = ADMIN;
  CERTIFIER_VERDICT = { score: 95, rating: "A" };
  fetchSpy = installFetchMock();
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUDIT_ED25519_PRIVATE_KEY;
  delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  delete process.env.REGISTRY_ADMIN_TOKEN;
});

function issueReq(body: unknown, token: string): Request {
  return new Request("https://ar-agents.ar/api/certifier/issue", {
    method: "POST",
    headers: { "content-type": "application/json", "x-registry-token": token },
    body: JSON.stringify(body),
  });
}

describe("FIX 1 — cert issuance binds the URL to an OWNED registry entry", () => {
  it("ATTACK CLOSED: a token-holder for X cannot mint a cert for another origin", async () => {
    await upsertRecord(freshRecord("acme-co", "https://acme.example.com"));
    const token = await mintCapabilityToken("registry-owner", "rgo", "acme-co");
    expect(token).toBeTruthy();

    // Try to certify a DIFFERENT origin than the owned entry's publicUrl.
    const res = await ISSUE(
      issueReq({ url: "https://other.example.com", registryId: "acme-co" }, token!),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error).toBe("url_not_owned");
    // No cert was minted for the foreign origin.
    expect(await getLatestForUrl("https://other.example.com")).toBeNull();
  });

  it("issuing for the OWNED origin succeeds and stamps subject FROM the record", async () => {
    await upsertRecord(freshRecord("good-co", "https://good.example.com"));
    const token = await mintCapabilityToken("registry-owner", "rgo", "good-co");
    const res = await ISSUE(
      issueReq(
        // Caller tries to spoof operator/jurisdiction in the body — must be ignored.
        {
          url: "https://good.example.com/some/path",
          registryId: "good-co",
          operator: "SPOOFED",
          jurisdiction: "US",
        },
        token!,
      ),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.certificate.subject.baseUrl).toBe("https://good.example.com");
    // Subject identity comes from the RECORD, not the spoofed body fields.
    expect(json.certificate.subject.operator).toBe("Juan Pérez");
    expect(json.certificate.subject.jurisdiction).toBe("AR");
  });

  it("404s when the registry entry does not exist", async () => {
    const token = await mintCapabilityToken("registry-owner", "rgo", "ghost-co");
    const res = await ISSUE(
      issueReq({ url: "https://ghost.example.com", registryId: "ghost-co" }, token!),
    );
    expect(res.status).toBe(404);
  });
});

describe("FIX 4 — admin teeth: revoke + suspend without the owner token", () => {
  it("ATTACK CLOSED: a global admin revokes a cert AND suspends good-standing without the owner token; a passing certifier never un-suspends it", async () => {
    // 1. A self-listed entry with a passing cert (owner mints it).
    await upsertRecord(freshRecord("lapsed-co", "https://lapsed.example.com"));
    const owner = await mintCapabilityToken("registry-owner", "rgo", "lapsed-co");
    const issued = await ISSUE(
      issueReq({ url: "https://lapsed.example.com", registryId: "lapsed-co" }, owner!),
    );
    expect(issued.status).toBe(201);
    const certId = ((await issued.json()) as any).certificate.certId as string;

    // 2. ADMIN revokes the cert with ONLY the global admin token (no owner token).
    const revRes = await REVOKE(
      new Request("https://ar-agents.ar/api/certifier/revoke", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": ADMIN },
        body: JSON.stringify({ certId, reason: "fraud detected" }),
      }),
    );
    expect(revRes.status).toBe(200);
    const revJson = (await revRes.json()) as any;
    expect(revJson.by).toBe("admin");
    expect(revJson.certificate.status).toBe("revoked");
    expect((await getCertificate(certId))!.status).toBe("revoked");

    // 3. ADMIN suspends the entry's good-standing via PATCH, again no owner token.
    const susRes = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-token": ADMIN },
        body: JSON.stringify({
          id: "lapsed-co",
          goodStanding: { state: "suspended", reason: "fraud detected" },
        }),
      }),
    );
    expect(susRes.status).toBe(200);
    expect(((await susRes.json()) as any).by).toBe("admin");
    expect((await getRecord("lapsed-co"))!.goodStanding.state).toBe("suspended");

    // 4. A later PASSING certifier re-cert (owner changes the URL, score 95)
    //    must NOT un-suspend the manual sanction.
    CERTIFIER_VERDICT = { score: 95, rating: "A" };
    const recertRes = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-registry-token": owner! },
        body: JSON.stringify({ id: "lapsed-co", publicUrl: "https://lapsed-v2.example.com" }),
      }),
    );
    expect(recertRes.status).toBe(200);
    const after = await getRecord("lapsed-co");
    expect(after!.goodStanding.state).toBe("suspended"); // STILL suspended
  });

  it("an admin good-standing override WITHOUT the admin token is rejected (fail-closed)", async () => {
    await upsertRecord(freshRecord("nope-co", "https://nope.example.com"));
    const res = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "nope-co", goodStanding: { state: "suspended" } }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await getRecord("nope-co"))!.goodStanding.state).toBe("active");
  });

  it("admin override is UNAVAILABLE when REGISTRY_ADMIN_TOKEN is unset (fail-closed)", async () => {
    delete process.env.REGISTRY_ADMIN_TOKEN;
    await upsertRecord(freshRecord("env-co", "https://env.example.com"));
    const res = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-token": ADMIN },
        body: JSON.stringify({ id: "env-co", goodStanding: { state: "suspended" } }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await getRecord("env-co"))!.goodStanding.state).toBe("active");
  });
});

describe("FIX 7 — PATCH does not honor a hand-set status:live without a passing cert", () => {
  it("ATTACK CLOSED: an owner cannot flip status to live by hand on an unverified entry", async () => {
    // A self-listed entry that has NOT certified (unverified, low score).
    const rec = freshRecord("hand-co", "https://hand.example.com");
    rec.status = "draft";
    rec.goodStanding = {
      state: "unverified",
      lastCheckedAt: new Date().toISOString(),
      lastScore: 10,
      lastRating: "F",
    };
    await upsertRecord(rec);
    const owner = await mintCapabilityToken("registry-owner", "rgo", "hand-co");

    const res = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-registry-token": owner! },
        body: JSON.stringify({ id: "hand-co", status: "live" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    // The status was downgraded to draft (not honored as live).
    expect(json.record.status).toBe("draft");
    expect((await getRecord("hand-co"))!.status).toBe("draft");
  });

  it("an owner CAN go live when the entry has certified >= C", async () => {
    const rec = freshRecord("passed-co", "https://passed.example.com");
    rec.status = "draft";
    rec.goodStanding = {
      state: "active",
      lastCheckedAt: new Date().toISOString(),
      lastScore: 80, // >= C
      lastRating: "B",
    };
    await upsertRecord(rec);
    const owner = await mintCapabilityToken("registry-owner", "rgo", "passed-co");
    const res = await REGISTRY_PATCH(
      new Request("https://ar-agents.ar/api/registry", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-registry-token": owner! },
        body: JSON.stringify({ id: "passed-co", status: "live" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).record.status).toBe("live");
  });
});
