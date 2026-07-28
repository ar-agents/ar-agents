/**
 * Route-level tests for `POST /api/incorporate-attested`, the human
 * constitution surface. It records the art. 102 attestation, writes a
 * durable signed audit entry, and mints two write-once capability tokens
 * (adminToken, gateToken).
 *
 * @vercel/kv is mocked the same way apps/landing/test/ratelimit.test.ts and
 * apps/studio/test/society-suspend.test.ts do it: the route calls
 * kvRateLimit(..., { failClosed: true }), and kvRateLimit calls the real
 * @vercel/kv client, which throws synchronously when
 * KV_REST_API_URL/KV_REST_API_TOKEN are unset (as they are for every test
 * here, to exercise the in-memory audit/token stores). Without this mock,
 * every request in this file would 429 at the rate-limit gate before ever
 * reaching route logic. The mock is a small in-memory store implementing
 * get/set/incr/expire/del (plus the extra methods other libs touch when KV
 * IS wired, unused here since KV_REST_API_URL stays unset so every other lib
 * falls back to its own in-memory Map).
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

import { POST, GET, OPTIONS } from "../src/app/api/incorporate-attested/route";
import { readAudit, type AuditEntry } from "../src/lib/audit";
import { verifyAdminToken } from "../src/lib/admin-token";
import { verifyGateToken } from "../src/lib/gate-token";

const ENDPOINT = "https://ar-agents.ar/api/incorporate-attested";
const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";

// Fictional CUIT/name/address only (never real-looking data): 20-12345678-6,
// Juan Perez, Calle Falsa 123.
const VALID_CUIT = "20123456786";

function validDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    denominacion: "Panaderia Automatizada SAS",
    tipo: "SAS",
    capitalSocial: 100_000,
    objeto: "Fabricacion y venta de productos de panaderia y pasteleria.",
    ...overrides,
  };
}

function validAdministrador(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { nombre: "Juan Perez", cuit: VALID_CUIT, ...overrides };
}

let ipCounter = 0;
/** A fresh, never-reused client IP per call so per-IP rate-limit buckets never bleed across tests. */
function freshIp(): string {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function post(body: unknown, ip?: string): Promise<Response> {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": ip ?? freshIp(),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  store.clear();
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.IDENTITY_ATTEST_SECRET;
  delete process.env.IDENTITY_ATTEST_REQUIRED;
  delete process.env.IDENTITY_ATTEST_MIN_TRUST;
});

afterEach(() => {
  delete process.env.IDENTITY_ATTEST_SECRET;
  delete process.env.IDENTITY_ATTEST_REQUIRED;
  delete process.env.IDENTITY_ATTEST_MIN_TRUST;
});

describe("POST /api/incorporate-attested: malformed JSON", () => {
  it("400s with bad_json on an unparseable body", async () => {
    const res = await post("{ not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("bad_json");
  });
});

describe("POST /api/incorporate-attested: art. 102 acceptance gate", () => {
  it("400s with art102_no_aceptado when acepta102 is missing", async () => {
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("art102_no_aceptado");
    expect(typeof body.message).toBe("string");
  });

  it("400s with art102_no_aceptado when acepta102 is explicitly false", async () => {
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: false,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("art102_no_aceptado");
  });

  it("fires BEFORE administrador/draft validation: a request that would ALSO fail those gates still reports art102_no_aceptado", async () => {
    const res = await post({
      // administrador is missing entirely (would 400 administrador_invalido)
      // and draft is garbage (would 422 draft_invalido) -- neither is reached.
      draft: { hello: "world" },
      acepta102: false,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("art102_no_aceptado");
  });
});

describe("POST /api/incorporate-attested: administrador validation", () => {
  it("400s with administrador_invalido when the name is missing", async () => {
    const res = await post({
      draft: validDraft(),
      administrador: { cuit: VALID_CUIT },
      acepta102: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("administrador_invalido");
    expect(typeof body.message).toBe("string");
  });

  it("400s with administrador_invalido for a 1-character name", async () => {
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador({ nombre: "J" }),
      acepta102: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("administrador_invalido");
  });
});

describe("POST /api/incorporate-attested: CUIT validation", () => {
  it("422s with cuit_invalido for a check-digit-invalid CUIT", async () => {
    // 20-12345678-6 is valid (check digit 6); flip it to 9 (checksum breaks).
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador({ cuit: "20123456789" }),
      acepta102: true,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; error: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("cuit_invalido");
    expect(typeof body.message).toBe("string");
  });

  it("422s with cuit_invalido for a CUIT carrying zero-width-space contamination", async () => {
    // parseCuit() strips ALL non-digits (\D), so it would normalize this to a
    // check-digit-VALID "20123456786" and report valid:true. canonicalCuit()
    // (incorporate.ts) only strips CONVENTIONAL separators (whitespace, dots,
    // dashes) -- never "everything non-digit" -- so the zero-width space
    // (U+200B) survives its strip and the strict /^[0-9]{11}$/ check rejects
    // it. This is exactly the collision canonicalCuit exists to prevent: an
    // attacker-injected invisible character must never let a contaminated
    // input collapse onto the same 11-digit administrator identity as the
    // clean one.
    const contaminated = "201234​56786";
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador({ cuit: contaminated }),
      acepta102: true,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("cuit_invalido");
  });
});

describe("POST /api/incorporate-attested: draft validation", () => {
  it("422s with draft_invalido when the draft fails SocietyDraftSchema", async () => {
    const res = await post({
      draft: { denominacion: "x", tipo: "SAS", capitalSocial: -5, objeto: "short" },
      administrador: validAdministrador(),
      acepta102: true,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; error: string; detail?: unknown };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("draft_invalido");
    expect(body.detail).toBeTruthy();
  });
});

describe("POST /api/incorporate-attested: server-minted sessionId", () => {
  it("never honors a caller-supplied sessionId (the constituted session is NOT the attacker's chosen value)", async () => {
    // The route's own comment: accepting a caller-controlled sessionId would
    // let an attacker constitute INTO a victim's session and, as the
    // earliest incorporation entry, anchor themselves as its administrator.
    const attackerChosenSessionId = "victim-session-1234";
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: true,
      sessionId: attackerChosenSessionId,
    });
    expect(res.status).toBe(200);
    const sessionHeader = res.headers.get("x-play-session");
    expect(sessionHeader).toBeTruthy();
    expect(sessionHeader).not.toBe(attackerChosenSessionId);
    const body = (await res.json()) as { audit: { sessionId: string } };
    expect(body.audit.sessionId).not.toBe(attackerChosenSessionId);
    expect(body.audit.sessionId).toBe(sessionHeader);
  });
});

describe("POST /api/incorporate-attested: happy path", () => {
  it("200s with a server-minted session, verifiable adminToken + gateToken, and a signed audit entry naming the approver", async () => {
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: true,
    });
    expect(res.status).toBe(200);
    const sessionId = res.headers.get("x-play-session");
    expect(sessionId).toBeTruthy();

    const body = (await res.json()) as {
      ok: boolean;
      adminToken: string | null;
      gateToken: string | null;
      audit: { sessionId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.adminToken).toBeTruthy();
    expect(body.gateToken).toBeTruthy();
    expect(body.audit.sessionId).toBe(sessionId);

    // The tokens must actually verify against the real verifiers for this
    // session, not merely be present and non-empty.
    expect(await verifyAdminToken(sessionId!, body.adminToken!)).toBe(true);
    expect(await verifyGateToken(sessionId!, body.gateToken!)).toBe(true);
    // A token for a DIFFERENT session must not verify.
    expect(await verifyAdminToken("some-other-session", body.adminToken!)).toBe(false);

    // The durable audit entry must record the approver: principal
    // cuit:<11 ASCII digits>, declaredBy the submitted name.
    const entries: AuditEntry[] = await readAudit(sessionId!);
    expect(entries.length).toBeGreaterThan(0);
    const last = entries.at(-1)!;
    expect(last.tool).toBe("incorporate_attested");
    expect(last.approver?.principal).toBe(`cuit:${VALID_CUIT}`);
    expect(last.approver?.principalKind).toBe("declared-cuit");
    expect(last.approver?.declaredBy).toBe("Juan Perez");
    expect(last.approver?.method).toBe("self-attested");
    expect(last.hmac).toBeTruthy();
  });
});

describe("POST /api/incorporate-attested: attestation seam", () => {
  it("503s with attestation_requerida_no_configurada when attestation is REQUIRED but no verifier is configured (fail closed)", async () => {
    process.env.IDENTITY_ATTEST_REQUIRED = "true";
    // IDENTITY_ATTEST_SECRET stays unset -> attestationConfigured() is false.
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: true,
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("attestation_requerida_no_configurada");
  });

  it("401s with attestation_requerida when required and configured but no attestation is presented", async () => {
    process.env.IDENTITY_ATTEST_REQUIRED = "true";
    process.env.IDENTITY_ATTEST_SECRET = "test-attest-secret-1234567890ab";
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: true,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("attestation_requerida");
  });

  it("422s with attestation_invalida when the verifier is configured and a malformed attestation is presented", async () => {
    process.env.IDENTITY_ATTEST_SECRET = "test-attest-secret-1234567890ab";
    // IDENTITY_ATTEST_REQUIRED stays unset: not required, but since one IS
    // presented and the seam IS configured, it must still be verified.
    const res = await post({
      draft: validDraft(),
      administrador: validAdministrador(),
      acepta102: true,
      attestation: { not: "a real attestation" },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; error: string; detail?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("attestation_invalida");
    expect(typeof body.detail).toBe("string");
  });
});

describe("POST /api/incorporate-attested: rate limiting", () => {
  it("429s with rate_limited past the documented per-IP cap (5/hour)", async () => {
    const ip = "203.0.113.201"; // fixed, unique-to-this-test IP (TEST-NET-3, RFC 5737)
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await post(
        {
          draft: validDraft(),
          administrador: validAdministrador(),
          acepta102: true,
        },
        ip,
      );
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("rate_limited");
  });
});

describe("GET /api/incorporate-attested", () => {
  it("returns the documentation envelope with an Allow header", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    const body = (await res.json()) as { endpoint: string; method: string };
    expect(body.endpoint).toBe("/api/incorporate-attested");
    expect(body.method).toBe("POST");
  });
});

describe("OPTIONS /api/incorporate-attested", () => {
  it("returns a preflight response", async () => {
    const res = await OPTIONS();
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThanOrEqual(204);
  });
});
