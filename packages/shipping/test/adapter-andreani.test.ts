import { describe, expect, it, vi } from "vitest";
import { AndreaniAdapter } from "../src/adapter-andreani";
import type { Address, PackageInfo } from "../src/types";

const origin: Address = {
  name: "Naza",
  street: "Calle Falsa",
  number: "468",
  city: "Monte Grande",
  state: "B",
  postalCode: "1842",
  country: "AR",
};
const dest: Address = {
  name: "Buyer",
  street: "Av. Corrientes",
  number: "1234",
  city: "CABA",
  state: "C",
  postalCode: "1043",
  country: "AR",
  phone: "+5491111111111",
};
const pkg: PackageInfo = {
  weightKg: 1.5,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
  declaredValueArs: 5000,
};

describe("AndreaniAdapter — construction", () => {
  it("throws without username + password", () => {
    expect(
      () =>
        new AndreaniAdapter({
          username: "",
          password: "",
          clientNumber: "111",
        } as never),
    ).toThrow(/username \+ password/);
  });

  it("throws without clientNumber", () => {
    expect(
      () =>
        new AndreaniAdapter({
          username: "u",
          password: "p",
          clientNumber: "",
        } as never),
    ).toThrow(/clientNumber/);
  });
});

describe("AndreaniAdapter — cotizar", () => {
  it("hits /v2/tarifas with the right query params + Basic auth", async () => {
    let capturedUrl = "";
    let capturedAuth = "";
    const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      return new Response(
        JSON.stringify({
          tarifaConIva: { total: 5500 },
          plazoEntrega: 4,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const a = new AndreaniAdapter({
      username: "user",
      password: "pass",
      clientNumber: "999",
      env: "homo",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const quote = await a.cotizar({
      origin,
      destination: dest,
      packages: [pkg],
      service: "standard",
    });

    expect(quote.carrier).toBe("andreani");
    expect(quote.costArs).toBe(5500);
    expect(quote.estimatedDaysMax).toBe(4);
    expect(capturedUrl).toContain("apisqa.andreani.com");
    expect(capturedUrl).toContain("cpDestino=1043");
    expect(capturedUrl).toContain("cpOrigen=1842");
    expect(capturedUrl).toContain("cliente=999");
    expect(capturedAuth).toMatch(/^Basic /);
  });

  it("throws ShippingNotSupportedError for service=same_day", async () => {
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(
      a.cotizar({ origin, destination: dest, packages: [pkg], service: "same_day" }),
    ).rejects.toThrow(/same_day/);
  });
});

describe("AndreaniAdapter — trackear", () => {
  it("normalizes Andreani statuses to TrackingStatus", async () => {
    const fakeFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          eventos: [
            { fecha: "2026-05-01T10:00:00Z", estado: "Etiqueta admitida", traduccion: "Etiqueta generada" },
            { fecha: "2026-05-02T10:00:00Z", estado: "En tránsito hacia destino" },
            { fecha: "2026-05-03T08:00:00Z", estado: "En reparto" },
            { fecha: "2026-05-03T18:00:00Z", estado: "Entregado al destinatario" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const r = await a.trackear("ABC123");
    expect(r.events).toHaveLength(4);
    expect(r.events[0]!.status).toBe("label_created");
    expect(r.events[1]!.status).toBe("in_transit");
    expect(r.events[2]!.status).toBe("out_for_delivery");
    expect(r.events[3]!.status).toBe("delivered");
    expect(r.currentStatus).toBe("delivered");
    expect(r.deliveredAt).toBeTruthy();
  });
});

describe("AndreaniAdapter — crear", () => {
  it("returns the real cost from tarifaConIva", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            numeroAndreani: "360000123456789",
            idEnvio: "env-123",
            tarifaConIva: { total: 6200 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const r = await a.crear({ origin, destination: dest, packages: [pkg] });
    expect(r.trackingNumber).toBe("360000123456789");
    expect(r.costArs).toBe(6200);
  });

  it("throws (not costArs:0) when the create response omits tarifaConIva", async () => {
    // Real Andreani create success shape without a rate block.
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            numeroAndreani: "360000123456789",
            idEnvio: "env-123",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    await expect(
      a.crear({ origin, destination: dest, packages: [pkg] }),
    ).rejects.toThrow(/missing tarifaConIva/);
  });

  it("does NOT retry a create on timeout (non-idempotent POST)", async () => {
    const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      // Simulate the AbortController firing (timeout) exactly like fetch does.
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        const err = new DOMException("The operation was aborted.", "AbortError");
        if (signal?.aborted) return reject(err);
        signal?.addEventListener("abort", () => reject(err));
      });
    }) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      requestTimeoutMs: 10,
      // maxRetries defaults to 1 — a create must still not retry.
    });
    await expect(
      a.crear({ origin, destination: dest, packages: [pkg] }),
    ).rejects.toThrow();
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});

describe("AndreaniAdapter — cancelar", () => {
  it("reports the real cancelado flag", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ cancelado: true, motivo: "a pedido" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    const r = await a.cancelar("360000123456789");
    expect(r.canceled).toBe(true);
    expect(r.reason).toBe("a pedido");
  });

  it("throws (not canceled:true) on a 2xx that omits cancelado", async () => {
    const fakeFetch = vi.fn(
      async () =>
        // Bare 2xx with no body → res.ok true but no `cancelado` field.
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    await expect(a.cancelar("360000123456789")).rejects.toThrow(
      /missing cancelado/,
    );
  });

  it("does NOT retry a cancel on 5xx (non-idempotent POST)", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response("upstream error", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      // maxRetries defaults to 1 — a cancel must still not retry.
    });
    await expect(a.cancelar("360000123456789")).rejects.toThrow(/HTTP 502/);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});

describe("AndreaniAdapter — error path", () => {
  it("throws ShippingCarrierError on HTTP 4xx", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "bad request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const a = new AndreaniAdapter({
      username: "u",
      password: "p",
      clientNumber: "1",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    await expect(
      a.cotizar({ origin, destination: dest, packages: [pkg] }),
    ).rejects.toThrow(/HTTP 400/);
  });
});
