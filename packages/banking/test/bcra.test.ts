import { describe, expect, it, vi } from "vitest";
import {
  BcraPublicApiAdapter,
  UnconfiguredBcraAdapter,
} from "../src/bcra";

describe("UnconfiguredBcraAdapter", () => {
  it("always returns available: false with setup instructions", async () => {
    const adapter = new UnconfiguredBcraAdapter();
    const result = await adapter.lookup("20417581015");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    expect(result.error).toMatch(/BcraDeudaAdapter/);
    expect(result.data).toBeNull();
    expect(result.cuit).toBe("20417581015");
  });
});

describe("BcraPublicApiAdapter — happy path", () => {
  it("hits the configured endpoint and returns normalized data", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: {
              identificacion: 20417581015,
              denominacion: "CLEMENTE NAZARENO",
              periodos: [
                {
                  periodo: "202604",
                  entidades: [
                    {
                      entidad: "BANCO MACRO S.A.",
                      situacion: 1,
                      monto: 35.5,
                      diasAtrasoPago: 0,
                      refinanciaciones: "N",
                    },
                    {
                      entidad: "MERCADO PAGO",
                      situacion: 2,
                      monto: 1500.0,
                      diasAtrasoPago: 45,
                      refinanciaciones: "N",
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const result = await adapter.lookup("20417581015");

    expect(result.available).toBe(true);
    expect(result.data?.name).toBe("CLEMENTE NAZARENO");
    expect(result.data?.period).toBe("202604");
    expect(result.data?.worstSituation).toBe(2);
    expect(result.data?.totalAmount).toBe(1535.5);
    expect(result.data?.entities).toHaveLength(2);
    expect(result.data?.entities[0]!.entity).toBe("BANCO MACRO S.A.");
    expect(fakeFetch).toHaveBeenCalledWith(
      "https://api.test/deudas/20417581015",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("BcraPublicApiAdapter — error paths", () => {
  it("treats HTTP 404 as a clean 'not in registry' response", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("Not Found", { status: 404 }),
    ) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const result = await adapter.lookup("99999999999");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/no tiene registro/i);
  });

  it("retries on 5xx and surfaces the final error", async () => {
    let calls = 0;
    const fakeFetch = vi.fn(async () => {
      calls++;
      return new Response("server error", { status: 500 });
    }) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      maxRetries: 2,
    });
    const result = await adapter.lookup("20417581015");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it("invokes the onCall observability hook", async () => {
    const onCall = vi.fn();
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: { identificacion: 1 } }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      onCall,
      maxRetries: 0,
    });
    await adapter.lookup("20417581015");
    expect(onCall).toHaveBeenCalledOnce();
    expect(onCall).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "bcra.deudas.lookup",
        httpStatus: 200,
        success: true,
      }),
    );
  });

  it("returns available: false when results field is missing", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const result = await adapter.lookup("20417581015");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/sin campo/i);
  });

  it("aborts on per-request timeout and returns an error", async () => {
    // fetch that ignores the abort signal and resolves slowly
    const fakeFetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      requestTimeoutMs: 50,
      maxRetries: 0,
    });
    const result = await adapter.lookup("20417581015");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/aborted|abort/i);
  });

  it("propagates network errors with retries exhausted", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const adapter = new BcraPublicApiAdapter({
      endpoint: "https://api.test/deudas",
      fetchImpl: fakeFetch,
      maxRetries: 2,
    });
    const result = await adapter.lookup("20417581015");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});
