import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "../src";

/**
 * `requireConfirmation` is the v0.15 programmatic HITL gate (per the /review
 * audit's CRITICAL finding that description-based HITL alone is theater
 * against prompt injection). When the callback returns false, the gated
 * tool returns `{ ok: false, reason: ... }` WITHOUT touching MP. When true,
 * the original execute runs.
 *
 * 8 ops are gated: cancel_payment, capture_payment, refund_payment,
 * delete_customer_card, cancel_qr_payment, cancel_order,
 * cancel_point_payment_intent, delete_webhook.
 */

function buildClient() {
  return new MercadoPagoClient({ accessToken: "TEST-token" });
}

function buildTools(opts: { requireConfirmation?: (op: string, args: unknown) => Promise<boolean> } = {}) {
  return mercadoPagoTools(buildClient(), {
    state: new InMemoryStateAdapter(),
    backUrl: "https://example.com/done",
    ...(opts.requireConfirmation
      ? { requireConfirmation: opts.requireConfirmation as never }
      : {}),
  });
}

describe("requireConfirmation gate — declined", () => {
  it("blocks refund_payment when callback returns false", async () => {
    const callback = vi.fn().mockResolvedValue(false);
    let mpHit = false;
    server.use(
      http.post("https://api.mercadopago.com/v1/payments/:id/refunds", () => {
        mpHit = true;
        return HttpResponse.json({ id: 999, status: "approved" });
      }),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.refund_payment.execute(
      { payment_id: "12345" } as never,
      {} as never,
    )) as { ok: boolean; reason: string; operation: string };

    expect(callback).toHaveBeenCalledWith("refund_payment", { payment_id: "12345" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/declined/i);
    expect(result.operation).toBe("refund_payment");
    expect(mpHit).toBe(false); // confirms MP was NEVER called
  });

  it("blocks cancel_payment when callback returns false", async () => {
    const callback = vi.fn().mockResolvedValue(false);
    let mpHit = false;
    server.use(
      http.put("https://api.mercadopago.com/v1/payments/:id", () => {
        mpHit = true;
        return HttpResponse.json({ id: 999, status: "cancelled" });
      }),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.cancel_payment.execute(
      { payment_id: "999" } as never,
      {} as never,
    )) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(mpHit).toBe(false);
  });

  it("blocks delete_customer_card when callback returns false", async () => {
    const callback = vi.fn().mockResolvedValue(false);
    let mpHit = false;
    server.use(
      http.delete("https://api.mercadopago.com/v1/customers/:cid/cards/:card", () => {
        mpHit = true;
        return HttpResponse.json({ id: "card_x", deleted: true });
      }),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.delete_customer_card.execute(
      { customer_id: "cust", card_id: "card_x" } as never,
      {} as never,
    )) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(mpHit).toBe(false);
  });
});

describe("requireConfirmation gate — approved", () => {
  it("proceeds with refund_payment when callback returns true", async () => {
    const callback = vi.fn().mockResolvedValue(true);
    server.use(
      http.post("https://api.mercadopago.com/v1/payments/:id/refunds", () => {
        return HttpResponse.json({ id: 999, status: "approved", amount: 100 });
      }),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.refund_payment.execute(
      { payment_id: "12345" } as never,
      {} as never,
    )) as { refund_id?: number; status?: string };
    expect(callback).toHaveBeenCalled();
    // When approved, original execute runs and we get the real result
    expect(result.refund_id).toBe(999);
    expect(result.status).toBe("approved");
  });
});

describe("requireConfirmation gate — non-gated tools UNAFFECTED", () => {
  it("get_payment is not gated even with requireConfirmation set", async () => {
    const callback = vi.fn().mockResolvedValue(false);
    server.use(
      http.get("https://api.mercadopago.com/v1/payments/:id", () =>
        HttpResponse.json({ id: 12345, status: "approved" }),
      ),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.get_payment.execute(
      { payment_id: "12345" } as never,
      {} as never,
    )) as { payment_id?: number };
    expect(callback).not.toHaveBeenCalled(); // read-only — never gated
    expect(result.payment_id).toBe(12345);
  });

  it("create_subscription (mutating but reversible) is not gated", async () => {
    const callback = vi.fn().mockResolvedValue(false);
    server.use(
      http.post("https://api.mercadopago.com/preapproval", () =>
        HttpResponse.json({
          id: "sub-1",
          status: "pending",
          init_point: "https://mp.example/pay/sub-1",
        }),
      ),
    );
    const tools = buildTools({ requireConfirmation: callback });
    const result = (await tools.create_subscription.execute(
      {
        customer_email: "u@example.com",
        amount_ars: 1500,
        frequency_months: 1,
        reason: "Plan Pro",
      } as never,
      {} as never,
    )) as { subscription_id?: string };
    expect(callback).not.toHaveBeenCalled(); // create is reversible (cancel later)
    expect(result.subscription_id).toBe("sub-1");
  });
});

describe("requireConfirmation gate — backwards compat", () => {
  it("without requireConfirmation, gated tools execute normally (description-only HITL)", async () => {
    server.use(
      http.post("https://api.mercadopago.com/v1/payments/:id/refunds", () =>
        HttpResponse.json({ id: 999, status: "approved", amount: 100 }),
      ),
    );
    const tools = buildTools(); // no requireConfirmation
    const result = (await tools.refund_payment.execute(
      { payment_id: "12345" } as never,
      {} as never,
    )) as { refund_id?: number };
    expect(result.refund_id).toBe(999);
  });
});

describe("requireConfirmation gate — error propagation", () => {
  it("propagates errors thrown by the callback (not silently false)", async () => {
    const callback = vi.fn().mockRejectedValue(new Error("Slack timeout"));
    const tools = buildTools({ requireConfirmation: callback });
    await expect(
      tools.refund_payment.execute({ payment_id: "12345" } as never, {} as never),
    ).rejects.toThrow(/Slack timeout/);
  });
});
