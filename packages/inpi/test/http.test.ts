import { describe, expect, it } from "vitest";
import { ArAgentsResponseValidationError } from "@ar-agents/core";
import {
  HttpInpiAdapter,
  InpiApiError,
  InpiUnconfiguredError,
  type TrademarkRecord,
} from "../src";

const RECORD: TrademarkRecord = {
  acta: "3792456",
  denomination: "VULTUR",
  niceClass: 9,
  status: "concedida",
  holder: "Nazareno Clemente",
  grantedAt: "2025-06-15",
  expiresAt: "2035-06-15",
};

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function mockFetch(
  handler: (url: string, call: number) => Response,
): typeof fetch & { calls: number } {
  const state = { calls: 0 };
  const fn = async (url: unknown): Promise<Response> => {
    state.calls += 1;
    return handler(String(url), state.calls);
  };
  return Object.defineProperty(fn as unknown as typeof fetch & { calls: number }, "calls", {
    get: () => state.calls,
  });
}

describe("HttpInpiAdapter.search", () => {
  it("returns validated records and builds the envelope itself", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ records: [RECORD], hasMore: true }));
    const a = new HttpInpiAdapter({ baseUrl: "https://inpi.test", fetch: fetchImpl });
    const out = await a.search({ q: "vultur" });
    expect(out.records).toHaveLength(1);
    expect(out.records[0]?.acta).toBe("3792456");
    expect(out.hasMore).toBe(true);
    expect(out.query.q).toBe("vultur");
  });

  it("FAILS LOUD on a malformed 200 instead of reading as 'no conflicts'", async () => {
    // The fabrication footgun: a failed/empty search body must NOT become
    // records: [] (= "no conflicting trademarks"). It must throw.
    for (const body of [{}, { error: "down" }, { records: "nope" }, []]) {
      const a = new HttpInpiAdapter({
        baseUrl: "https://inpi.test",
        fetch: mockFetch(() => jsonResponse(body)),
      });
      await expect(a.search({ q: "vultur" })).rejects.toBeInstanceOf(
        ArAgentsResponseValidationError,
      );
    }
  });

  it("rejects a record with an unknown status (no silent coercion)", async () => {
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: mockFetch(() => jsonResponse({ records: [{ ...RECORD, status: "vigente" }] })),
    });
    await expect(a.search({ q: "vultur" })).rejects.toBeInstanceOf(
      ArAgentsResponseValidationError,
    );
  });

  it("passes q/class/status/limit as query params", async () => {
    let seen = "";
    const fetchImpl = mockFetch((url) => {
      seen = url;
      return jsonResponse({ records: [] });
    });
    const a = new HttpInpiAdapter({ baseUrl: "https://inpi.test", fetch: fetchImpl });
    await a.search({ q: "astro", niceClass: 30, status: "publicada", limit: 10 });
    expect(seen).toContain("q=astro");
    expect(seen).toContain("class=30");
    expect(seen).toContain("status=publicada");
    expect(seen).toContain("limit=10");
  });

  it("maps a 5xx to a retryable InpiApiError after exhausting retries", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    try {
      await a.search({ q: "vultur" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InpiApiError);
      expect((err as InpiApiError).status).toBe(503);
      expect((err as InpiApiError).retryable).toBe(true);
    }
    expect(fetchImpl.calls).toBe(3);
  });

  it("retries a transient 5xx (idempotent GET) then succeeds", async () => {
    const fetchImpl = mockFetch((_url, call) =>
      call < 2 ? jsonResponse({}, { status: 502 }) : jsonResponse({ records: [RECORD] }),
    );
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    const out = await a.search({ q: "vultur" });
    expect(out.records).toHaveLength(1);
    expect(fetchImpl.calls).toBe(2);
  });

  it("throws InpiUnconfiguredError when no fetch is available", () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      expect(() => new HttpInpiAdapter()).toThrow(InpiUnconfiguredError);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("HttpInpiAdapter.getByActa", () => {
  it("returns the record on 200", async () => {
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: mockFetch(() => jsonResponse(RECORD)),
    });
    expect((await a.getByActa("3792456"))?.denomination).toBe("VULTUR");
  });

  it("returns null on 404 (no such acta)", async () => {
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: mockFetch(() => jsonResponse(null, { status: 404 })),
    });
    expect(await a.getByActa("0000000")).toBeNull();
  });

  it("maps a non-404 error to InpiApiError", async () => {
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: mockFetch(() => jsonResponse({}, { status: 500 })),
      retry: { maxAttempts: 1 },
    });
    await expect(a.getByActa("3792456")).rejects.toBeInstanceOf(InpiApiError);
  });

  it("FAILS LOUD on a malformed 200 record body", async () => {
    const a = new HttpInpiAdapter({
      baseUrl: "https://inpi.test",
      fetch: mockFetch(() => jsonResponse({ denomination: "VULTUR" })), // missing required fields
    });
    await expect(a.getByActa("3792456")).rejects.toBeInstanceOf(
      ArAgentsResponseValidationError,
    );
  });
});
