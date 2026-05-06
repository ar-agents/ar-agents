import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { MercadoPagoClient } from "../src/client";

/**
 * Auto-on idempotency for state-mutating POST requests.
 *
 * Mercado Pago's API supports the X-Idempotency-Key header for safe retries
 * on every mutating endpoint. Naive callers (and the LLM tools layer) often
 * forget to pass one, leaving them exposed to double-charge bugs on network
 * partitions. We auto-generate a UUID v4 when no key is provided so the
 * default behavior is "safe".
 */

const captured: { url: string; method: string; idempotencyKey: string | null }[] = [];

afterEach(() => {
  captured.length = 0;
});

const captureHandler = (status: number, json: object) => async ({ request }: { request: Request }) => {
  captured.push({
    url: request.url,
    method: request.method,
    idempotencyKey: request.headers.get("x-idempotency-key"),
  });
  return HttpResponse.json(json, { status });
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("MercadoPagoClient — idempotency-by-default", () => {
  it("auto-generates a UUID v4 for createPayment when caller omits key", async () => {
    server.use(
      http.post(
        "https://api.mercadopago.com/v1/payments",
        captureHandler(201, { id: 9999, status: "approved" }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.createPayment({
      transactionAmount: 1000,
      paymentMethodId: "account_money",
      payerEmail: "test@example.com",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].idempotencyKey).toMatch(UUID_V4);
  });

  it("auto-generates a key for createPreference (no idempotencyKey param exposed)", async () => {
    server.use(
      http.post(
        "https://api.mercadopago.com/checkout/preferences",
        captureHandler(201, {
          id: "pref-123",
          init_point: "https://mp.example/checkout/pref-123",
        }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.createPreference({
      items: [{ title: "Plan", quantity: 1, unit_price: 1500 }],
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].idempotencyKey).toMatch(UUID_V4);
  });

  it("honors caller-supplied key over auto-gen (deterministic retries)", async () => {
    server.use(
      http.post(
        "https://api.mercadopago.com/v1/payments",
        captureHandler(201, { id: 1234, status: "approved" }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.createPayment({
      transactionAmount: 1000,
      paymentMethodId: "account_money",
      payerEmail: "test@example.com",
      idempotencyKey: "my-deterministic-key-123",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].idempotencyKey).toBe("my-deterministic-key-123");
  });

  it("generates DIFFERENT keys per call (not a constant)", async () => {
    server.use(
      http.post(
        "https://api.mercadopago.com/v1/payments",
        captureHandler(201, { id: 1, status: "approved" }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.createPayment({
      transactionAmount: 1000,
      paymentMethodId: "account_money",
      payerEmail: "a@example.com",
    });
    await client.createPayment({
      transactionAmount: 2000,
      paymentMethodId: "account_money",
      payerEmail: "b@example.com",
    });
    expect(captured).toHaveLength(2);
    expect(captured[0].idempotencyKey).not.toBe(captured[1].idempotencyKey);
    expect(captured[0].idempotencyKey).toMatch(UUID_V4);
    expect(captured[1].idempotencyKey).toMatch(UUID_V4);
  });

  it("does NOT auto-generate a key for GET requests", async () => {
    server.use(
      http.get(
        "https://api.mercadopago.com/v1/payments/:id",
        captureHandler(200, { id: 9999, status: "approved" }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.getPayment("9999");
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].idempotencyKey).toBeNull();
  });

  it("auto-generates for createPreapproval (subscription)", async () => {
    server.use(
      http.post(
        "https://api.mercadopago.com/preapproval",
        captureHandler(201, {
          id: "abc",
          status: "authorized",
          init_point: "https://mp.example/checkout/abc",
        }),
      ),
    );
    const client = new MercadoPagoClient({ accessToken: "TEST-token" });
    await client.createPreapproval({
      reason: "Plan Pro",
      autoRecurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 25000,
        currency_id: "ARS",
      },
      payerEmail: "test@example.com",
      backUrl: "https://example.com/done",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].idempotencyKey).toMatch(UUID_V4);
  });
});
