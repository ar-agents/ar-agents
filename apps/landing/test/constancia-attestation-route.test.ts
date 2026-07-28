import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for `GET /api/constancia/attestation/[cuit]`.
 *
 * The point of this route is the canonicalization line:
 *
 *   const bare = normalizeCuit(cuit) ?? parsed.normalized;
 *
 * `bare` is what gets fetched with AND what gets signed as the attestation's
 * `cuit` subject. These tests pin that: several spellings of the same
 * logical CUIT must all collapse to the identical 11-digit subject, both in
 * the signed body and in the fetcher call.
 *
 * Only `@/lib/constancia` is mocked (to control the good-standing fetcher).
 * `@ar-agents/constancia` (normalizeCuit) and `@ar-agents/identity`
 * (parseCuit) are NEVER mocked, so the canonicalization under test is the
 * real implementation, not a stub that would make these tests pass
 * vacuously.
 *
 * Fixtures use only fictional PII: CUIT 20-12345678-6 (bare 20123456786) and
 * Juan Perez, as instructed.
 */

interface MockConstanciaResult {
  available: boolean;
  error: string | null;
  data: { condicion: string; denominacion?: string; estado?: string } | null;
  source: string;
}

const constanciaState = vi.hoisted(() => ({
  configured: false,
  result: null as MockConstanciaResult | null,
  throwOnFetch: false,
}));

const getConstanciaMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/constancia", () => ({
  isFetcherConfigured: () => constanciaState.configured,
  getConstanciaFetcher: () => ({
    getConstancia: getConstanciaMock,
  }),
}));

import { GET as attestationGet, OPTIONS as attestationOptions } from "../src/app/api/constancia/attestation/[cuit]/route";
import { verifyConstanciaAttestation } from "../src/lib/constancia-attestation";

const VALID_CUIT_BARE = "20123456786"; // fictional 20-12345678-6
const CHECKDIGIT_INVALID_CUIT = "20-12345678-9"; // same body, wrong check digit (expected 6)

// Ed25519 test keypair (not a secret: this is a throwaway key generated for
// tests only, same as used elsewhere in this test suite for attestations,
// e.g. test/x402-routes.test.ts and test/attestation-timestamp.test.ts).
const ED25519_PRIV = "MC4CAQAwBQYDK2VwBCIEIGW8zyK1X-q0ILg2EjyzDdZU43pHsva8CfRRZ_ZibcGv";
const ED25519_PUB = "MCowBQYDK2VwAyEAjFW5_BXTil8F7Jxhg269rWf7ulhKbo_mVHGf7bBwAoA";

let ipCounter = 0;
/** A fresh client IP per call, so tests never share an in-memory rate-limit bucket. */
function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function req(cuit: string, ip?: string): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": ip ?? nextIp() });
  return new Request(`https://ar-agents.ar/api/constancia/attestation/${encodeURIComponent(cuit)}`, {
    headers,
  });
}

function callRoute(cuit: string, ip?: string) {
  return attestationGet(req(cuit, ip), { params: Promise.resolve({ cuit }) });
}

interface AttestationResponseBody {
  attestation: {
    body: {
      cuit: string;
      cuitFormatted: string;
      checkDigit: { valid: boolean; algorithm: "mod-11" };
      goodStanding?: { source: string; condicion: string; denominacion?: string };
    };
    signature: unknown;
    publicKey: string;
    alg: "Ed25519";
  };
  verify: { publicKeys: string; endpoint: string; offline: string };
}

beforeEach(() => {
  process.env.AUDIT_ED25519_PRIVATE_KEY = ED25519_PRIV;
  process.env.AUDIT_ED25519_PUBLIC_KEY = ED25519_PUB;
  delete process.env.AUDIT_ED25519_KEY_ID;

  constanciaState.configured = false;
  constanciaState.result = null;
  constanciaState.throwOnFetch = false;
  getConstanciaMock.mockReset();
  getConstanciaMock.mockImplementation(async (_cuit: string) => {
    if (constanciaState.throwOnFetch) throw new Error("mock: ARCA fetch failed");
    return (
      constanciaState.result ?? {
        available: false,
        error: null,
        data: null,
        source: "unconfigured",
      }
    );
  });
});

describe("GET /api/constancia/attestation/[cuit]: canonicalization invariant", () => {
  const spellings = [
    "20123456786",
    "20-12345678-6",
    "20.12345678.6",
    "20 12345678 6",
  ];

  for (const spelling of spellings) {
    it(`normalizes "${spelling}" to the bare 11-digit subject, both in the fetch call and the signed body`, async () => {
      constanciaState.configured = true;
      constanciaState.result = {
        available: true,
        error: null,
        data: { condicion: "monotributo" },
        source: "padron-soap",
      };

      const res = await callRoute(spelling);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AttestationResponseBody;

      expect(body.attestation.body.cuit).toBe(VALID_CUIT_BARE);
      expect(body.attestation.body.cuitFormatted).toBe("20-12345678-6");

      // The fetcher must have been called with exactly the bare digits,
      // never the raw spelling.
      expect(getConstanciaMock).toHaveBeenCalledTimes(1);
      expect(getConstanciaMock).toHaveBeenCalledWith(VALID_CUIT_BARE);
    });
  }
});

describe("GET /api/constancia/attestation/[cuit]: check-digit-invalid CUIT", () => {
  it("still returns a signed attestation, with checkDigitValid false and no goodStanding", async () => {
    // constanciaState.configured stays false / result stays null in beforeEach,
    // but it must not even matter here: parsed.valid is false so the route
    // never enters the fetch branch at all.
    const res = await callRoute(CHECKDIGIT_INVALID_CUIT);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AttestationResponseBody;

    expect(body.attestation.body.checkDigit.valid).toBe(false);
    expect(body.attestation.body.goodStanding).toBeUndefined();
    expect(getConstanciaMock).not.toHaveBeenCalled();

    const verification = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(verification.valid).toBe(true);
  });
});

describe("GET /api/constancia/attestation/[cuit]: good-standing path", () => {
  it("carries goodStanding with the right condicion/source, and verifies", async () => {
    constanciaState.configured = true;
    constanciaState.result = {
      available: true,
      error: null,
      data: { condicion: "monotributo", denominacion: "Juan Perez", estado: "ACTIVO" },
      source: "padron-soap",
    };

    const res = await callRoute(VALID_CUIT_BARE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AttestationResponseBody;

    expect(body.attestation.body.checkDigit.valid).toBe(true);
    expect(body.attestation.body.goodStanding).toMatchObject({
      source: "padron-soap",
      condicion: "monotributo",
      denominacion: "Juan Perez",
    });

    const verification = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(verification.valid).toBe(true);
  });

  it("maps a non-padron-soap source to browse-skill", async () => {
    constanciaState.configured = true;
    constanciaState.result = {
      available: true,
      error: null,
      data: { condicion: "monotributo" },
      source: "browse-skill",
    };

    const res = await callRoute(VALID_CUIT_BARE);
    const body = (await res.json()) as AttestationResponseBody;
    expect(body.attestation.body.goodStanding?.source).toBe("browse-skill");
  });
});

describe("GET /api/constancia/attestation/[cuit]: fetcher unavailable / throwing", () => {
  it("falls through to a signed check-digit-only attestation when the fetcher reports unavailable, not a 500", async () => {
    constanciaState.configured = true;
    constanciaState.result = {
      available: false,
      error: "mock: ARCA returned no verdict for this CUIT.",
      data: null,
      source: "padron-soap",
    };

    const res = await callRoute(VALID_CUIT_BARE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AttestationResponseBody;

    expect(body.attestation.body.checkDigit.valid).toBe(true);
    expect(body.attestation.body.goodStanding).toBeUndefined();

    const verification = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(verification.valid).toBe(true);
  });

  it("falls through to a signed check-digit-only attestation when the fetcher throws, not a 500", async () => {
    constanciaState.configured = true;
    constanciaState.throwOnFetch = true;

    const res = await callRoute(VALID_CUIT_BARE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AttestationResponseBody;

    expect(body.attestation.body.checkDigit.valid).toBe(true);
    expect(body.attestation.body.goodStanding).toBeUndefined();

    const verification = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(verification.valid).toBe(true);
  });
});

describe("GET /api/constancia/attestation/[cuit]: signature is genuinely checked", () => {
  it("flags a tampered field as invalid, proving the test would catch a broken signer", async () => {
    const res = await callRoute(VALID_CUIT_BARE);
    const body = (await res.json()) as AttestationResponseBody;

    const genuine = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(genuine.valid).toBe(true);

    const tampered = {
      ...body.attestation,
      body: {
        ...body.attestation.body,
        checkDigit: { ...body.attestation.body.checkDigit, valid: !body.attestation.body.checkDigit.valid },
      },
    };
    const tamperedVerification = await verifyConstanciaAttestation(
      tampered as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(tamperedVerification.valid).toBe(false);
  });
});

describe("GET /api/constancia/attestation/[cuit]: response shape", () => {
  it("sets a 1h public cache-control header", async () => {
    const res = await callRoute(VALID_CUIT_BARE);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("includes the verify block pointing at the public keys and verify endpoint", async () => {
    const res = await callRoute(VALID_CUIT_BARE);
    const body = (await res.json()) as AttestationResponseBody;
    expect(body.verify.publicKeys).toBe("https://ar-agents.ar/.well-known/sociedad-ia/keys");
    expect(body.verify.endpoint).toBe("https://ar-agents.ar/api/constancia/attestation/verify");
  });

  it("503s signing_unavailable when no Ed25519 key is configured", async () => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    const res = await callRoute(VALID_CUIT_BARE);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("signing_unavailable");
  });

  it("rate limits at 30 requests per minute per IP, returning 429 with Retry-After", async () => {
    const ip = "10.66.66.66";
    for (let i = 0; i < 30; i++) {
      const res = await callRoute(VALID_CUIT_BARE, ip);
      expect(res.status).not.toBe(429);
    }
    const res = await callRoute(VALID_CUIT_BARE, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("OPTIONS returns a 204 preflight", () => {
    const res = attestationOptions();
    expect(res.status).toBe(204);
  });
});
