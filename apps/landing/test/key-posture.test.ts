import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/** KeyPosture: a PII-free key-control declaration (custodial vs ubo_controlled) on
 * the record, exposed additively in the signed oracle, settable by admin. Mirrors
 * the railPosture pattern. In-memory path. */

import {
  upsertRecord,
  getRecord,
  setKeyPosture,
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

describe("registry-store · setKeyPosture", () => {
  beforeEach(resetAll);

  it("merges the posture + stamps asOf; returns null for an unknown id", async () => {
    await upsertRecord(rec("kp1"));
    const r = await setKeyPosture("kp1", { mode: "custodial" });
    expect(r?.keyPosture?.mode).toBe("custodial");
    expect(r?.keyPosture?.asOf).toBeTruthy();
    // merge: a second call replaces mode but keeps stamping.
    const r2 = await setKeyPosture("kp1", { mode: "ubo_controlled" });
    expect(r2?.keyPosture?.mode).toBe("ubo_controlled");
    expect(await setKeyPosture("ghost", { mode: "custodial" })).toBeNull();
  });
});

describe("good-standing oracle · additive PII-free keyPosture", () => {
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

  it("exposes keyPosture when set (and the signed body still verifies)", async () => {
    await upsertRecord(rec("kp-oracle"));
    await setKeyPosture("kp-oracle", { mode: "ubo_controlled" });
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=kp-oracle"));
    const json = (await res.json()) as any;
    expect(json.body.keyPosture.mode).toBe("ubo_controlled");
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
  });

  it("omits keyPosture for an entity that has not declared one", async () => {
    await upsertRecord(rec("no-kp"));
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=no-kp"));
    const json = (await res.json()) as any;
    expect(json.body.keyPosture).toBeUndefined();
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
  });
});

describe("/api/admin/registry · target key-posture", () => {
  const TOKEN = "admin-kp";
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

  it("sets key posture (admin only), 404 for unknown id", async () => {
    await upsertRecord(rec("adm-kp"));
    expect((await adminPost(req({ id: "adm-kp", target: "key-posture", keyPosture: { mode: "custodial" } }, ""))).status).toBe(401);
    const ok = await adminPost(req({ id: "adm-kp", target: "key-posture", keyPosture: { mode: "custodial" } }));
    expect(ok.status).toBe(200);
    expect((await getRecord("adm-kp"))?.keyPosture?.mode).toBe("custodial");
    const miss = await adminPost(req({ id: "ghost", target: "key-posture", keyPosture: { mode: "custodial" } }));
    expect(miss.status).toBe(404);
  });

  it("ignores an invalid mode value (only the enum is stored)", async () => {
    await upsertRecord(rec("adm-kp2"));
    await adminPost(req({ id: "adm-kp2", target: "key-posture", keyPosture: { mode: "hsm" } }));
    const r = await getRecord("adm-kp2");
    expect(r?.keyPosture?.mode).toBeUndefined(); // bogus value dropped
    expect(r?.keyPosture?.asOf).toBeTruthy(); // posture still recorded
  });
});
