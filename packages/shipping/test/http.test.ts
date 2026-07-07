/**
 * shippingFetch tests: the shared timeout + retry helper is now built on
 * @ar-agents/core's retry engine. Pins the behavior the adapters rely on:
 *   - idempotent requests retry per-attempt timeouts and transient 5xx;
 *   - non-idempotent writes are NEVER retried (duplicate-shipment safety);
 *   - a still-failing 5xx is RETURNED (not thrown) after retries run out, so
 *     adapters can decode the carrier error body;
 *   - onCall observability fires once per attempt.
 */

import { describe, expect, it } from "vitest";
import { shippingFetch } from "../src/http";

type OnCallEvent = {
  label: string;
  durationMs: number;
  httpStatus: number | null;
  retried: number;
  success: boolean;
};

/** A fetch that hangs until the request's abort signal fires (simulates a timeout). */
function hangUntilAborted(counter: { calls: number }): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    counter.calls++;
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
    });
  }) as unknown as typeof fetch;
}

describe("shippingFetch timeout handling", () => {
  it("retries an idempotent GET after a per-attempt timeout and succeeds", async () => {
    let calls = 0;
    const impl = ((_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1) {
        // First attempt hangs until the per-attempt timeout aborts it.
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
        });
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;

    const events: OnCallEvent[] = [];
    const res = await shippingFetch({
      url: "https://carrier.test/tarifas",
      init: { method: "GET" },
      fetchImpl: impl,
      requestTimeoutMs: 25,
      maxRetries: 1,
      carrier: "andreani",
      operation: "cotizar",
      onCall: (e) => events.push(e),
    });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ httpStatus: null, retried: 0, success: false });
    expect(events[1]).toMatchObject({ httpStatus: 200, retried: 1, success: true });
  });

  it("does NOT retry a non-idempotent POST on timeout", async () => {
    const counter = { calls: 0 };
    await expect(
      shippingFetch({
        url: "https://carrier.test/ordenes",
        init: { method: "POST", body: "{}" },
        fetchImpl: hangUntilAborted(counter),
        requestTimeoutMs: 25,
        maxRetries: 3,
        idempotent: false,
        carrier: "andreani",
        operation: "crear",
      }),
    ).rejects.toThrow();
    expect(counter.calls).toBe(1);
  });
});

describe("shippingFetch 5xx handling", () => {
  it("retries a transient 5xx on an idempotent request and returns the eventual 200", async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      if (calls === 1) return new Response("boom", { status: 503 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await shippingFetch({
      url: "https://carrier.test/tracking",
      init: { method: "GET" },
      fetchImpl: impl,
      maxRetries: 1,
      carrier: "oca",
      operation: "tracking",
    });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("returns (not throws) the last 5xx response after retries are exhausted", async () => {
    let calls = 0;
    const events: OnCallEvent[] = [];
    const impl = (async () => {
      calls++;
      return new Response("still broken", { status: 502 });
    }) as unknown as typeof fetch;
    const res = await shippingFetch({
      url: "https://carrier.test/tracking",
      init: { method: "GET" },
      fetchImpl: impl,
      maxRetries: 1,
      carrier: "correo",
      operation: "tracking",
      onCall: (e) => events.push(e),
    });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("still broken");
    expect(calls).toBe(2);
    expect(events.map((e) => e.success)).toEqual([false, false]);
  });

  it("returns a 5xx immediately (single attempt) when idempotent: false", async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;
    const res = await shippingFetch({
      url: "https://carrier.test/ordenes",
      init: { method: "POST", body: "{}" },
      fetchImpl: impl,
      maxRetries: 3,
      idempotent: false,
      carrier: "andreani",
      operation: "crear",
    });
    expect(res.status).toBe(500);
    expect(calls).toBe(1);
  });

  it("passes a 4xx through untouched without retrying", async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response("bad request", { status: 400 });
    }) as unknown as typeof fetch;
    const res = await shippingFetch({
      url: "https://carrier.test/tarifas",
      init: { method: "GET" },
      fetchImpl: impl,
      maxRetries: 2,
      carrier: "andreani",
      operation: "cotizar",
    });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
  });
});
