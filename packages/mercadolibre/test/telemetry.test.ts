import { describe, it, expect, vi } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import { MeliClient, TokenBucketRateLimiter, getItem } from "../src";

describe("telemetry hooks", () => {
  it("fires onRequest + onResponse with correlated requestId", async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const fm = mockFetch()
      .on("GET", "/items/MLA1", () => ({
        status: 200,
        body: { id: "MLA1", title: "T", price: 100, currency_id: "ARS" },
        headers: { "x-request-id": "meli-abc-123" },
      }))
      .build();
    const client = new MeliClient({
      auth: { kind: "bearer", accessToken: "t" },
      fetch: fm.fetch,
      telemetry: { onRequest, onResponse },
    });
    await client.fetch({ method: "GET", path: "/items/MLA1" });

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onResponse).toHaveBeenCalledOnce();
    const reqEvent = onRequest.mock.calls[0]![0];
    const resEvent = onResponse.mock.calls[0]![0];
    expect(reqEvent.requestId).toBeTruthy();
    expect(reqEvent.requestId).toBe(resEvent.requestId);
    expect(reqEvent.path).toBe("/items/MLA1");
    expect(resEvent.status).toBe(200);
    expect(resEvent.attempts).toBe(1);
    expect(resEvent.meliRequestId).toBe("meli-abc-123");
    expect(resEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fires onRetry on transient failures", async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const fm = mockFetch()
      .on("GET", "/items/MLA2", () => {
        calls++;
        if (calls < 2) return { status: 503, body: { error: "down" } };
        return { status: 200, body: { id: "MLA2" } };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    // makeMeliClient doesn't accept telemetry directly; test via direct ctor
    const direct = new MeliClient({
      auth: { kind: "bearer", accessToken: "t" },
      fetch: fm.fetch,
      retry: { maxAttempts: 3, baseDelayMs: 1, jitter: 0 },
      telemetry: { onRetry },
    });
    await direct.fetch({ method: "GET", path: "/items/MLA2" });
    expect(onRetry).toHaveBeenCalled();
    const evt = onRetry.mock.calls[0]![0];
    expect(evt.reason).toBe("status");
    expect(evt.status).toBe(503);
    expect(client).toBeTruthy(); // unused, satisfy lint
  });

  it("respects user's retry.onRetry alongside telemetry hook", async () => {
    const userOnRetry = vi.fn();
    const telemetryOnRetry = vi.fn();
    let calls = 0;
    const fm = mockFetch()
      .on("GET", "/items/MLA3", () => {
        calls++;
        if (calls < 2) return { status: 502, body: {} };
        return { status: 200, body: { id: "MLA3" } };
      })
      .build();
    const client = new MeliClient({
      auth: { kind: "bearer", accessToken: "t" },
      fetch: fm.fetch,
      retry: { maxAttempts: 3, baseDelayMs: 1, jitter: 0, onRetry: userOnRetry },
      telemetry: { onRetry: telemetryOnRetry },
    });
    await client.fetch({ method: "GET", path: "/items/MLA3" });
    expect(userOnRetry).toHaveBeenCalled();
    expect(telemetryOnRetry).toHaveBeenCalled();
  });

  it("does not fire onRateLimitWait when there is no wait", async () => {
    // The client measures Date.now() around `await rateLimiter.acquire()`.
    // Even with a full bucket (instant acquire), the real clock can tick 1ms
    // across that await under CI jitter, firing the hook spuriously. Freeze
    // the clock (same de-flake as mercadopago's rate-limiter test, PR #78)
    // so a no-wait acquire measures exactly 0ms.
    vi.useFakeTimers();
    try {
      const onRateLimitWait = vi.fn();
      const fm = mockFetch()
        .on("GET", "/x", () => ({ status: 200, body: {} }))
        .build();
      const client = new MeliClient({
        auth: { kind: "bearer", accessToken: "t" },
        fetch: fm.fetch,
        telemetry: { onRateLimitWait },
      });
      await client.fetch({ method: "GET", path: "/x" });
      // Bucket starts full; wait is 0 → hook NOT called.
      expect(onRateLimitWait).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onRateLimitWait when the limiter makes the request wait", async () => {
    vi.useFakeTimers();
    try {
      const onRateLimitWait = vi.fn();
      const fm = mockFetch()
        .on("GET", "/x", () => ({ status: 200, body: {} }))
        .build();
      const client = new MeliClient({
        auth: { kind: "bearer", accessToken: "t" },
        fetch: fm.fetch,
        rateLimiter: new TokenBucketRateLimiter({
          refillPerSecond: 1,
          burst: 1,
          idleEvictMs: 0,
        }),
        telemetry: { onRateLimitWait },
      });
      // First request consumes the only token; the second must wait ~1s.
      await client.fetch({ method: "GET", path: "/x" });
      expect(onRateLimitWait).not.toHaveBeenCalled();
      const second = client.fetch({ method: "GET", path: "/x" });
      await vi.advanceTimersByTimeAsync(1000);
      await second;
      expect(onRateLimitWait).toHaveBeenCalledOnce();
      expect(onRateLimitWait.mock.calls[0]![0].waitMs).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("works correctly when no telemetry is configured (zero overhead)", async () => {
    const fm = mockFetch()
      .on("GET", "/items/MLA4", () => ({
        status: 200,
        body: {
          id: "MLA4",
          site_id: "MLA",
          title: "T",
          seller_id: 1,
          category_id: "MLA1071",
          price: 100,
          currency_id: "ARS",
          available_quantity: 1,
          condition: "new",
          buying_mode: "buy_it_now",
          listing_type_id: "gold_special",
          status: "active",
          permalink: "https://x.example/MLA4",
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const r = await getItem(client, "MLA4");
    expect(r).toBeTruthy();
  });
});
