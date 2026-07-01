import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * Sprint 2 Part A: the public good-standing ORACLE answer must be
 * OFFLINE-VERIFIABLE by the SAME logic the existing `arg-verify attestation`
 * verb uses — i.e. sig = Ed25519(canonical(body)) where canonical sorts keys at
 * every level, sig is standard base64, and publicKey is a standard-base64 SPKI.
 *
 * This test signs with a REAL Ed25519 key (set via env), calls the route, then
 * recomputes the verification in a clean room (a canonical() copied from
 * arg-verify.mjs's normative serializer) — NOT importing the route's signer.
 * If they agree, the offline verifier verifies the oracle answer.
 */

// Stateful in-memory KV mock so listRecords/getRecordByUrl + setGoodStanding work.
const { kvStore, kvSets } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  kvSets: new Map<string, Set<unknown>>(),
}));
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown) => {
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
    del: async (k: string) => (kvStore.delete(k) ? 1 : 0),
    expire: async () => 1,
  },
}));

import { GET, OPTIONS } from "../src/app/api/registry/good-standing/route";
import {
  SEED,
  upsertRecord,
  getRecord,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";

// Real test keypair (generated for this test; matches /.well-known shape).
const PRIV_B64URL = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB_B64URL = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";
const PUB_B64STD = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5+fsvxAbVX4rQ9MLIQJzp63C5wM=";

// ── Clean-room canonical (copied from arg-verify.mjs §3, sorted keys) ──
function canonical(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") return JSON.stringify(value);
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** Verify {body,sig,publicKey} exactly like `arg-verify attestation`. */
function verifyOffline(att: { body: unknown; sig: string; publicKey: string }): boolean {
  const pub = createPublicKey({
    key: Buffer.from(att.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  return edVerify(
    null,
    Buffer.from(canonical(att.body), "utf8"),
    pub,
    Buffer.from(att.sig, "base64"),
  );
}

function req(qs: string): Request {
  return new Request(`https://ar-agents.ar/api/registry/good-standing?${qs}`);
}

const SEED_URL_ENTRY: RegistryRecord = SEED.find((s) => s.publicUrl.startsWith("http"))!;

describe("good-standing oracle", () => {
  // Default: stub ALL network. The FIX-9 anchor probe (/.well-known/agents.json)
  // and the certifier fan-out must never hit the real network in tests. A 404
  // default means targetAdvertisesAnchor() returns false (no target anchor).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let defaultFetchSpy: any;
  beforeEach(() => {
    kvStore.clear();
    kvSets.clear();
    __resetMemoryForTests();
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "tok";
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV_B64URL;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_B64URL;
    defaultFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 404 }));
  });
  afterEach(() => {
    defaultFetchSpy.mockRestore();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("400s when no query parameter is supplied", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("answers by url with a found record + good-standing + CORS", async () => {
    const res = await GET(req(`url=${encodeURIComponent(SEED_URL_ENTRY.publicUrl)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const json = (await res.json()) as Record<string, any>;
    expect(json.body.found).toBe(true);
    expect(json.body.record.id).toBe(SEED_URL_ENTRY.id);
    expect(json.body.goodStanding.state).toBe("active");
    // It forwards the trust-minimized public-anchor pointers, not just the AR sig.
    expect(json.body.attestation.publicAnchor).toContain("/api/audit/anchor");
    expect(json.body.attestation.publicAnchorOts).toContain("/ots");
  });

  it("the signed answer body verifies OFFLINE (mirrors arg-verify attestation)", async () => {
    const res = await GET(req(`url=${encodeURIComponent(SEED_URL_ENTRY.publicUrl)}`));
    const json = (await res.json()) as { body: unknown; sig: string; publicKey: string; alg: string };
    expect(json.alg).toBe("Ed25519");
    expect(json.publicKey).toBe(PUB_B64STD);
    expect(verifyOffline(json)).toBe(true);
  });

  it("C3: the signed body carries a future expiresAt (bounds offline replay)", async () => {
    const res = await GET(req(`url=${encodeURIComponent(SEED_URL_ENTRY.publicUrl)}`));
    const json = (await res.json()) as { body: { issuedAt: string; expiresAt: string } };
    expect(typeof json.body.expiresAt).toBe("string");
    expect(Date.parse(json.body.expiresAt)).toBeGreaterThan(Date.parse(json.body.issuedAt));
    expect(Date.parse(json.body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("C2: a SUSPENDED society answers attesting:false + state suspended, not active", async () => {
    const { setSuspended } = await import("../src/lib/suspension");
    const rec: RegistryRecord = {
      id: "susp-co",
      name: "Suspendible Automatizada",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Test",
      publicUrl: "https://susp-co.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "live",
      listedSince: "2026-01-01",
      goodStanding: {
        state: "active",
        lastCheckedAt: "2026-01-01T00:00:00.000Z",
        lastScore: 100,
        lastRating: "A",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      source: "formed",
      sessionId: "session-susp-123",
    };
    await upsertRecord(rec);

    // Before the kill-switch: active + attesting (no attesting flag emitted).
    const before = (await (await GET(req("id=susp-co"))).json()) as Record<string, any>;
    expect(before.body.goodStanding.state).toBe("active");
    expect(before.body.goodStanding.attesting).toBeUndefined();

    // Throw the art.102 kill-switch (keyed by the incorporation sessionId, a
    // SEPARATE store the oracle historically ignored — the C2 bug).
    await setSuspended("session-susp-123", true);

    const after = (await (await GET(req("id=susp-co"))).json()) as Record<string, any>;
    expect(after.body.goodStanding.state).toBe("suspended");
    expect(after.body.goodStanding.attesting).toBe(false);
    // And the answer must NOT carry a dimensional score for a killed entity.
    expect(after.body.goodStanding.dimensions).toBeUndefined();
  });

  it("a tampered body fails offline verification", async () => {
    const res = await GET(req(`url=${encodeURIComponent(SEED_URL_ENTRY.publicUrl)}`));
    const json = (await res.json()) as { body: any; sig: string; publicKey: string };
    // Flip the standing without re-signing.
    json.body.goodStanding.state = "revoked";
    expect(verifyOffline(json)).toBe(false);
  });

  it("answers by id, including a not-found shape for unknown ids", async () => {
    const ok = await GET(req(`id=${SEED[0].id}`));
    const okJson = (await ok.json()) as any;
    expect(okJson.body.found).toBe(true);
    expect(okJson.body.query.by).toBe("id");

    const miss = await GET(req("id=does-not-exist"));
    const missJson = (await miss.json()) as any;
    expect(miss.status).toBe(200);
    expect(missJson.body.found).toBe(false);
    expect(missJson.body.record).toBeNull();
    // A not-found answer is still signed + verifiable.
    expect(verifyOffline(missJson)).toBe(true);
  });

  it("?cuit= resolves an AUTHORITATIVE (verified) CUIT, normalized to digits", async () => {
    const now = new Date().toISOString();
    // An independently-verified CUIT (verifiedCuit:true) IS authoritative, so the
    // oracle resolves it and presents it inside the signed trust claim.
    await upsertRecord({
      id: "cuit-co",
      name: "CUIT Co",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Juan Pérez",
      operatorCuit: "20-12345678-6",
      verifiedCuit: true,
      publicUrl: "https://cuit-co.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "live",
      listedSince: now.slice(0, 10),
      goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
      createdAt: now,
      updatedAt: now,
      source: "self-listed",
    });
    const res = await GET(req("cuit=20-12345678-6"));
    const json = (await res.json()) as any;
    expect(json.body.found).toBe(true);
    expect(json.body.record.id).toBe("cuit-co");
    expect(json.body.query.by).toBe("cuit");
    // Authoritative → inside the trust claim as operatorCuit (not selfDeclaredCuit).
    expect(json.body.record.operatorCuit).toBe("20-12345678-6");
    expect(json.body.record.selfDeclaredCuit).toBeUndefined();
    // Normalized to digits.
    expect(json.body.query.value).toBe("20123456786");
  });

  it("ATTACK CLOSED: a self-declared CUIT does NOT resolve via ?cuit= (no impersonation)", async () => {
    const now = new Date().toISOString();
    // Attacker self-lists with a VICTIM's CUIT (unproven, source self-listed).
    await upsertRecord({
      id: "attacker-co",
      name: "Attacker Co",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Mallory",
      operatorCuit: "20-12345678-6", // the victim's CUIT, self-declared
      publicUrl: "https://attacker.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "live",
      listedSince: now.slice(0, 10),
      goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
      createdAt: now,
      updatedAt: now,
      source: "self-listed",
    });
    // The ?cuit= oracle must NOT resolve a self-declared CUIT → not found, no
    // signed "active" answer keyed on the victim's CUIT.
    const res = await GET(req("cuit=20-12345678-6"));
    const json = (await res.json()) as any;
    expect(json.body.found).toBe(false);
    expect(json.body.record).toBeNull();
    // The signed not-found answer still verifies (no tamper).
    expect(verifyOffline(json)).toBe(true);
  });

  it("ATTACK CLOSED: a self-declared CUIT is surfaced as selfDeclaredCuit, never operatorCuit, in the signed body", async () => {
    const now = new Date().toISOString();
    await upsertRecord({
      id: "selfdec-co",
      name: "SelfDeclared Co",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Juan Pérez",
      operatorCuit: "20-12345678-6",
      publicUrl: "https://selfdec.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "live",
      listedSince: now.slice(0, 10),
      goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
      createdAt: now,
      updatedAt: now,
      source: "self-listed",
    });
    const res = await GET(req(`url=${encodeURIComponent("https://selfdec.example.com")}`));
    const json = (await res.json()) as any;
    expect(json.body.found).toBe(true);
    // Outside the trust claim: selfDeclaredCuit set, operatorCuit absent.
    expect(json.body.record.selfDeclaredCuit).toBe("20-12345678-6");
    expect(json.body.record.operatorCuit).toBeUndefined();
  });

  it("the signed body carries the honest-scope basis (no overclaim)", async () => {
    const res = await GET(req(`url=${encodeURIComponent(SEED_URL_ENTRY.publicUrl)}`));
    const json = (await res.json()) as any;
    expect(json.body.goodStanding.basis).toContain("not a solvency");
    // The basis is INSIDE the signed body, so it travels with the artifact.
    expect(verifyOffline(json)).toBe(true);
  });

  it("rejects a private/loopback url (SSRF guard)", async () => {
    const res = await GET(req("url=http://localhost:8080"));
    expect(res.status).toBe(400);
  });

  it("default answers are cacheable; CORS preflight works", async () => {
    const res = await GET(req(`id=${SEED[0].id}`));
    expect(res.headers.get("cache-control")).toContain("max-age");
    const pre = await OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("ATTACK CLOSED: anonymous ?fresh=1 computes a verdict but does NOT persist (no durable write)", async () => {
    const now = "2026-01-01T00:00:00.000Z"; // old → not coalesced
    await upsertRecord({
      id: "fresh-co",
      name: "Fresh Co",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Juan Pérez",
      publicUrl: "https://fresh.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "draft",
      listedSince: "2026-01-01",
      // Prior stored verdict: UNVERIFIED, score 10.
      goodStanding: { state: "unverified", lastCheckedAt: now, lastScore: 10, lastRating: "F" },
      createdAt: now,
      updatedAt: now,
      source: "self-listed",
    });

    // Certifier returns a PASSING score; agents.json probe returns no anchor.
    defaultFetchSpy.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/certifier"))
        return new Response(JSON.stringify({ score: 95, rating: "A" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const res = await GET(req(`url=${encodeURIComponent("https://fresh.example.com")}&fresh=1`));
    const json = (await res.json()) as any;
    // The ANSWER reflects the freshly-computed verdict...
    expect(json.body.goodStanding.score).toBe(95);
    expect(json.body.goodStanding.state).toBe("active");
    // ...but STORAGE is untouched (no setGoodStanding for an anonymous caller).
    const stored = await getRecord("fresh-co");
    expect(stored?.goodStanding.lastScore).toBe(10);
    expect(stored?.goodStanding.state).toBe("unverified");
  });

  it("an OWNER ?fresh=1 DOES persist the fresh verdict", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    await upsertRecord({
      id: "fresh-owner-co",
      name: "Fresh Owner Co",
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: "Juan Pérez",
      publicUrl: "https://fresh-owner.example.com",
      rfcConformance: [],
      disclosure: { es: "x", en: "x" },
      status: "draft",
      listedSince: "2026-01-01",
      goodStanding: { state: "unverified", lastCheckedAt: now, lastScore: 10, lastRating: "F" },
      createdAt: now,
      updatedAt: now,
      source: "self-listed",
    });
    // Mint the owner token for this entry.
    const { mintCapabilityToken } = await import("../src/lib/capability-token");
    const ownerToken = await mintCapabilityToken("registry-owner", "rgo", "fresh-owner-co");
    expect(ownerToken).toBeTruthy();

    defaultFetchSpy.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/certifier"))
        return new Response(JSON.stringify({ score: 95, rating: "A" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const res = await GET(
      new Request(
        `https://ar-agents.ar/api/registry/good-standing?url=${encodeURIComponent("https://fresh-owner.example.com")}&fresh=1`,
        { headers: { "x-registry-token": ownerToken! } },
      ),
    );
    const json = (await res.json()) as any;
    expect(json.body.goodStanding.score).toBe(95);
    // Owner caller persists.
    const stored = await getRecord("fresh-owner-co");
    expect(stored?.goodStanding.lastScore).toBe(95);
    expect(stored?.goodStanding.state).toBe("active");
  });

  it("degrades gracefully when no signing key is configured (pointers still trust-minimized)", async () => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    const res = await GET(req(`id=${SEED[0].id}`));
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.sig).toBeUndefined();
    expect(json.body.attestation.publicAnchor).toContain("/api/audit/anchor");
  });
});
