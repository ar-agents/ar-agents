import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * /api/registry/portability — owner/admin gated PII export. Fail-closed auth,
 * header-only token, no CORS, no-store, 503 when unsigned, and NEVER advertised on
 * a public/agent-discoverable surface.
 */

import { GET } from "../src/app/api/registry/portability/route";
import { GET as discoveryGet } from "../src/app/api/discovery/route";
import { openApiSpec } from "../src/lib/openapi-spec";
import { mintCapabilityToken } from "../src/lib/capability-token";
import { upsertRecord, __resetMemoryForTests, type RegistryRecord } from "../src/lib/registry-store";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { __resetUboForTests } from "../src/lib/ubo";

const PRIV = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";
const ADMIN = "admin-portability-token";

function rec(id: string): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id, name: "Test Co", type: "productive-sociedad-ia", jurisdiction: "AR", operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`, rfcConformance: [], disclosure: { es: "x", en: "x" },
    status: "live", listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
    createdAt: now, updatedAt: now, source: "self-listed",
  };
}

function req(id: string | null, headers: Record<string, string> = {}, query = ""): Request {
  const q = id ? `?id=${id}${query}` : `?${query}`;
  return new Request(`https://ar-agents.ar/api/registry/portability${q}`, { headers });
}

function reset(): void {
  __resetMemoryForTests();
  __resetHistoryForTests();
  __resetIncidentsForTests();
  __resetUboForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("/api/registry/portability · auth gating (fail-closed)", () => {
  beforeEach(() => {
    reset();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
    process.env.REGISTRY_ADMIN_TOKEN = ADMIN;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });

  it("400 on missing id", async () => {
    expect((await GET(req(null))).status).toBe(400);
  });

  it("401 with no token", async () => {
    await upsertRecord(rec("rt-a"));
    expect((await GET(req("rt-a"))).status).toBe(401);
  });

  it("401 with a wrong admin token", async () => {
    await upsertRecord(rec("rt-b"));
    expect((await GET(req("rt-b", { "x-admin-token": "nope" }))).status).toBe(401);
  });

  it("200 with the admin token; headers are no-store and NOT CORS-open", async () => {
    await upsertRecord(rec("rt-c"));
    const res = await GET(req("rt-c", { "x-admin-token": ADMIN }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const bundle = await res.json();
    expect(bundle.kind).toBe("ar-agents.portability.bundle.v1");
  });

  it("200 with a valid per-entry owner token via header", async () => {
    await upsertRecord(rec("rt-d"));
    const token = await mintCapabilityToken("registry-owner", "srt", "rt-d");
    expect(token).toBeTruthy();
    const res = await GET(req("rt-d", { "x-registry-token": token as string }));
    expect(res.status).toBe(200);
  });

  it("401 when the owner token is passed as a query param, not a header", async () => {
    await upsertRecord(rec("rt-e"));
    const token = await mintCapabilityToken("registry-owner", "srt", "rt-e");
    const res = await GET(req("rt-e", {}, `&token=${token}`));
    expect(res.status).toBe(401);
  });

  it("503 when authorized but the signing key is unavailable (never emit unsigned PII)", async () => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    await upsertRecord(rec("rt-f"));
    const res = await GET(req("rt-f", { "x-admin-token": ADMIN }));
    expect(res.status).toBe(503);
  });

  it("pii=0 returns the shareable subset (operator redacted)", async () => {
    await upsertRecord(rec("rt-g"));
    const res = await GET(req("rt-g", { "x-admin-token": ADMIN }, "&pii=0"));
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.body.includesPii).toBe(false);
    expect(bundle.sections.record.operator).toBe("[redacted]");
  });
});

describe("/api/registry/portability · not advertised on any discoverable surface", () => {
  it("the PII export route is absent from openapi + /api/discovery", async () => {
    expect(JSON.stringify(openApiSpec)).not.toMatch(/registry\/portability/);
    const disc = await discoveryGet(new Request("https://ar-agents.ar/api/discovery"));
    expect(JSON.stringify(await disc.json())).not.toMatch(/registry\/portability/);
  });
});
