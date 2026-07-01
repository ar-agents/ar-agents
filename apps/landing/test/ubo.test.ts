import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * V2-9 UBO primitive: profile + signed self-attested link + bankable predicate +
 * the PII-FREE oracle status block + the admin route. In-memory path.
 */

import {
  setUboProfile,
  linkUbo,
  getUboProfile,
  getUboLink,
  bankablePredicate,
  getUboStatus,
  uboLinkCore,
  UboVerificationNotAvailableError,
  MIN_BANKABLE_LEVEL,
  __resetUboForTests,
} from "../src/lib/ubo";
import { upsertRecord, __resetMemoryForTests, type RegistryRecord } from "../src/lib/registry-store";
import { GET as oracleGet } from "../src/app/api/registry/good-standing/route";
import { GET as uboGet, POST as uboPost } from "../src/app/api/admin/registry/ubo/route";

const PRIV_B64URL = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB_B64URL = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";

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
function verifyOffline(body: unknown, sig: string, publicKey: string): boolean {
  const pub = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical(body), "utf8"), pub, Buffer.from(sig, "base64"));
}

function rec(id: string): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    name: "Test Co",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "live",
    listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };
}

const PROFILE = {
  legalName: "Juan Perez",
  govId: { type: "CUIT" as const, value: "20-12345678-6" },
  jurisdiction: "AR",
};

function resetAll(): void {
  __resetMemoryForTests();
  __resetUboForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("ubo · profile + link + predicate", () => {
  beforeEach(resetAll);
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("sets a profile and mints a signed self-attested link (level 0)", async () => {
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV_B64URL;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_B64URL;
    await setUboProfile("e1", PROFILE);
    const link = await linkUbo("e1", "self-attested");
    expect(link).not.toBeNull();
    expect(link!.level).toBe(0);
    expect(link!.verificationMethod).toBe("self-attested");
    // The link is Ed25519-signed over canonical(uboLinkCore) and verifies offline.
    expect(link!.sig).toBeTruthy();
    expect(verifyOffline(uboLinkCore(link!), link!.sig!, link!.publicKey!)).toBe(true);
  });

  it("refuses to link without a profile", async () => {
    expect(await linkUbo("no-profile", "self-attested")).toBeNull();
  });

  it("PHASE-1 GATE: an authoritative method throws (regulated verifier not wired)", async () => {
    await setUboProfile("e2", PROFILE);
    await expect(linkUbo("e2", "afip")).rejects.toBeInstanceOf(UboVerificationNotAvailableError);
    await expect(linkUbo("e2", "renaper")).rejects.toBeInstanceOf(UboVerificationNotAvailableError);
    await expect(linkUbo("e2", "external-kyc")).rejects.toBeInstanceOf(UboVerificationNotAvailableError);
  });

  it("bankable predicate is FALSE for a self-attested link (honest, below min level)", async () => {
    await setUboProfile("e3", PROFILE);
    await linkUbo("e3", "self-attested");
    const b = await bankablePredicate("e3");
    expect(b.bankable).toBe(false);
    expect(b.level).toBe(0);
    expect(MIN_BANKABLE_LEVEL).toBeGreaterThan(0);
    expect(b.reasons.join(" ")).toMatch(/below the bankable minimum/);
  });

  it("getUboStatus is PII-FREE (no legalName / govId leak)", async () => {
    await setUboProfile("e4", PROFILE);
    await linkUbo("e4", "self-attested");
    const s = await getUboStatus("e4");
    expect(s).toEqual({
      present: true,
      level: 0,
      method: "self-attested",
      verifiedAt: expect.any(String),
      bankable: false,
    });
    // Belt-and-suspenders: the serialized status contains no PII.
    const json = JSON.stringify(s);
    expect(json).not.toContain("Juan Perez");
    expect(json).not.toContain("20-12345678-6");
  });

  it("getUboStatus is null when the entity has no UBO", async () => {
    expect(await getUboStatus("nobody")).toBeNull();
  });

  it("getUboProfile carries the PII (admin surface only)", async () => {
    await setUboProfile("e5", PROFILE);
    const p = await getUboProfile("e5");
    expect(p?.legalName).toBe("Juan Perez");
    expect(p?.govId.value).toBe("20-12345678-6");
    expect(await getUboLink("e5")).toBeNull(); // profile without a link
  });
});

describe("good-standing oracle · additive PII-free ubo block", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV_B64URL;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_B64URL;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 404 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("exposes ubo STATUS (present/level/method/bankable), never the PII, and still verifies offline", async () => {
    await upsertRecord(rec("ubo-oracle"));
    // Distinct UBO identity (not the public operator name) so the PII assertion is meaningful.
    await setUboProfile("ubo-oracle", {
      legalName: "Beneficiario Final Oculto",
      govId: { type: "CUIT", value: "27-99999999-3" },
      jurisdiction: "AR",
    });
    await linkUbo("ubo-oracle", "self-attested");

    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=ubo-oracle"));
    const json = (await res.json()) as any;
    expect(json.body.ubo).toEqual({
      present: true,
      level: 0,
      method: "self-attested",
      verifiedAt: expect.any(String),
      bankable: false,
    });
    // The signed answer, with the additive ubo block, verifies offline.
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
    // No UBO PII (legal name or gov id) leaked into the public oracle body.
    expect(JSON.stringify(json.body)).not.toContain("Beneficiario Final Oculto");
    expect(JSON.stringify(json.body)).not.toContain("27-99999999-3");
  });

  it("omits the ubo block for an entity with no UBO (byte-stable for existing answers)", async () => {
    await upsertRecord(rec("no-ubo"));
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=no-ubo"));
    const json = (await res.json()) as any;
    expect(json.body.ubo).toBeUndefined();
    expect(verifyOffline(json.body, json.sig, json.publicKey)).toBe(true);
  });
});

describe("/api/admin/registry/ubo", () => {
  const TOKEN = "admin-secret-ubo";
  beforeEach(() => {
    resetAll();
    process.env.REGISTRY_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });

  function req(method: "GET" | "POST", qs = "", body?: unknown, token = TOKEN): Request {
    const init: RequestInit = { method, headers: token ? { "x-admin-token": token } : {} };
    if (body !== undefined) init.body = JSON.stringify(body);
    return new Request(`https://ar-agents.ar/api/admin/registry/ubo${qs}`, init);
  }

  it("fail-closed: no token -> 401", async () => {
    expect((await uboGet(req("GET", "?entityId=x", undefined, ""))).status).toBe(401);
    expect((await uboPost(req("POST", "", { entityId: "x" }, ""))).status).toBe(401);
  });

  it("POST sets the profile + self-attested link; GET returns them + bankable:false", async () => {
    await upsertRecord(rec("adm-ubo"));
    const post = await uboPost(
      req("POST", "", {
        entityId: "adm-ubo",
        legalName: "Juan Perez",
        govIdType: "CUIT",
        govId: "20-12345678-6",
        jurisdiction: "AR",
        createLink: true,
      }),
    );
    expect(post.status).toBe(200);
    const pj = (await post.json()) as any;
    expect(pj.link.level).toBe(0);
    expect(pj.bankable.bankable).toBe(false);

    const get = (await (await uboGet(req("GET", "?entityId=adm-ubo"))).json()) as any;
    expect(get.profile.legalName).toBe("Juan Perez");
    expect(get.link.verificationMethod).toBe("self-attested");
  });

  it("404s when the entity is not in the registry", async () => {
    const res = await uboPost(req("POST", "", { entityId: "ghost", legalName: "X", govIdType: "CUIT", govId: "1" }));
    expect(res.status).toBe(404);
  });

  it("501 when asked for an authoritative (regulated) verification method", async () => {
    await upsertRecord(rec("adm-ubo2"));
    const res = await uboPost(
      req("POST", "", {
        entityId: "adm-ubo2",
        legalName: "Juan Perez",
        govIdType: "CUIT",
        govId: "20-12345678-6",
        createLink: true,
        method: "afip",
      }),
    );
    expect(res.status).toBe(501);
    const j = (await res.json()) as any;
    expect(j.error).toBe("verification_not_available");
  });
});
