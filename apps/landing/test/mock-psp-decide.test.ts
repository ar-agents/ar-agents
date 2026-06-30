import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock-PSP / counterparty-simulator — the loop PROOF (demand side).
 *
 * The decide route is a thin counterparty: it queries the public good-standing
 * oracle and accepts/rejects PURELY on the signed answer. These tests pin the
 * decision matrix and prove the route never invents a verdict beyond what the
 * oracle reported. We mock global fetch so the oracle answer is fully controlled
 * (the route is the unit under test, not the live oracle).
 */

import { POST, OPTIONS } from "../src/app/api/mock-psp/decide/route";

const ORIGIN = "https://ar-agents.ar";

/** Build a POST Request to the decide route with a JSON body. */
function decideReq(body: unknown): Request {
  return new Request(`${ORIGIN}/api/mock-psp/decide`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A minimal oracle answer body the route reads. */
function oracleAnswer(opts: {
  found: boolean;
  state?: string;
  score?: number | null;
  rating?: string | null;
  reason?: string;
  signed?: boolean;
}): unknown {
  const body = {
    kind: "ar-agents.registry.good-standing",
    version: 1,
    found: opts.found,
    record: opts.found ? { id: "acme", name: "Acme SA", status: "live" } : null,
    goodStanding: opts.found
      ? {
          state: opts.state ?? "active",
          score: opts.score ?? null,
          rating: opts.rating ?? null,
          basis: "automated conformance of self-declared endpoints",
          ...(opts.reason ? { reason: opts.reason } : {}),
        }
      : null,
  };
  return opts.signed === false ? { body } : { body, sig: "ZmFrZQ==", publicKey: "cHVi", alg: "Ed25519" };
}

/** Stub global fetch to return a given oracle answer; captures the called URL. */
function stubOracle(answer: unknown, init?: { ok?: boolean; status?: number; throws?: boolean }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (init?.throws) throw new Error("network");
      const ok = init?.ok ?? true;
      return new Response(JSON.stringify(answer), {
        status: init?.status ?? (ok ? 200 : 502),
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mock-psp /decide — decision matrix", () => {
  it("APPROVES an active entity with a score above the threshold", async () => {
    stubOracle(oracleAnswer({ found: true, state: "active", score: 88, rating: "A" }));
    const res = await POST(decideReq({ id: "acme" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(data.decision).toBe("approve");
    expect(data.reasonCode).toBe("active_above_threshold");
    // It forwards the exact oracle answer it relied on.
    expect((data.oracleAnswer as { body?: { found?: boolean } }).body?.found).toBe(true);
  });

  it("REJECTS an active entity whose score is below the threshold", async () => {
    stubOracle(oracleAnswer({ found: true, state: "active", score: 65, rating: "C" }));
    const res = await POST(decideReq({ id: "acme" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.decision).toBe("reject");
    expect(data.reasonCode).toBe("below_threshold");
    expect(String(data.reason)).toContain("65");
  });

  it("REJECTS an active entity with no score", async () => {
    stubOracle(oracleAnswer({ found: true, state: "active", score: null }));
    const res = await POST(decideReq({ id: "acme" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.decision).toBe("reject");
    expect(data.reasonCode).toBe("no_score");
  });

  for (const state of ["forming", "stale", "suspended", "revoked", "unverified"]) {
    it(`REJECTS a non-attesting "${state}" entity even with a high score`, async () => {
      stubOracle(
        oracleAnswer({ found: true, state, score: 95, rating: "A", reason: `is ${state}` }),
      );
      const res = await POST(decideReq({ id: "acme" }));
      const data = (await res.json()) as Record<string, unknown>;
      expect(data.decision).toBe("reject");
      expect(data.reasonCode).toBe(`state_${state}`);
      // Reason is sourced from the oracle answer, not invented.
      expect(String(data.reason)).toContain(state);
    });
  }

  it("REJECTS when the entity is not found in the registry", async () => {
    stubOracle(oracleAnswer({ found: false }));
    const res = await POST(decideReq({ id: "ghost" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.decision).toBe("reject");
    expect(data.reasonCode).toBe("not_found");
  });
});

describe("mock-psp /decide — oracle availability", () => {
  it("REJECTS (declines) when the oracle returns a non-200", async () => {
    stubOracle(oracleAnswer({ found: true, state: "active", score: 90 }), { status: 503, ok: false });
    const res = await POST(decideReq({ id: "acme" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(data.decision).toBe("reject");
    expect(data.reasonCode).toBe("oracle_unavailable");
  });

  it("REJECTS (declines) when the oracle is unreachable", async () => {
    stubOracle(null, { throws: true });
    const res = await POST(decideReq({ id: "acme" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.decision).toBe("reject");
    expect(data.reasonCode).toBe("oracle_unreachable");
  });
});

describe("mock-psp /decide — input handling + SSRF", () => {
  it("forwards a safe URL to the oracle as ?url=<origin>", async () => {
    const calls = stubOracle(oracleAnswer({ found: true, state: "active", score: 80 }));
    const res = await POST(decideReq({ url: "https://example.ar/some/path" }));
    expect(res.status).toBe(200);
    // The route normalizes to origin and queries the oracle's good-standing route.
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/api/registry/good-standing?");
    expect(calls[0]).toContain("url=");
    expect(decodeURIComponent(calls[0])).toContain("https://example.ar");
    expect(decodeURIComponent(calls[0])).not.toContain("/some/path");
  });

  it("rejects a private/loopback URL (SSRF guard) without calling the oracle", async () => {
    const calls = stubOracle(oracleAnswer({ found: true, state: "active", score: 80 }));
    const res = await POST(decideReq({ url: "http://127.0.0.1:8080/" }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(400);
    expect(String(data.error)).toContain("invalid url");
    expect(calls.length).toBe(0);
  });

  it("rejects a metadata-endpoint URL (SSRF guard)", async () => {
    const calls = stubOracle(oracleAnswer({ found: true, state: "active", score: 80 }));
    const res = await POST(decideReq({ url: "http://169.254.169.254/latest/meta-data" }));
    expect(res.status).toBe(400);
    expect(calls.length).toBe(0);
  });

  it("400s when no entity reference is provided", async () => {
    stubOracle(oracleAnswer({ found: true, state: "active", score: 80 }));
    const res = await POST(decideReq({}));
    const data = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(400);
    expect(String(data.error)).toContain("provide one of");
  });

  it("400s on an invalid JSON body", async () => {
    const req = new Request(`${ORIGIN}/api/mock-psp/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("queries the oracle by CUIT (digits only)", async () => {
    const calls = stubOracle(oracleAnswer({ found: true, state: "active", score: 80 }));
    const res = await POST(decideReq({ cuit: "20-12345678-6" }));
    expect(res.status).toBe(200);
    expect(calls[0]).toContain("cuit=20123456786");
  });
});

describe("mock-psp /decide — CORS preflight", () => {
  it("answers OPTIONS with 204 + CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
