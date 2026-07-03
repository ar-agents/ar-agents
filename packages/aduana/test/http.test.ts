import { describe, expect, it } from "vitest";
import { ArAgentsResponseValidationError } from "@ar-agents/core";
import {
  HttpAduanaAdapter,
  AduanaApiError,
  AduanaUnconfiguredError,
  type DespachoIdentifier,
} from "../src";

const ID: DespachoIdentifier = { kind: "SUSI", value: "24073SUSI001234A" };

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

describe("HttpAduanaAdapter.lookupDespacho", () => {
  it("returns found:true with validated fields on a real despacho body", async () => {
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch(() =>
        jsonResponse({
          status: "canalizado_verde",
          operationKind: "IM4",
          ncmCode: "84713010",
          registeredAt: "2026-05-01",
        }),
      ),
    });
    const r = await a.lookupDespacho(ID);
    expect(r.found).toBe(true);
    expect(r.status).toBe("canalizado_verde");
    expect(r.identifier).toEqual(ID);
  });

  it("does NOT stamp found:true on a non-despacho 200 body — fails loud", async () => {
    // The audit footgun: an error page / empty {} served with 200 became a
    // "found" declaration. Now it must throw, never fabricate found:true.
    for (const body of [{}, { error: "unavailable" }, { status: "no-such-state" }]) {
      const a = new HttpAduanaAdapter({
        baseUrl: "https://aduana.test",
        fetch: mockFetch(() => jsonResponse(body)),
      });
      await expect(a.lookupDespacho(ID)).rejects.toBeInstanceOf(
        ArAgentsResponseValidationError,
      );
    }
  });

  it("returns {found:false} on 404 (no such despacho)", async () => {
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch(() => jsonResponse(null, { status: 404 })),
    });
    const r = await a.lookupDespacho(ID);
    expect(r.found).toBe(false);
    expect(r.identifier).toEqual(ID);
  });

  it("passes kind + value as query params", async () => {
    let seen = "";
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch((url) => {
        seen = url;
        return jsonResponse({ status: "registrado" });
      }),
    });
    await a.lookupDespacho(ID);
    expect(seen).toContain("kind=SUSI");
    expect(seen).toContain(`value=${encodeURIComponent(ID.value)}`);
  });

  it("maps a 5xx to a retryable AduanaApiError after exhausting retries", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    try {
      await a.lookupDespacho(ID);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AduanaApiError);
      expect((err as AduanaApiError).status).toBe(503);
      expect((err as AduanaApiError).retryable).toBe(true);
    }
    expect(fetchImpl.calls).toBe(3);
  });

  it("retries a transient 5xx then succeeds", async () => {
    const fetchImpl = mockFetch((_url, call) =>
      call < 2 ? jsonResponse({}, { status: 502 }) : jsonResponse({ status: "oficializado" }),
    );
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    const r = await a.lookupDespacho(ID);
    expect(r.found).toBe(true);
    expect(fetchImpl.calls).toBe(2);
  });

  it("throws AduanaUnconfiguredError when no fetch is available", () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      expect(() => new HttpAduanaAdapter()).toThrow(AduanaUnconfiguredError);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("HttpAduanaAdapter.lookupNcm", () => {
  it("returns the validated NCM record on 200", async () => {
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch(() =>
        jsonResponse({ code: "84713010", description: "Notebooks", active: true, aecPercent: 0 }),
      ),
    });
    const r = await a.lookupNcm("84713010");
    expect(r?.code).toBe("84713010");
    expect(r?.active).toBe(true);
  });

  it("returns null on 404", async () => {
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch(() => jsonResponse(null, { status: 404 })),
    });
    expect(await a.lookupNcm("00000000")).toBeNull();
  });

  it("FAILS LOUD on a malformed NCM body", async () => {
    const a = new HttpAduanaAdapter({
      baseUrl: "https://aduana.test",
      fetch: mockFetch(() => jsonResponse({ code: "84713010" })), // missing description/active
    });
    await expect(a.lookupNcm("84713010")).rejects.toBeInstanceOf(
      ArAgentsResponseValidationError,
    );
  });
});
