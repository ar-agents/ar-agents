/**
 * Failure injection tests — simulate adverse network/response conditions
 * and verify the toolkit behaves predictably:
 *
 * - Network errors mid-retry
 * - Partial JSON responses
 * - Empty responses
 * - Malformed Content-Type
 * - Connection drops between attempts
 * - Rate limit cascades
 *
 * Why this matters: production failures are NEVER clean. They're always
 * "fetch failed with EPIPE after 800ms partial body". A best-in-class
 * toolkit handles these gracefully — surfaces useful errors, doesn't leak
 * timers, doesn't hang.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  MercadoPagoClient,
  MercadoPagoError,
  MercadoPagoOverloadedError,
  MercadoPagoTimeoutError,
} from "../src";

describe("failure injection — network errors", () => {
  it("retries on ECONNRESET-style throws and eventually succeeds", async () => {
    let attempts = 0;
    const fakeFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("ECONNRESET");
      }
      return new Response(JSON.stringify({ id: "12345", status: "approved", transaction_amount: 100, currency_id: "ARS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 3,
    });

    const payment = await client.getPayment("12345");
    expect(payment.id).toBe("12345");
    expect(attempts).toBe(3);
  });

  it("propagates network error after retries exhausted", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("EHOSTUNREACH");
    }) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 2,
    });

    await expect(client.getPayment("12345")).rejects.toThrow(/EHOSTUNREACH/);
    expect(fakeFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe("failure injection — malformed responses", () => {
  it("handles partial JSON gracefully", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response("{not valid json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
    });

    await expect(client.getPayment("12345")).rejects.toThrow();
  });

  it("handles empty 200 OK responses", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
    });
    // Empty 200 → undefined (DELETE responses, etc.)
    const result = await client.deleteWebhook("123");
    expect(result).toBeUndefined();
  });

  it("detects MP-overloaded HTML 5xx (non-JSON content-type)", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response("<html>503 backend overloaded</html>", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
    });
    await expect(client.getPayment("12345")).rejects.toBeInstanceOf(MercadoPagoOverloadedError);
  });
});

describe("failure injection — timeouts + abort propagation", () => {
  it("aborts on per-request timeout", async () => {
    const fakeFetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      requestTimeoutMs: 50,
      maxRetries: 0,
    });

    await expect(client.getPayment("12345")).rejects.toBeInstanceOf(MercadoPagoTimeoutError);
  });

  it("propagates parent AbortSignal — cancels mid-flight without retrying", async () => {
    let fetchCalls = 0;
    const fakeFetch = vi.fn(
      (_url: string, init: RequestInit) => {
        fetchCalls++;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      },
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      requestTimeoutMs: 30_000,
      maxRetries: 3,
    });

    const parent = new AbortController();
    setTimeout(() => parent.abort(), 30);

    // The signal needs to be passed to a method that accepts options
    // — we use the request internals via the public API. Use healthCheck
    // which accepts a signal directly.
    const result = await client.healthCheck(parent.signal);
    expect(result.ok).toBe(false);
    // Should NOT have retried — parent abort means caller's deadline expired
    expect(fetchCalls).toBe(1);
  });
});

describe("failure injection — circuit breaker", () => {
  it("trips on cascading 5xx and fails fast on subsequent calls", async () => {
    const events: Array<{ from: string; to: string }> = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      onStateChange: (e) => events.push({ from: e.from, to: e.to }),
    });

    let fetchCalls = 0;
    const fakeFetch = vi.fn(async () => {
      fetchCalls++;
      return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
      circuitBreaker: breaker,
    });

    // First 3 calls hit the upstream and fail
    await expect(client.getPayment("1")).rejects.toThrow();
    await expect(client.getPayment("2")).rejects.toThrow();
    await expect(client.getPayment("3")).rejects.toThrow();
    expect(breaker.getState()).toBe("OPEN");
    expect(fetchCalls).toBe(3);

    // Subsequent calls fail fast — breaker is OPEN, no upstream call
    await expect(client.getPayment("4")).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fetchCalls).toBe(3); // unchanged
  });

  it("circuit breaker does NOT count 4xx as failures (user errors)", async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      // Don't count 4xx errors (they're user/config errors, not upstream failures)
      isFailure: (err) => {
        if (err instanceof MercadoPagoError) {
          return err.status >= 500;
        }
        return true;
      },
    });

    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "bad request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
      circuitBreaker: breaker,
    });

    // Even 100 4xx errors don't open the breaker
    for (let i = 0; i < 10; i++) {
      await expect(client.getPayment(String(i))).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("CLOSED");
  });
});

describe("failure injection — race conditions + cleanup", () => {
  it("doesn't leak timers on aborted requests", async () => {
    // Track active timers by hooking setTimeout/clearTimeout
    const active = new Set<NodeJS.Timeout>();
    const origSetTimeout = global.setTimeout;
    const origClearTimeout = global.clearTimeout;
    global.setTimeout = ((fn: () => void, ms: number) => {
      const t = origSetTimeout(fn, ms);
      active.add(t);
      return t;
    }) as never;
    global.clearTimeout = ((t: NodeJS.Timeout) => {
      active.delete(t);
      return origClearTimeout(t);
    }) as never;

    try {
      const fakeFetch = vi.fn(async () => {
        await new Promise((r) => origSetTimeout(r, 10));
        return new Response(JSON.stringify({ id: "1", status: "approved", transaction_amount: 1, currency_id: "ARS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const client = new MercadoPagoClient({
        accessToken: "TEST-fake",
        fetch: fakeFetch,
        requestTimeoutMs: 10_000, // long timeout
        maxRetries: 0,
      });

      await client.getPayment("1");

      // Allow microtasks to drain
      await new Promise((r) => origSetTimeout(r, 0));

      // After a successful request, the per-request timeout should be cleared
      expect(active.size).toBe(0);
    } finally {
      global.setTimeout = origSetTimeout;
      global.clearTimeout = origClearTimeout;
    }
  });

  it("circuit breaker is thread-safe across concurrent calls", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5 });
    const fakeFetch = vi.fn(
      async () =>
        new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;

    const client = new MercadoPagoClient({
      accessToken: "TEST-fake",
      fetch: fakeFetch,
      maxRetries: 0,
      circuitBreaker: breaker,
    });

    // 20 concurrent calls hit the breaker. Some will trip the breaker; the rest
    // get rejected fast. State must converge to OPEN.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }).map((_, i) => client.getPayment(String(i))),
    );

    // All should reject
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // Eventually OPEN
    expect(breaker.getState()).toBe("OPEN");
  });
});
