import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * V2-7 granular oracle: admin-minted consumer keys + the authenticated granular
 * profile endpoint + SSRF-guarded, Ed25519-signed webhooks. In-memory path.
 */

import {
  mintConsumerKey,
  verifyConsumerKey,
  revokeConsumer,
  authenticateConsumer,
  __resetConsumersForTests,
} from "../src/lib/oracle-consumer";
import {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  fireWebhooks,
  __resetWebhooksForTests,
} from "../src/lib/oracle-webhooks";
import { upsertRecord, __resetMemoryForTests, type RegistryRecord } from "../src/lib/registry-store";
import { __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { GET as oracleGet } from "../src/app/api/oracle/route";
import { GET as consGet, POST as consPost } from "../src/app/api/admin/oracle/consumers/route";
import { GET as whGet, POST as whPost } from "../src/app/api/oracle/webhooks/route";

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
function verifyOffline(body: unknown, sig: string, publicKey: string): boolean {
  const pub = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical(body), "utf8"), pub, Buffer.from(sig, "base64"));
}

function rec(id: string): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id, name: "Test Co", type: "productive-sociedad-ia", jurisdiction: "AR", operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`, rfcConformance: [], disclosure: { es: "x", en: "x" },
    status: "live", listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 82, lastRating: "B" },
    createdAt: now, updatedAt: now, source: "self-listed",
  };
}

function resetAll(): void {
  __resetMemoryForTests();
  __resetConsumersForTests();
  __resetWebhooksForTests();
  __resetIncidentsForTests();
  __resetHistoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.REGISTRY_ADMIN_TOKEN;
}

describe("oracle consumer keys", () => {
  beforeEach(resetAll);

  it("mints a key returned once, verifies it, and revokes it", async () => {
    const minted = await mintConsumerKey("Banco Test");
    expect(minted).not.toBeNull();
    expect(minted!.key).toMatch(/^orc_/);
    const c = await verifyConsumerKey(minted!.key);
    expect(c?.label).toBe("Banco Test");
    expect(await revokeConsumer(minted!.consumer.id)).toBe(true);
    expect(await verifyConsumerKey(minted!.key)).toBeNull(); // revoked -> no longer valid
  });

  it("rejects an unknown/garbage key", async () => {
    expect(await verifyConsumerKey("orc_nope")).toBeNull();
    expect(await verifyConsumerKey("not-a-key")).toBeNull();
  });

  it("authenticateConsumer accepts a consumer key OR the admin token, else null", async () => {
    process.env.REGISTRY_ADMIN_TOKEN = "adm";
    const minted = await mintConsumerKey("x");
    const asConsumer = await authenticateConsumer(new Request("https://x", { headers: { "x-oracle-key": minted!.key } }));
    expect(asConsumer?.kind).toBe("consumer");
    const asAdmin = await authenticateConsumer(new Request("https://x", { headers: { "x-admin-token": "adm" } }));
    expect(asAdmin?.kind).toBe("admin");
    expect(await authenticateConsumer(new Request("https://x"))).toBeNull();
  });
});

describe("GET /api/oracle (granular profile)", () => {
  beforeEach(resetAll);

  it("fail-closed without a key (401)", async () => {
    await upsertRecord(rec("g1"));
    const res = await oracleGet(new Request("https://ar-agents.ar/api/oracle?id=g1"));
    expect(res.status).toBe(401);
  });

  it("returns the full profile for an authenticated consumer", async () => {
    await upsertRecord(rec("g2"));
    const minted = await mintConsumerKey("Banco");
    const res = await oracleGet(
      new Request("https://ar-agents.ar/api/oracle?id=g2", { headers: { "x-oracle-key": minted!.key } }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j.entity.id).toBe("g2");
    expect(j.goodStanding.dimensions).toBeTruthy();
    expect(j.goodStanding.headlineScore).toBe(82);
    expect(Array.isArray(j.incidents)).toBe(true);
    expect(Array.isArray(j.history)).toBe(true);
    expect(j.meta.by).toBe("consumer");
  });

  it("404 for an unknown entity", async () => {
    const minted = await mintConsumerKey("Banco");
    const res = await oracleGet(
      new Request("https://ar-agents.ar/api/oracle?id=ghost", { headers: { "x-oracle-key": minted!.key } }),
    );
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/oracle/consumers", () => {
  beforeEach(() => {
    resetAll();
    process.env.REGISTRY_ADMIN_TOKEN = "adm";
  });
  afterEach(() => delete process.env.REGISTRY_ADMIN_TOKEN);

  function req(method: "GET" | "POST", body?: unknown, token = "adm"): Request {
    const init: RequestInit = { method, headers: token ? { "x-admin-token": token } : {} };
    if (body !== undefined) init.body = JSON.stringify(body);
    return new Request("https://ar-agents.ar/api/admin/oracle/consumers", init);
  }

  it("fail-closed (401), then mint + list + revoke", async () => {
    expect((await consGet(req("GET", undefined, ""))).status).toBe(401);
    const mint = (await (await consPost(req("POST", { label: "PSP Uno" }))).json()) as any;
    expect(mint.key).toMatch(/^orc_/);
    const list = (await (await consGet(req("GET"))).json()) as any;
    expect(list.consumers.some((c: any) => c.label === "PSP Uno")).toBe(true);
    const rev = await consPost(req("POST", { revoke: mint.consumer.id }));
    expect(rev.status).toBe(200);
  });
});

describe("oracle webhooks", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("SSRF-guards the registration url (incl IPv4-mapped / NAT64 IPv6 bypass)", async () => {
    const badUrls = [
      "http://localhost:9000/hook",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata (IPv4)
      "http://[::ffff:169.254.169.254]/latest/meta-data/", // IPv4-mapped IPv6 -> metadata
      "http://[::ffff:127.0.0.1]/", // IPv4-mapped IPv6 -> loopback
      "http://[64:ff9b::a9fe:a9fe]/", // NAT64 -> metadata
      "http://[::1]/", // loopback
    ];
    for (const u of badUrls) {
      const r = await registerWebhook("c1", u);
      expect(r, `must reject ${u}`).toEqual({ error: expect.stringContaining("invalid url") });
    }
    const ok = await registerWebhook("c1", "https://hooks.example.com/ingest");
    expect(ok).toHaveProperty("id");
  });

  it("delete is owner-scoped", async () => {
    const h = (await registerWebhook("owner", "https://hooks.example.com/a")) as any;
    expect(await deleteWebhook("other", h.id)).toBe(false); // not the owner
    expect(await deleteWebhook("owner", h.id)).toBe(true);
    expect(await listWebhooks("owner")).toEqual([]);
  });

  it("fires a SIGNED event only to matching subscribers", async () => {
    await registerWebhook("c1", "https://hooks.example.com/e1", "e1");
    await registerWebhook("c1", "https://hooks.example.com/other", "e2");
    await fireWebhooks({ entityId: "e1", kind: "good-standing", to: "revoked", reason: "fraud" });
    // Only the e1 subscriber was called.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(String(call[0])).toContain("hooks.example.com/e1");
    const payload = JSON.parse(call[1].body);
    expect(payload.body.entityId).toBe("e1");
    expect(payload.body.event.to).toBe("revoked");
    // The delivered event verifies offline (Ed25519).
    expect(verifyOffline(payload.body, payload.sig, payload.publicKey)).toBe(true);
  });

  it("route: consumer registers + lists + deletes its own webhook", async () => {
    process.env.REGISTRY_ADMIN_TOKEN = "adm";
    const { key } = (await mintConsumerKey("Banco"))!;
    const reg = await whPost(
      new Request("https://ar-agents.ar/api/oracle/webhooks", {
        method: "POST",
        headers: { "x-oracle-key": key, "content-type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example.com/mine", entityId: "e1" }),
      }),
    );
    expect(reg.status).toBe(200);
    const list = (await (await whGet(new Request("https://ar-agents.ar/api/oracle/webhooks", { headers: { "x-oracle-key": key } }))).json()) as any;
    expect(list.webhooks).toHaveLength(1);
    // No auth -> 401.
    expect((await whGet(new Request("https://ar-agents.ar/api/oracle/webhooks"))).status).toBe(401);
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });
});
