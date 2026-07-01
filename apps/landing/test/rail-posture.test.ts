import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/** OUSD posture: a PII-free USD-rail declaration on the record, exposed additively
 * in the signed oracle, settable by admin. In-memory path. */

import {
  upsertRecord,
  getRecord,
  setRailPosture,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import { GET as oracleGet } from "../src/app/api/registry/good-standing/route";
import { POST as adminPost } from "../src/app/api/admin/registry/route";

const PRIV = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";

function canonical(v: unknown): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "number") return JSON.stringify(v);
  if (t === "string" || t === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
function verifyOffline(body: unknown, sig: string, pk: string): boolean {
  const pub = createPublicKey({ key: Buffer.from(pk, "base64"), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical(body), "utf8"), pub, Buffer.from(sig, "base64"));
}
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
function resetAll(): void {
  __resetMemoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("registry-store · setRailPosture", () => {
  beforeEach(resetAll);

  it("merges the posture + stamps asOf; returns null for an unknown id", async () => {
    await upsertRecord(rec("rp1"));
    const r = await setRailPosture("rp1", { usdRail: "ousd", ousdEnabled: true });
    expect(r?.railPosture?.usdRail).toBe("ousd");
    expect(r?.railPosture?.ousdEnabled).toBe(true);
    expect(r?.railPosture?.asOf).toBeTruthy();
    // merge: a second call keeps prior fields.
    const r2 = await setRailPosture("rp1", { yieldEnabled: true });
    expect(r2?.railPosture?.usdRail).toBe("ousd"); // preserved
    expect(r2?.railPosture?.yieldEnabled).toBe(true);
    expect(await setRailPosture("ghost", { usdRail: "ousd" })).toBeNull();
  });
});

describe("good-standing oracle · additive PII-free railPosture", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 404 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("exposes railPosture when set (and the signed body still verifies)", async () => {
    await upsertRecord(rec("rp-oracle"));
    await setRailPosture("rp-oracle", { usdRail: "ousd", ousdEnabled: true, yieldEnabled: false });
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=rp-oracle"));
    const json = (await res.json()) as any;
    expect(json.body.railPosture.usdRail).toBe("ousd");
    expect(json.body.railPosture.ousdEnabled).toBe(true);
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
  });

  it("omits railPosture for an entity that has not declared one", async () => {
    await upsertRecord(rec("no-rp"));
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=no-rp"));
    const json = (await res.json()) as any;
    expect(json.body.railPosture).toBeUndefined();
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
  });
});

describe("/api/admin/registry · target rail-posture", () => {
  const TOKEN = "admin-rp";
  beforeEach(() => {
    resetAll();
    process.env.REGISTRY_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => delete process.env.REGISTRY_ADMIN_TOKEN);

  function req(body: unknown, token = TOKEN): Request {
    return new Request("https://ar-agents.ar/api/admin/registry", {
      method: "POST",
      headers: token ? { "x-admin-token": token } : {},
      body: JSON.stringify(body),
    });
  }

  it("sets rail posture (admin only), 404 for unknown id", async () => {
    await upsertRecord(rec("adm-rp"));
    expect((await adminPost(req({ id: "adm-rp", target: "rail-posture", railPosture: { usdRail: "ousd", ousdEnabled: true } }, ""))).status).toBe(401);
    const ok = await adminPost(req({ id: "adm-rp", target: "rail-posture", railPosture: { usdRail: "ousd", ousdEnabled: true } }));
    expect(ok.status).toBe(200);
    expect((await getRecord("adm-rp"))?.railPosture?.usdRail).toBe("ousd");
    const miss = await adminPost(req({ id: "ghost", target: "rail-posture", railPosture: { usdRail: "ousd" } }));
    expect(miss.status).toBe(404);
  });

  it("ignores an invalid usdRail value (only the enum is stored)", async () => {
    await upsertRecord(rec("adm-rp2"));
    await adminPost(req({ id: "adm-rp2", target: "rail-posture", railPosture: { usdRail: "dogecoin", ousdEnabled: true } }));
    const r = await getRecord("adm-rp2");
    expect(r?.railPosture?.usdRail).toBeUndefined(); // bogus value dropped
    expect(r?.railPosture?.ousdEnabled).toBe(true); // valid field kept
  });
});
