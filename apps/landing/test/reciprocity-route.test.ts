import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** POST /api/registry/reciprocity/accept — the RFC-003 receiving-side endpoint:
 * verifies + accepts an AUTHENTIC portability bundle into a portable credit file. */

import { POST } from "../src/app/api/registry/reciprocity/accept/route";
import { upsertRecord, __resetMemoryForTests, type RegistryRecord } from "../src/lib/registry-store";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { __resetUboForTests } from "../src/lib/ubo";
import { buildBundle } from "../src/lib/portability-bundle";

const PRIV = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";
const NOW = "2026-06-15T00:00:00.000Z";

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
function reset(): void {
  __resetMemoryForTests();
  __resetHistoryForTests();
  __resetIncidentsForTests();
  __resetUboForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}
function post(body: unknown, rawOverride?: string): Request {
  return new Request("https://ar-agents.ar/api/registry/reciprocity/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawOverride ?? JSON.stringify(body),
  });
}

describe("/api/registry/reciprocity/accept", () => {
  beforeEach(() => {
    reset();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("accepts an authentic bundle with the DEFAULT (ar-agents) pin and emits a credit file", async () => {
    await upsertRecord(rec("rr-a"));
    const bundle = await buildBundle("rr-a", { now: NOW });
    const res = await POST(post({ bundle, targetJurisdiction: "US-WY" }));
    expect(res.status).toBe(200);
    const acc = await res.json();
    expect(acc.accepted).toBe(true);
    expect(acc.authenticity).toBe("confirmed");
    expect(acc.sourceJurisdiction).toBe("AR");
    expect(acc.targetJurisdiction).toBe("US-WY");
    expect(acc.portableCreditFile?.entityId).toBe("rr-a");
  });

  it("rejects (200 accepted:false) when the caller pins the WRONG key", async () => {
    await upsertRecord(rec("rr-b"));
    const bundle = await buildBundle("rr-b", { now: NOW });
    const res = await POST(post({ bundle, targetJurisdiction: "US-WY", pinnedPublicKey: "AAAAwrongkey" }));
    expect(res.status).toBe(200);
    const acc = await res.json();
    expect(acc.accepted).toBe(false);
    expect(acc.authenticity).toBe("failed");
    expect(acc.portableCreditFile).toBeNull();
  });

  it("400s on missing bundle / missing targetJurisdiction / invalid json", async () => {
    expect((await POST(post({ targetJurisdiction: "US-WY" }))).status).toBe(400);
    await upsertRecord(rec("rr-c"));
    const bundle = await buildBundle("rr-c", { now: NOW });
    expect((await POST(post({ bundle }))).status).toBe(400); // no targetJurisdiction
    expect((await POST(post(null, "{not json"))).status).toBe(400);
  });

  it("400s when no pin is available (no caller pin + no ar-agents key configured)", async () => {
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    await upsertRecord(rec("rr-d"));
    // bundle built while private key still set, but public key now unset for the request
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
    const bundle = await buildBundle("rr-d", { now: NOW });
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    const res = await POST(post({ bundle, targetJurisdiction: "US-WY" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pinnedPublicKey_required");
  });
});
