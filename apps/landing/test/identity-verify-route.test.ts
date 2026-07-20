/**
 * Route-level tests for `POST /api/identity/verify`, the self-serve
 * "verify your agent" endpoint. Covers both submit modes (paste + hosted),
 * the three rate-limit gates, the size cap, shape validation, and the
 * crypto-verified true/false outcomes.
 *
 * The golden EVM identity doc fixture below is copied (not imported) from
 * the independently-oracled vector in
 * packages/identity-attest/test/key-binding.test.ts (`evmDoc()`): a real
 * EIP-191 personal_sign signature over Hardhat account #1, a public-knowledge
 * test key that never holds funds.
 *
 * @vercel/kv is mocked the same way apps/landing/test/ratelimit.test.ts does
 * it: the identity-verify route calls kvRateLimit with failClosed true, and
 * kvRateLimit calls the real @vercel/kv client, which throws synchronously
 * when KV_REST_API_URL/KV_REST_API_TOKEN are unset (as they are for every
 * test here, to exercise the in-memory registry path). Without this mock,
 * every request in this file would be denied by the KV rate-limit gate
 * before ever reaching the route logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kvIncr = vi.fn().mockResolvedValue(1);
const kvExpire = vi.fn().mockResolvedValue(1);
vi.mock("@vercel/kv", () => ({
  kv: {
    incr: (k: string) => kvIncr(k),
    expire: (k: string, s: number) => kvExpire(k, s),
    get: vi.fn(),
    set: vi.fn(),
    sadd: vi.fn(),
    scard: vi.fn(),
    lrange: vi.fn(),
    lpush: vi.fn(),
    rpush: vi.fn(),
    ltrim: vi.fn(),
    hincrby: vi.fn(),
  },
}));

import { POST, OPTIONS } from "../src/app/api/identity/verify/route";

const ENDPOINT = "https://ar-agents.ar/api/identity/verify";

// ── Golden EVM identity doc (copied verbatim from key-binding.test.ts) ──────
const EVM_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const EVM_DOC_HASH =
  "88ea6c70e40b98803b44cabdc9850454cf93219f7f207f18e3d4a74a57665d45";
const EVM_STATEMENT =
  "ar-agents RFC-002 identity binding v1\n" +
  `address: ${EVM_ADDRESS}\n` +
  "chainId: 8453\n" +
  `agents.json sha256: ${EVM_DOC_HASH}\n` +
  "issuedAt: 2026-07-03T00:00:00Z";
const EVM_SIGNATURE =
  "0x073a465c391a218d230dde955612e323681acefd379e62634e7f282963a0bca63c207e35daa257b54a1a513476cd30a9bd8a63cbf5aaef6917a83c8b7f9519751c";

/** Fresh deep copy each call so mutations in one test never leak into another. */
function validEvmDoc(): Record<string, unknown> {
  return {
    $schema: "https://ar-agents.ar/schemas/agents.v1.json",
    spec: "https://ar-agents.ar/rfcs/002",
    agent: {
      name: "Demo EVM Agent",
      operator: "Juan Perez",
      homepage: "https://demo.example",
      jurisdiction: "none-native",
    },
    identity: {
      scheme: "evm-secp256k1",
      chainId: 8453,
      address: EVM_ADDRESS,
      accountType: "eoa",
    },
    evidence: { onchain: `https://basescan.org/address/${EVM_ADDRESS}` },
    binding: {
      scheme: "eip-191",
      statement: EVM_STATEMENT,
      signature: EVM_SIGNATURE,
      docHash: EVM_DOC_HASH,
    },
    issuedAt: "2026-07-03T00:00:00Z",
  };
}

let ipCounter = 0;
/** A fresh, never-reused client IP per call so per-IP rate-limit buckets never bleed across tests. */
function freshIp(): string {
  ipCounter += 1;
  return `10.10.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function post(body: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": freshIp(),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  // Exercise the in-memory registry path (no Vercel KV wired in tests).
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("POST /api/identity/verify: paste mode, valid doc", () => {
  it("verifies the golden EVM doc end to end", async () => {
    const res = await post({ doc: validEvmDoc() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      verified: boolean;
      id: string;
      scheme: string;
      subject: { kind: string; value: string };
      profileUrl: string;
      badgeUrl: string;
      checks: Record<string, boolean>;
      persisted: boolean;
    };
    expect(body.verified).toBe(true);
    expect(body.id).toBe(EVM_ADDRESS.toLowerCase());
    expect(body.scheme).toBe("evm-secp256k1");
    expect(body.subject).toEqual({
      kind: "evm-address",
      value: EVM_ADDRESS.toLowerCase(),
    });
    expect(body.profileUrl).toBeTruthy();
    expect(body.badgeUrl).toBeTruthy();
    expect(body.checks).toMatchObject({
      docHashMatches: true,
      signatureValid: true,
      addressMatches: true,
    });
    // No KV wired in tests, so persistence is best-effort and may be false;
    // only the crypto-verified outcome and the derived URLs are asserted here.
  });
});

describe("POST /api/identity/verify: paste mode, tampered signature", () => {
  it("returns 200 with verified false (a bad signature is a verification outcome, not a bad request)", async () => {
    const doc = validEvmDoc();
    const binding = doc.binding as { signature: string };
    // Flip one hex char in the signature.
    binding.signature = binding.signature.slice(0, -2) + (binding.signature.endsWith("c") ? "d" : "c") + binding.signature.slice(-1);
    const res = await post({ doc });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verified: boolean; reason?: string };
    expect(body.verified).toBe(false);
  });
});

describe("POST /api/identity/verify: paste mode, invalid shape", () => {
  it("400s when the doc fails RFC-002 shape validation", async () => {
    const res = await post({ doc: { hello: "world" } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { verified: boolean; reason: string };
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/RFC-002/);
  });
});

describe("POST /api/identity/verify: neither mode provided", () => {
  it("400s with bad_request when the body has neither origin nor doc", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_request");
  });
});

describe("POST /api/identity/verify: malformed JSON", () => {
  it("400s with bad_request on a non-JSON body", async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
        body: "not json {{{",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_request");
  });
});

describe("POST /api/identity/verify: oversized body", () => {
  it("413s when the declared content-length exceeds the 64KB cap", async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(64 * 1024 + 1),
          "x-forwarded-for": freshIp(),
        },
        body: JSON.stringify({ doc: validEvmDoc() }),
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe("POST /api/identity/verify: hosted mode SSRF guard", () => {
  it("400s before fetching when the origin is not a public https URL", async () => {
    const res = await post({ origin: "http://localhost" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { verified: boolean; reason: string };
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/fetchable public https URL/);
  });

  it("400s for a private RFC1918 origin", async () => {
    const res = await post({ origin: "https://192.168.1.5" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { verified: boolean; reason: string };
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/fetchable public https URL/);
  });
});

describe("POST /api/identity/verify: hosted mode happy path", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = realFetch;
  });

  it("fetches {origin}/.well-known/agents.json and verifies the served golden doc", async () => {
    const origin = "https://demo.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        expect(url).toBe(`${origin}/.well-known/agents.json`);
        return new Response(JSON.stringify(validEvmDoc()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const res = await post({ origin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      verified: boolean;
      id: string;
      summary: { origin: string | null };
    };
    expect(body.verified).toBe(true);
    expect(body.id).toBe(EVM_ADDRESS.toLowerCase());
    expect(body.summary.origin).toBe(origin);
  });
});

describe("POST /api/identity/verify: rate limiting", () => {
  it("429s once the in-memory per-IP limit (20/min) is exceeded", async () => {
    const ip = "203.0.113.77"; // fixed, unique-to-this-test IP (TEST-NET-3, RFC 5737)
    const send = () =>
      POST(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({}), // cheapest path: fails validation fast, after the rate gate
        }),
      );

    let last: Response | undefined;
    for (let i = 0; i < 21; i++) {
      last = await send();
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });
});

describe("OPTIONS /api/identity/verify", () => {
  it("returns a preflight response", () => {
    const res = OPTIONS();
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThanOrEqual(204);
  });
});
