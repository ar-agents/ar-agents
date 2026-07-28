/**
 * Route-level tests for `POST/GET/OPTIONS /api/auto-incorporate`, the
 * machine-readable incorporation surface for an external agent (see the
 * route's own header comment).
 *
 * @vercel/kv is mocked the same way apps/landing/test/incorporate-attested-route.test.ts
 * and apps/landing/test/ratelimit.test.ts do it. The real @vercel/kv client
 * throws synchronously when KV_REST_API_URL/KV_REST_API_TOKEN are unset (as
 * they are for every test here, so the audit log uses its in-memory store).
 * Two route behaviors depend on kv actually working, and both would silently
 * degrade into no-ops without this mock:
 *   - Idempotency. The route reads the prior result with kv.get and stores it
 *     with kv.set, swallowing errors on both. Unmocked, every kv.get resolves
 *     to null and every kv.set is dropped, so a replayed Idempotency-Key would
 *     always constitute again and the assertions below could never fail.
 *   - The durable cross-isolate quota, kvRateLimit, which counts with kv.incr
 *     and returns fail-open on error. Unmocked it waves everything through, so
 *     only the in-memory limiter would be under test.
 * The mock is a small in-memory store implementing get/set/incr/expire/del
 * (plus the extra methods other libs touch when KV IS wired, unused here since
 * KV_REST_API_URL stays unset so every other lib falls back to its own Map).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    del: async (k: string) => (store.delete(k) ? 1 : 0),
    incr: async (k: string) => {
      const current = (store.get(k) as number | undefined) ?? 0;
      const next = current + 1;
      store.set(k, next);
      return next;
    },
    expire: async (_k: string, _ttl: number) => 1,
    persist: async (_k: string) => 1,
    sadd: async (_k: string, _v: string) => 1,
    sismember: async (_k: string, _v: string) => 0,
    scard: async (_k: string) => 0,
    smembers: async (_k: string) => [],
    rpush: async (_k: string, _v: unknown) => 1,
    lrange: async (_k: string) => [],
  },
}));

import { POST, GET, OPTIONS } from "../src/app/api/auto-incorporate/route";
import { readAudit, type AuditEntry } from "../src/lib/audit";
import { REQUIRED_PIEZAS } from "../src/lib/incorporate";

const ENDPOINT = "https://ar-agents.ar/api/auto-incorporate";
const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
const WRONG_SECRET = "wrong-secret-32-chars-bbbbbbbbbbbbbbbbbbb";

// Fictional CUIT/name/address only (never real-looking data): 20-12345678-6,
// Juan Perez, Calle Falsa 123.
const VALID_CUIT = "20123456786";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    denominacion: "Panaderia Automatizada SAS",
    tipo: "SAS",
    capitalSocial: 100_000,
    objeto: "Fabricacion y venta de productos de panaderia y pasteleria.",
    ...overrides,
  };
}

let ipCounter = 0;
/** A fresh, never-reused client IP per call so per-IP rate-limit buckets never bleed across tests. */
function freshIp(): string {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function post(
  body: unknown,
  opts: { ip?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": opts.ip ?? freshIp(),
        ...opts.headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/** Reproduce credentialFingerprint(secret) from src/lib/incorporate-auth.ts, so
 *  the test proves the audit entry binds the SAME fingerprint that auth
 *  computed, not merely a string starting with "key:". */
async function credentialFingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `key:${hex.slice(0, 16)}`;
}

beforeEach(() => {
  store.clear();
  process.env.INCORPORATE_API_KEY = SECRET;
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

afterEach(() => {
  delete process.env.INCORPORATE_API_KEY;
  delete process.env.AUDIT_HMAC_SECRET;
});

describe("POST /api/auto-incorporate: auth fails closed when unconfigured", () => {
  it("500s with auth_not_configured when INCORPORATE_API_KEY is unset, and writes no audit entry", async () => {
    delete process.env.INCORPORATE_API_KEY;
    const sessionId = "unconfigured-test-1";
    const res = await post(
      { ...validBody(), sessionId },
      { headers: { authorization: `Bearer ${SECRET}` } },
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("auth_not_configured");

    const entries = await readAudit(sessionId);
    expect(entries).toHaveLength(0);
  });
});

describe("POST /api/auto-incorporate: credential presentation", () => {
  it("401s with unauthorized when no credential is presented", async () => {
    const res = await post(validBody());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("401s with unauthorized when a wrong credential is presented", async () => {
    const res = await post(validBody(), {
      headers: { authorization: `Bearer ${WRONG_SECRET}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("accepts Authorization: Bearer <key> on the happy path", async () => {
    const res = await post(validBody(), {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it("accepts x-api-key: <key> on the happy path", async () => {
    const res = await post(validBody(), {
      headers: { "x-api-key": SECRET },
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auto-incorporate: auth checked before body parsing", () => {
  it("401s (not 400) when a wrong credential accompanies a malformed body", async () => {
    const res = await post("{ not json", {
      headers: { authorization: `Bearer ${WRONG_SECRET}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("unauthorized");
  });
});

describe("POST /api/auto-incorporate: body parsing", () => {
  it("400s with bad_json on an unparseable body (valid credential)", async () => {
    const res = await post("{ not json", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_json");
  });

  it("400s with invalid_input and details when the body fails the zod schema", async () => {
    const res = await post(
      { denominacion: "x", tipo: "SAS", capitalSocial: -5, objeto: "short" },
      { headers: { authorization: `Bearer ${SECRET}` } },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details?: unknown };
    expect(body.error).toBe("invalid_input");
    expect(body.details).toBeTruthy();
  });
});

describe("POST /api/auto-incorporate: happy path", () => {
  it("200s, sets x-play-session + x-audit-backend, and appends a signed audit entry naming the representante as approver", async () => {
    const res = await post(
      { ...validBody(), representante: { nombre: "Juan Perez", cuit: VALID_CUIT } },
      { headers: { authorization: `Bearer ${SECRET}` } },
    );
    expect(res.status).toBe(200);
    const sessionId = res.headers.get("x-play-session");
    expect(sessionId).toBeTruthy();
    expect(res.headers.get("x-audit-backend")).toBe("in-memory");

    const body = (await res.json()) as { ok: boolean; audit: { sessionId: string } };
    expect(body.ok).toBe(true);
    expect(body.audit.sessionId).toBe(sessionId);

    const entries: AuditEntry[] = await readAudit(sessionId!);
    expect(entries.length).toBeGreaterThan(0);
    const last = entries.at(-1)!;
    expect(last.approver?.method).toBe("shared-key");
    expect(last.approver?.principalKind).toBe("credential-fingerprint");
    expect(last.approver?.principal).toBe(await credentialFingerprint(SECRET));
    expect(last.approver?.declaredBy).toBe("Juan Perez");
    expect(last.hmac).toBeTruthy();
  });

  it("falls back to the x-approver header for declaredBy when representante is absent", async () => {
    const res = await post(validBody(), {
      headers: { authorization: `Bearer ${SECRET}`, "x-approver": "Juan Perez" },
    });
    expect(res.status).toBe(200);
    const sessionId = res.headers.get("x-play-session")!;
    const entries: AuditEntry[] = await readAudit(sessionId);
    expect(entries.at(-1)!.approver?.declaredBy).toBe("Juan Perez");
  });

  it("leaves declaredBy undefined when neither representante nor x-approver is present", async () => {
    const res = await post(validBody(), {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    const sessionId = res.headers.get("x-play-session")!;
    const entries: AuditEntry[] = await readAudit(sessionId);
    expect(entries.at(-1)!.approver?.declaredBy).toBeUndefined();
  });
});

describe("POST /api/auto-incorporate: idempotency", () => {
  it("replays the identical body + sessionId on a repeated Idempotency-Key, marks the replay, and appends only one audit entry", async () => {
    const ip = freshIp();
    const idempotencyKey = "idempo-test-key-1";
    const res1 = await post(validBody(), {
      ip,
      headers: { authorization: `Bearer ${SECRET}`, "idempotency-key": idempotencyKey },
    });
    expect(res1.status).toBe(200);
    expect(res1.headers.get("x-idempotent-replay")).toBeNull();
    const sessionId1 = res1.headers.get("x-play-session");
    const body1 = await res1.json();

    const res2 = await post(validBody(), {
      ip,
      headers: { authorization: `Bearer ${SECRET}`, "idempotency-key": idempotencyKey },
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("x-idempotent-replay")).toBe("true");
    const sessionId2 = res2.headers.get("x-play-session");
    const body2 = await res2.json();

    expect(sessionId2).toBe(sessionId1);
    expect(body2).toEqual(body1);

    const entries = await readAudit(sessionId1!);
    expect(entries).toHaveLength(1);
  });

  it("constitutes again for a different Idempotency-Key", async () => {
    const ip = freshIp();
    const res1 = await post(validBody(), {
      ip,
      headers: { authorization: `Bearer ${SECRET}`, "idempotency-key": "idempo-test-key-a" },
    });
    const res2 = await post(validBody(), {
      ip,
      headers: { authorization: `Bearer ${SECRET}`, "idempotency-key": "idempo-test-key-b" },
    });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("x-idempotent-replay")).toBeNull();
    expect(res2.headers.get("x-play-session")).not.toBe(res1.headers.get("x-play-session"));
  });

  it("constitutes again with no Idempotency-Key at all", async () => {
    const ip = freshIp();
    const res1 = await post(validBody(), { ip, headers: { authorization: `Bearer ${SECRET}` } });
    const res2 = await post(validBody(), { ip, headers: { authorization: `Bearer ${SECRET}` } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("x-idempotent-replay")).toBeNull();
    expect(res2.headers.get("x-play-session")).not.toBe(res1.headers.get("x-play-session"));
  });
});

describe("POST /api/auto-incorporate: rate limiting", () => {
  it("429s with rate_limited on the 11th request from the same IP within the window", async () => {
    const ip = "203.0.113.202"; // fixed, unique-to-this-test IP (TEST-NET-3, RFC 5737)
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await post(validBody(), { ip, headers: { authorization: `Bearer ${SECRET}` } });
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("rate_limited");
  });
});

describe("GET /api/auto-incorporate", () => {
  it("returns the self-description with an Allow header, Cache-Control, and requiredPiezas matching the lib", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(res.headers.get("Cache-Control")).toBeTruthy();

    const body = (await res.json()) as {
      endpoint: string;
      method: string;
      requiredPiezas: string[];
    };
    expect(body.endpoint).toBe("/api/auto-incorporate");
    expect(body.method).toBe("POST");
    expect(body.requiredPiezas).toEqual(REQUIRED_PIEZAS);
  });
});

describe("OPTIONS /api/auto-incorporate", () => {
  it("returns a preflight response", async () => {
    const res = await OPTIONS();
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThanOrEqual(204);
  });
});
