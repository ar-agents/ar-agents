import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Route-level tests for the two x402 paid rails in apps/landing:
 *   /api/x402/cuit        (toy check-digit demo, priced at $0.001 USDC)
 *   /api/x402/constancia  (the real product: a signed ARCA good-standing
 *                          attestation, priced at $0.05 USDC)
 *
 * The invariant under test throughout is WHEN a payment gets settled. A
 * verified payment authorization must be settled if and only if the route
 * actually produced the promised result. Bad input, a check-digit failure
 * (constancia only), or a missing ARCA verdict must all short-circuit
 * BEFORE settleAndRespond runs, so the caller is never charged for nothing.
 *
 * @ar-agents/x402's FacilitatorClient, verifyPayment and settleAndRespond are
 * stubbed so no test ever talks to a real facilitator. Everything else
 * (paymentRequiredResponse, the zod schemas) stays real via importOriginal,
 * so the 402 body shape is checked against the actual spec schema.
 *
 * The Constancia Oracle's ARCA fetcher (src/lib/constancia.ts) is stubbed
 * separately so tests can force each of its states: unconfigured, configured
 * but no verdict, throwing, and a real verdict.
 *
 * Fixtures use only fictional PII: CUIT 20-12345678-6 (bare 20123456786) and
 * Juan Perez, as instructed.
 */

const { verifyPaymentMock, settleAndRespondMock, facilitatorClientMock, x402State } =
  vi.hoisted(() => {
    const x402State = {
      verified: true,
      verifyErrorNote: "mock: payment verification failed",
    };
    return {
      x402State,
      verifyPaymentMock: vi.fn(),
      settleAndRespondMock: vi.fn(),
      facilitatorClientMock: vi.fn(),
    };
  });

vi.mock("@ar-agents/x402", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ar-agents/x402")>();

  facilitatorClientMock.mockImplementation(() => ({}));

  verifyPaymentMock.mockImplementation(async (_req: Request, requirements: unknown) => {
    if (!x402State.verified) {
      return {
        verified: false as const,
        reason: x402State.verifyErrorNote,
        response: actual.paymentRequiredResponse(
          requirements as Parameters<typeof actual.paymentRequiredResponse>[0],
          { error: x402State.verifyErrorNote },
        ),
      };
    }
    return {
      verified: true as const,
      payload: {
        x402Version: 1,
        scheme: "exact",
        network: "base",
        payload: { from: "0xpayer", to: "0xseller", value: "1000" },
      },
      verify: { isValid: true },
    };
  });

  settleAndRespondMock.mockImplementation(
    async (
      _payload: unknown,
      _requirements: unknown,
      _facilitator: unknown,
      successResponse: Response,
    ) => {
      const headers = new Headers(successResponse.headers);
      headers.set("X-PAYMENT-RESPONSE", "bW9jay1zZXR0bGVtZW50");
      return new Response(successResponse.body, {
        status: successResponse.status,
        headers,
      });
    },
  );

  return {
    ...actual,
    FacilitatorClient: facilitatorClientMock,
    verifyPayment: verifyPaymentMock,
    settleAndRespond: settleAndRespondMock,
  };
});

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

vi.mock("@/lib/constancia", () => ({
  isFetcherConfigured: () => constanciaState.configured,
  getConstanciaFetcher: () => ({
    getConstancia: async (_cuit: string) => {
      if (constanciaState.throwOnFetch) throw new Error("mock: ARCA fetch failed");
      return (
        constanciaState.result ?? {
          available: false,
          error: null,
          data: null,
          source: "unconfigured",
        }
      );
    },
  }),
}));

import { paymentRequirementsSchema } from "@ar-agents/x402";
import { GET as cuitGet, POST as cuitPost, OPTIONS as cuitOptions } from "../src/app/api/x402/cuit/route";
import {
  GET as constanciaGet,
  POST as constanciaPost,
  OPTIONS as constanciaOptions,
} from "../src/app/api/x402/constancia/route";
import { verifyConstanciaAttestation } from "../src/lib/constancia-attestation";

const PAYTO = "0x000000000000000000000000000000000000aa";

// Fictional test CUIT (20-12345678-6, the example used in the identity
// package's own docs), and its check-digit-invalid sibling (same body,
// wrong check digit: expected 6, this one carries 9).
const VALID_CUIT = "20-12345678-6";
const VALID_CUIT_BARE = "20123456786";
const CHECKDIGIT_INVALID_CUIT = "20-12345678-9";

// Ed25519 test keypair (not a secret: this is a throwaway key generated for
// tests only, same as used elsewhere in this test suite for attestations).
const ED25519_PRIV = "MC4CAQAwBQYDK2VwBCIEIGW8zyK1X-q0ILg2EjyzDdZU43pHsva8CfRRZ_ZibcGv";
const ED25519_PUB = "MCowBQYDK2VwAyEAjFW5_BXTil8F7Jxhg269rWf7ulhKbo_mVHGf7bBwAoA";

let ipCounter = 0;
/** A fresh client IP per call, so tests never share an in-memory rate-limit bucket. */
function nextIp(): string {
  ipCounter += 1;
  return `10.99.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function req(
  path: string,
  opts: {
    method?: "GET" | "POST";
    ip?: string;
    xPayment?: boolean;
    body?: string;
  } = {},
): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": opts.ip ?? nextIp() });
  if (opts.xPayment) headers.set("X-PAYMENT", "bW9jay1wYXltZW50LXBheWxvYWQ=");
  const init: RequestInit = { method: opts.method ?? "GET", headers };
  if (opts.body !== undefined) init.body = opts.body;
  return new Request(`https://ar-agents.ar${path}`, init);
}

beforeEach(() => {
  process.env.AUDIT_HMAC_SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUDIT_ED25519_PRIVATE_KEY;
  delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  process.env.X402_PAYTO_ADDRESS = PAYTO;

  x402State.verified = true;
  verifyPaymentMock.mockClear();
  settleAndRespondMock.mockClear();
  facilitatorClientMock.mockClear();

  constanciaState.configured = false;
  constanciaState.result = null;
  constanciaState.throwOnFetch = false;
});

describe("/api/x402/cuit", () => {
  it("503s with 'unavailable' when X402_PAYTO_ADDRESS is unset, and never contacts the facilitator", async () => {
    delete process.env.X402_PAYTO_ADDRESS;
    const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unavailable");
    expect(facilitatorClientMock).not.toHaveBeenCalled();
    expect(verifyPaymentMock).not.toHaveBeenCalled();
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("402s with a spec-valid PaymentRequirements accepts array when X-PAYMENT is absent, and never settles", async () => {
    const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { x402Version: number; accepts: unknown[] };
    expect(body.x402Version).toBe(1);
    const parsed = z.array(paymentRequirementsSchema).safeParse(body.accepts);
    expect(parsed.success).toBe(true);
    // The facilitator is never constructed on this path: the route returns
    // before it would instantiate FacilitatorClient.
    expect(facilitatorClientMock).not.toHaveBeenCalled();
    expect(verifyPaymentMock).not.toHaveBeenCalled();
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("returns the verifier's own response when verification fails, without settling", async () => {
    x402State.verified = false;
    const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`, { xPayment: true }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(x402State.verifyErrorNote);
    expect(verifyPaymentMock).toHaveBeenCalledTimes(1);
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s bad_request on a verified GET with no ?cuit=, without settling", async () => {
    const res = await cuitGet(req("/api/x402/cuit", { xPayment: true }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s bad_request on a verified GET with a blank ?cuit=, without settling", async () => {
    const res = await cuitGet(req("/api/x402/cuit?cuit=", { xPayment: true }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s bad_request on a verified POST with an unparseable JSON body, without settling", async () => {
    const res = await cuitPost(
      req("/api/x402/cuit", { method: "POST", xPayment: true, body: "{ not json" }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s bad_request on a verified POST whose JSON cuit field is not a string, without settling", async () => {
    const res = await cuitPost(
      req("/api/x402/cuit", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: 20123456786 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("200s with ok+paid+result for a verified valid CUIT, and settles exactly once", async () => {
    const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`, { xPayment: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      paid: boolean;
      result: { valid: boolean; normalized: string };
    };
    expect(body.ok).toBe(true);
    expect(body.paid).toBe(true);
    expect(body.result.valid).toBe(true);
    expect(body.result.normalized).toBe(VALID_CUIT_BARE);
    expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
    expect(settleAndRespondMock).toHaveBeenCalledTimes(1);
  });

  // ACTUAL BEHAVIOR (not a spec requirement, just documenting what the route
  // does today): a syntactically well-formed but check-digit-invalid CUIT is
  // NOT rejected by /api/x402/cuit. parseCuit() just reports valid:false
  // inside the 200 result, and the payment IS settled, because the route's
  // "bad request" gate only checks whether a cuit string was supplied at
  // all, not whether it passes the mod-11 check. This differs from
  // /api/x402/constancia, which does refuse to settle on a check-digit
  // failure (see below). Do not change the route to match this test;
  // this test exists to pin the current behavior.
  it("documents that a check-digit-invalid CUIT still 200s with valid:false, and STILL settles", async () => {
    const res = await cuitPost(
      req("/api/x402/cuit", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: CHECKDIGIT_INVALID_CUIT }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: { valid: boolean } };
    expect(body.ok).toBe(true);
    expect(body.result.valid).toBe(false);
    expect(settleAndRespondMock).toHaveBeenCalledTimes(1);
  });

  it("rate limits at 30 requests per minute per IP, returning 429 with Retry-After", async () => {
    const ip = "10.55.55.55";
    for (let i = 0; i < 30; i++) {
      const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`, { ip }));
      expect(res.status).not.toBe(429);
    }
    const res = await cuitGet(req(`/api/x402/cuit?cuit=${VALID_CUIT}`, { ip }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("OPTIONS returns 204 with X-PAYMENT in Allow-Headers and X-PAYMENT-RESPONSE in Expose-Headers", () => {
    const res = cuitOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-PAYMENT");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe("X-PAYMENT-RESPONSE");
  });
});

describe("/api/x402/constancia", () => {
  it("503s with 'unavailable' when X402_PAYTO_ADDRESS is unset", async () => {
    delete process.env.X402_PAYTO_ADDRESS;
    const res = await constanciaGet(req(`/api/x402/constancia?cuit=${VALID_CUIT}`));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("unavailable");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("402s with a PaymentRequirements accepts array when X-PAYMENT is absent, and never settles", async () => {
    const res = await constanciaGet(req(`/api/x402/constancia?cuit=${VALID_CUIT}`));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { accepts: unknown[] };
    const parsed = z.array(paymentRequirementsSchema).safeParse(body.accepts);
    expect(parsed.success).toBe(true);
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s bad_request on a verified request with no cuit, and does NOT settle", async () => {
    const res = await constanciaPost(
      req("/api/x402/constancia", { method: "POST", xPayment: true, body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("400s invalid_cuit on a verified request with a check-digit-invalid CUIT, and does NOT settle", async () => {
    const res = await constanciaPost(
      req("/api/x402/constancia", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: CHECKDIGIT_INVALID_CUIT }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; validationError: string };
    expect(body.error).toBe("invalid_cuit");
    expect(typeof body.validationError).toBe("string");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("503s verdict_unavailable on a valid CUIT when no ARCA fetcher is configured, and does NOT settle", async () => {
    constanciaState.configured = false;
    constanciaState.result = null; // UnconfiguredConstanciaFetcher-equivalent: available:false
    const res = await constanciaPost(
      req("/api/x402/constancia", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: VALID_CUIT }),
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; note: string };
    expect(body.error).toBe("verdict_unavailable");
    expect(body.note).toMatch(/not live/i);
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("503s verdict_unavailable when a configured fetcher runs but returns no verdict, and does NOT settle", async () => {
    constanciaState.configured = true;
    constanciaState.result = {
      available: false,
      error: "mock: ARCA returned no verdict for this CUIT.",
      data: null,
      source: "padron-soap",
    };
    const res = await constanciaPost(
      req("/api/x402/constancia", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: VALID_CUIT }),
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; note: string };
    expect(body.error).toBe("verdict_unavailable");
    expect(body.note).toBe("mock: ARCA returned no verdict for this CUIT.");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("503s verdict_error when the fetcher throws, and does NOT settle", async () => {
    constanciaState.configured = true;
    constanciaState.throwOnFetch = true;
    const res = await constanciaPost(
      req("/api/x402/constancia", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: VALID_CUIT }),
      }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("verdict_error");
    expect(settleAndRespondMock).not.toHaveBeenCalled();
  });

  it("200s with ok+paid+verdictAvailable and a valid signed attestation on a real verdict, and settles exactly once", async () => {
    process.env.AUDIT_ED25519_PRIVATE_KEY = ED25519_PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = ED25519_PUB;
    constanciaState.configured = true;
    constanciaState.result = {
      available: true,
      error: null,
      data: { condicion: "monotributo", denominacion: "Juan Perez", estado: "ACTIVO" },
      source: "padron-soap",
    };
    const res = await constanciaPost(
      req("/api/x402/constancia", {
        method: "POST",
        xPayment: true,
        body: JSON.stringify({ cuit: VALID_CUIT }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      paid: boolean;
      verdictAvailable: boolean;
      goodStanding: { source: string; condicion: string; denominacion?: string };
      attestation: unknown;
    };
    expect(body.ok).toBe(true);
    expect(body.paid).toBe(true);
    expect(body.verdictAvailable).toBe(true);
    expect(body.goodStanding.condicion).toBe("monotributo");
    expect(body.goodStanding.denominacion).toBe("Juan Perez");
    expect(body.attestation).not.toBeNull();
    const verification = await verifyConstanciaAttestation(
      body.attestation as Parameters<typeof verifyConstanciaAttestation>[0],
    );
    expect(verification.valid).toBe(true);
    expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
    expect(settleAndRespondMock).toHaveBeenCalledTimes(1);
  });

  it("OPTIONS returns 204 with X-PAYMENT in Allow-Headers and X-PAYMENT-RESPONSE in Expose-Headers", () => {
    const res = constanciaOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-PAYMENT");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe("X-PAYMENT-RESPONSE");
  });
});
