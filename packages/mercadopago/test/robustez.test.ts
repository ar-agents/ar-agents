import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { MercadoPagoClient } from "../src";

const MP_BASE = "https://api.mercadopago.com";

describe("Robustez — timeout + retry + onCall hooks", () => {
  describe("retry on 5xx", () => {
    it("retries once on 503, succeeds on 2nd attempt", async () => {
      let calls = 0;
      server.use(
        http.get(`${MP_BASE}/users/me`, () => {
          calls++;
          if (calls === 1) {
            return new HttpResponse("Service Unavailable", { status: 503 });
          }
          return HttpResponse.json({ id: 999, email: "x@y.com", site_id: "MLA", country_id: "AR" });
        }),
      );

      const client = new MercadoPagoClient({
        accessToken: "TEST-x",
        maxRetries: 1,
      });
      const me = await client.getMe();
      expect(String(me.id)).toBe("999"); // shape varies (number vs string transform)
      expect(calls).toBe(2);
    });

    it("does NOT retry on 4xx", async () => {
      let calls = 0;
      server.use(
        http.get(`${MP_BASE}/users/me`, () => {
          calls++;
          return HttpResponse.json({ message: "Bad request", code: 400 }, { status: 400 });
        }),
      );

      const client = new MercadoPagoClient({ accessToken: "TEST-x", maxRetries: 3 });
      await expect(client.getMe()).rejects.toThrow();
      expect(calls).toBe(1);
    });

    it("respects maxRetries=0 (no retries)", async () => {
      let calls = 0;
      server.use(
        http.get(`${MP_BASE}/users/me`, () => {
          calls++;
          return new HttpResponse("Service Unavailable", { status: 503 });
        }),
      );
      const client = new MercadoPagoClient({ accessToken: "TEST-x", maxRetries: 0 });
      await expect(client.getMe()).rejects.toThrow();
      expect(calls).toBe(1);
    });
  });

  describe("onCall observability hook", () => {
    it("fires after a successful request with full event data", async () => {
      server.use(
        http.get(`${MP_BASE}/users/me`, () =>
          HttpResponse.json({ id: 1, email: "a@b.com", site_id: "MLA", country_id: "AR" }),
        ),
      );
      const events: Array<{
        method: string;
        path: string;
        durationMs: number;
        httpStatus: number | null;
        retried: number;
        success: boolean;
      }> = [];
      const client = new MercadoPagoClient({
        accessToken: "TEST-x",
        onCall: (e) => events.push(e),
      });
      await client.getMe();
      expect(events).toHaveLength(1);
      expect(events[0]!.method).toBe("GET");
      expect(events[0]!.path).toBe("/users/me");
      expect(events[0]!.success).toBe(true);
      expect(events[0]!.httpStatus).toBe(200);
      expect(events[0]!.retried).toBe(0);
      expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fires after a failed request with retried count", async () => {
      let calls = 0;
      server.use(
        http.get(`${MP_BASE}/users/me`, () => {
          calls++;
          return new HttpResponse("nope", { status: 503 });
        }),
      );
      const events: Array<{ retried: number; success: boolean }> = [];
      const client = new MercadoPagoClient({
        accessToken: "TEST-x",
        maxRetries: 2,
        onCall: (e) => events.push(e),
      });
      await expect(client.getMe()).rejects.toThrow();
      expect(events).toHaveLength(1);
      expect(events[0]!.retried).toBe(2);
      expect(events[0]!.success).toBe(false);
    });
  });

  describe("timeout (AbortSignal)", () => {
    it("aborts after requestTimeoutMs and throws timeout error", async () => {
      server.use(
        http.get(`${MP_BASE}/users/me`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ id: 1 });
        }),
      );
      const client = new MercadoPagoClient({
        accessToken: "TEST-x",
        requestTimeoutMs: 50,
        maxRetries: 0,
      });
      await expect(client.getMe()).rejects.toThrow(/timed out/i);
    }, 1000);
  });
});

describe("Deterministic idempotency keys (in tools)", () => {
  it("create_payment with same inputs produces same idempotency key on retry", async () => {
    const headers: string[] = [];
    server.use(
      http.post(`${MP_BASE}/v1/payments`, async ({ request }) => {
        const idemKey = request.headers.get("x-idempotency-key");
        if (idemKey) headers.push(idemKey);
        return HttpResponse.json({
          id: "p1",
          status: "approved",
          status_detail: "accredited",
          transaction_amount: 100,
          currency_id: "ARS",
          installments: 1,
          payment_method_id: "account_money",
          payer: { email: "b@x.com" },
        });
      }),
    );
    const { mercadoPagoTools, InMemoryStateAdapter } = await import("../src");
    const client = new MercadoPagoClient({ accessToken: "TEST-x" });
    const tools = mercadoPagoTools(client, {
      state: new InMemoryStateAdapter(),
      backUrl: "https://x.test/done",
    });

    const args = {
      amount_ars: 100,
      payment_method_id: "account_money",
      payer_email: "b@x.com",
      external_reference: "order-abc",
    };
    await tools.create_payment!.execute!(args, {} as never);
    await tools.create_payment!.execute!(args, {} as never);

    expect(headers).toHaveLength(2);
    expect(headers[0]).toBe(headers[1]); // SAME key — MP will dedupe
  });
});
