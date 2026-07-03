import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  HttpClient,
  parseOrThrow,
  parseRetryAfter,
  defaultRetryClassifier,
  type ResponseSchema,
} from "../src/index";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** A fetch mock that records calls and delegates to a handler. */
function mockFetch(
  handler: (url: string, init: RequestInit, call: number) => Response | Promise<Response>,
): typeof fetch & { calls: number } {
  const state = { calls: 0 };
  const fn = async (url: unknown, init?: RequestInit): Promise<Response> => {
    state.calls += 1;
    return handler(String(url), init ?? {}, state.calls);
  };
  return Object.defineProperty(fn as unknown as typeof fetch & { calls: number }, "calls", {
    get: () => state.calls,
  });
}

/** A fetch that never resolves until its signal aborts, then rejects with the reason. */
function hangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }
    })) as unknown as typeof fetch;
}

const DebtSchema = z.object({
  cuit: z.string(),
  periodos: z.array(z.object({ periodo: z.string(), entidades: z.array(z.unknown()) })),
});

// ---------------------------------------------------------------------------
// parseOrThrow — the fabricated-data guard
// ---------------------------------------------------------------------------

describe("parseOrThrow", () => {
  it("returns typed data when the body matches", () => {
    const schema = z.object({ ok: z.boolean() });
    expect(parseOrThrow(schema, { ok: true })).toEqual({ ok: true });
  });

  it("throws ArAgentsResponseValidationError (not retryable) on a shape mismatch", () => {
    const schema = z.object({ debt: z.number() });
    try {
      parseOrThrow(schema, { debt: "not-a-number" }, { url: "https://x/y", status: 200 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ArAgentsResponseValidationError);
      const e = err as ArAgentsResponseValidationError;
      expect(e.retryable).toBe(false);
      expect(e.code).toBe("response_validation_failed");
      expect(e.field).toBe("debt");
      expect(e.context["status"]).toBe(200);
      expect(Array.isArray(e.context["issues"])).toBe(true);
    }
  });

  it("labels a root-level failure as (root)", () => {
    const schema = z.array(z.number());
    try {
      parseOrThrow(schema, { not: "an array" });
      expect.unreachable();
    } catch (err) {
      expect((err as ArAgentsResponseValidationError).field).toBe("(root)");
    }
  });

  it("accepts any structural safeParse implementation (not just zod)", () => {
    const custom: ResponseSchema<{ n: number }> = {
      safeParse: (v) =>
        typeof (v as { n?: unknown }).n === "number"
          ? { success: true, data: v as { n: number } }
          : { success: false, error: { issues: [{ path: ["n"], message: "expected number" }] } },
    };
    expect(parseOrThrow(custom, { n: 5 })).toEqual({ n: 5 });
    expect(() => parseOrThrow(custom, { n: "x" })).toThrow(ArAgentsResponseValidationError);
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter
// ---------------------------------------------------------------------------

describe("parseRetryAfter", () => {
  it("parses integer seconds to ms", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0")).toBe(0);
  });
  it("parses an HTTP-date to a non-negative ms offset", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
  });
  it("returns null on garbage", () => {
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HttpClient — happy path + validation
// ---------------------------------------------------------------------------

describe("HttpClient.request", () => {
  it("returns the validated body on a matching 200", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({ cuit: "20123456786", periodos: [{ periodo: "202406", entidades: [] }] }),
    );
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    const out = await client.request({ path: "/deudas/20123456786", schema: DebtSchema });
    expect(out.cuit).toBe("20123456786");
    expect(fetchImpl.calls).toBe(1);
  });

  it("FAILS LOUD on a malformed 200 instead of fabricating a clean result", async () => {
    // The real audit bug: an empty/blank body would parse "debt-free". With a
    // schema, it must throw — never silently return {}.
    const fetchImpl = mockFetch(() => jsonResponse({ unexpected: "shape" }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    await expect(
      client.request({ path: "/deudas/x", schema: DebtSchema }),
    ).rejects.toBeInstanceOf(ArAgentsResponseValidationError);
  });

  it("returns raw JSON when no schema is given", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ anything: 1 }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    expect(await client.request({ path: "/x" })).toEqual({ anything: 1 });
  });

  it("returns undefined on 204", async () => {
    const fetchImpl = mockFetch(() => new Response(null, { status: 204 }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    expect(await client.request({ path: "/x" })).toBeUndefined();
  });

  it("throws ArAgentsProtocolError on a non-JSON 200 body", async () => {
    const fetchImpl = mockFetch(
      () => new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    await expect(client.request({ path: "/x" })).rejects.toBeInstanceOf(ArAgentsProtocolError);
  });

  it("appends query params, skipping null/undefined", async () => {
    let seenUrl = "";
    const fetchImpl = mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({});
    });
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    await client.request({ path: "/x", query: { a: 1, b: "two", c: undefined, d: null, e: false } });
    expect(seenUrl).toContain("a=1");
    expect(seenUrl).toContain("b=two");
    expect(seenUrl).toContain("e=false");
    expect(seenUrl).not.toContain("c=");
    expect(seenUrl).not.toContain("d=");
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("HttpClient error mapping", () => {
  it("maps 401/403 to ArAgentsAuthError and does not retry", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ error: "nope" }, { status: 401 }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    await expect(client.request({ path: "/x" })).rejects.toBeInstanceOf(ArAgentsAuthError);
    expect(fetchImpl.calls).toBe(1);
  });

  it("maps a 4xx to ArAgentsProtocolError carrying the status (single attempt)", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ error: "not found" }, { status: 404 }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    try {
      await client.request({ path: "/x" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ArAgentsProtocolError);
      expect((err as ArAgentsProtocolError).status).toBe(404);
    }
    expect(fetchImpl.calls).toBe(1);
  });

  it("maps 429 to ArAgentsRateLimitError with retryAfterMs after exhausting retries", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 429, headers: { "Retry-After": "0" } }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    try {
      await client.request({ path: "/x" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ArAgentsRateLimitError);
    }
    expect(fetchImpl.calls).toBe(2);
  });

  it("retries a 429 then succeeds", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse({}, { status: 429, headers: { "Retry-After": "0" } })
        : jsonResponse({ ok: true }),
    );
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    expect(await client.request({ path: "/x" })).toEqual({ ok: true });
    expect(fetchImpl.calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Idempotency-aware retry
// ---------------------------------------------------------------------------

describe("HttpClient idempotency", () => {
  it("retries 5xx on GET (idempotent)", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    await expect(client.request({ path: "/x" })).rejects.toBeInstanceOf(ArAgentsProtocolError);
    expect(fetchImpl.calls).toBe(3);
  });

  it("does NOT retry 5xx on POST (non-idempotent) — no duplicate write", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    await expect(
      client.request({ path: "/pay", method: "POST", body: { amount: 100 } }),
    ).rejects.toBeInstanceOf(ArAgentsProtocolError);
    expect(fetchImpl.calls).toBe(1);
  });

  it("retries a POST when explicitly marked idempotent", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    await expect(
      client.request({ path: "/idem", method: "POST", body: {}, idempotent: true }),
    ).rejects.toBeInstanceOf(ArAgentsProtocolError);
    expect(fetchImpl.calls).toBe(2);
  });

  it("does NOT retry a 429 on a non-idempotent POST (money double-spend guard)", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 429, headers: { "Retry-After": "0" } }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    await expect(
      client.request({ path: "/pay", method: "POST", body: { amount: 100 } }),
    ).rejects.toBeInstanceOf(ArAgentsRateLimitError);
    expect(fetchImpl.calls).toBe(1); // 429 must not be retried on a keyless POST
  });

  it("DOES retry a 429 on a POST explicitly marked idempotent", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 429, headers: { "Retry-After": "0" } }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    await expect(
      client.request({ path: "/idem", method: "POST", body: {}, idempotent: true }),
    ).rejects.toBeInstanceOf(ArAgentsRateLimitError);
    expect(fetchImpl.calls).toBe(2);
  });

  it("retry:false disables retry entirely", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 503 }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 5, baseDelayMs: 1 },
    });
    await expect(client.request({ path: "/x", retry: false })).rejects.toBeInstanceOf(
      ArAgentsProtocolError,
    );
    expect(fetchImpl.calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout + cancellation
// ---------------------------------------------------------------------------

describe("HttpClient timeout & cancellation", () => {
  it("times out to a retryable ArAgentsProtocolError (timeout flagged)", async () => {
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: hangingFetch(),
      timeoutMs: 20,
    });
    try {
      await client.request({ path: "/slow", retry: false });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ArAgentsProtocolError);
      expect((err as ArAgentsProtocolError).retryable).toBe(true);
      expect((err as ArAgentsProtocolError).context["timeout"]).toBe(true);
    }
  });

  it("re-raises caller cancellation as-is (not wrapped as a protocol error)", async () => {
    const controller = new AbortController();
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: hangingFetch(),
      timeoutMs: 10_000,
    });
    const p = client.request({ path: "/slow", signal: controller.signal, retry: false });
    controller.abort();
    await expect(p).rejects.toSatisfy(
      (e: unknown) => e instanceof Error && e.name === "AbortError" && !(e instanceof ArAgentsProtocolError),
    );
  });
});

// ---------------------------------------------------------------------------
// Auth + SSRF
// ---------------------------------------------------------------------------

describe("HttpClient auth", () => {
  it("sends a static Authorization header", async () => {
    let seenAuth: string | null = null;
    const fetchImpl = mockFetch((_url, init) => {
      seenAuth = (init.headers as Record<string, string>)["Authorization"] ?? null;
      return jsonResponse({});
    });
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl, auth: "Bearer static" });
    await client.request({ path: "/x" });
    expect(seenAuth).toBe("Bearer static");
  });

  it("calls a function auth provider per request (token refresh transparency)", async () => {
    const auth = vi.fn(async () => "Bearer fresh");
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl, auth });
    await client.request({ path: "/a" });
    await client.request({ path: "/b" });
    expect(auth).toHaveBeenCalledTimes(2);
  });

  it("sends no Authorization header when auth returns null", async () => {
    let hasAuth = true;
    const fetchImpl = mockFetch((_url, init) => {
      hasAuth = "Authorization" in (init.headers as Record<string, string>);
      return jsonResponse({});
    });
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl, auth: () => null });
    await client.request({ path: "/x" });
    expect(hasAuth).toBe(false);
  });

  it("maps an auth-provider throw to ArAgentsAuthError", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      auth: () => {
        throw new Error("token store down");
      },
    });
    await expect(client.request({ path: "/x" })).rejects.toBeInstanceOf(ArAgentsAuthError);
    expect(fetchImpl.calls).toBe(0);
  });
});

describe("HttpClient SSRF guard", () => {
  it("refuses an absolute-URL path", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    await expect(client.request({ path: "http://evil.com/x" })).rejects.toBeInstanceOf(
      ArAgentsProtocolError,
    );
    await expect(client.request({ path: "//evil.com/x" })).rejects.toBeInstanceOf(
      ArAgentsProtocolError,
    );
    expect(fetchImpl.calls).toBe(0);
  });

  it("refuses a `..` traversal path", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const client = new HttpClient({ baseUrl: "https://api.test/v1", fetch: fetchImpl });
    await expect(client.request({ path: "/../admin" })).rejects.toBeInstanceOf(
      ArAgentsProtocolError,
    );
    expect(fetchImpl.calls).toBe(0);
  });

  it("preserves a base URL that has a path prefix", async () => {
    let seenUrl = "";
    const fetchImpl = mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({});
    });
    const client = new HttpClient({ baseUrl: "https://api.test/wsfe", fetch: fetchImpl });
    await client.request({ path: "/FECAESolicitar" });
    expect(seenUrl).toBe("https://api.test/wsfe/FECAESolicitar");
  });
});

// ---------------------------------------------------------------------------
// requestRaw
// ---------------------------------------------------------------------------

describe("HttpClient.requestRaw", () => {
  it("returns the raw Response for a 2xx (binary bodies)", async () => {
    const fetchImpl = mockFetch(() => new Response("PDFDATA", { status: 200 }));
    const client = new HttpClient({ baseUrl: "https://api.test", fetch: fetchImpl });
    const res = await client.requestRaw({ path: "/label", accept: "application/pdf" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("PDFDATA");
  });

  it("still throws a typed error on >= 400", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}, { status: 500 }));
    const client = new HttpClient({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      retry: { maxAttempts: 1 },
    });
    await expect(client.requestRaw({ path: "/x" })).rejects.toBeInstanceOf(ArAgentsProtocolError);
  });
});

// ---------------------------------------------------------------------------
// defaultRetryClassifier (unit)
// ---------------------------------------------------------------------------

describe("defaultRetryClassifier", () => {
  it("never retries a caller AbortError", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(defaultRetryClassifier(abort, null, { method: "GET" }).shouldRetry).toBe(false);
  });
  it("retries a TimeoutError on an idempotent method", () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(defaultRetryClassifier(timeout, null, { method: "GET" }).shouldRetry).toBe(true);
    expect(defaultRetryClassifier(timeout, null, { method: "POST" }).shouldRetry).toBe(false);
  });
});
