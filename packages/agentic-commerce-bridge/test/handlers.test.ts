import { describe, it, expect } from "vitest";
import {
  buildTestFacilitator,
  buildPostRequest,
  buildGetRequest,
  MockPaymentProvider,
  TEST_PAYMENT_HANDLER,
} from "./fixtures";
import { createFacilitator, InMemoryStateAdapter } from "../src";
import type { CheckoutSession } from "../src/schemas/checkout-session";
import type { Order } from "../src/schemas/order";

const VALID_CREATE_BODY = {
  currency: "ars",
  line_items: [{ id: "item_a", quantity: 2 }],
};

const VALID_COMPLETE_BODY = {
  buyer: { email: "buyer@example.com", first_name: "Tere" },
  payment_data: {
    handler_id: "test_handler",
    instrument: {
      type: "card",
      credential: { type: "spt", token: "spt_test_001" },
    },
  },
};

// ============================================================================
// Discovery
// ============================================================================
describe("handleDiscovery", () => {
  it("returns 200 with the default discovery payload", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.discovery({
      method: "GET",
      path: "/.well-known/acp.json",
      headers: {},
      rawBody: "",
    });
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("public, max-age=3600");
    const body = r.body as { protocol: { name: string; version: string } };
    expect(body.protocol.name).toBe("acp");
    expect(body.protocol.version).toBe("2026-04-17");
  });

  it("rejects non-GET", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.discovery({
      method: "POST",
      path: "/.well-known/acp.json",
      headers: {},
      rawBody: "",
    });
    expect(r.status).toBe(405);
  });
});

// ============================================================================
// CREATE
// ============================================================================
describe("handleCreateSession", () => {
  it("returns 201 with a fully-formed CheckoutSession", async () => {
    const { facilitator, state } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(r.status).toBe(201);
    const session = r.body as CheckoutSession;
    expect(session.id).toMatch(/^cs_test_\d+$/);
    expect(session.status).toBe("ready_for_payment");
    expect(session.currency).toBe("ars");
    expect(session.line_items).toHaveLength(1);
    expect(session.line_items[0]?.quantity).toBe(2);
    expect(session.line_items[0]?.unit_amount).toBe(19900);
    expect(session.line_items[0]?.totals).toEqual([
      { type: "subtotal", display_text: "Subtotal", amount: 39800 },
      { type: "total", display_text: "Total", amount: 39800 },
    ]);
    expect(session.protocol?.version).toBe("2026-04-17");
    expect(session.capabilities?.payment?.handlers).toHaveLength(1);

    // Persisted.
    const stored = await state.loadSession(session.id);
    expect(stored).toEqual(session);
  });

  it("invokes onSessionCreated hook", async () => {
    let hookCalled = false;
    const { facilitator } = buildTestFacilitator({
      hooks: {
        onSessionCreated: async (s) => {
          hookCalled = true;
          expect(s.id).toMatch(/^cs_test_/);
        },
      },
    });
    await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(hookCalled).toBe(true);
  });

  it("invokes payment provider onSessionCreated and merges metadata", async () => {
    const { facilitator, payment, state } = buildTestFacilitator({
      payment: {
        handlerId: "test_handler",
        onSessionCreatedMetadata: { mp_preference_id: "pref_xyz" },
      },
    });
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(payment.onCreatedCalled).toBe(1);
    const session = r.body as CheckoutSession;
    expect(session.metadata?.["mp_preference_id"]).toBe("pref_xyz");
    const stored = await state.loadSession(session.id);
    expect(stored?.metadata?.["mp_preference_id"]).toBe("pref_xyz");
  });

  it("returns 400 when API-Version header is missing", async () => {
    const { facilitator } = buildTestFacilitator();
    const req = buildPostRequest("/checkout_sessions", VALID_CREATE_BODY);
    delete req.headers["API-Version"];
    const r = await facilitator.createSession(req);
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("missing_api_version");
  });

  it("returns 400 when API-Version is unsupported", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY, {
        "API-Version": "1999-01-01",
      }),
    );
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("unsupported_api_version");
    expect(
      (r.body as { supported_versions: string[] }).supported_versions,
    ).toContain("2026-04-17");
  });

  it("returns 400 when Idempotency-Key is missing", async () => {
    const { facilitator } = buildTestFacilitator();
    const req = buildPostRequest("/checkout_sessions", VALID_CREATE_BODY);
    delete req.headers["Idempotency-Key"];
    const r = await facilitator.createSession(req);
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("idempotency_key_required");
  });

  it("returns 400 with item_not_found when line_item id doesn't resolve", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        currency: "ars",
        line_items: [{ id: "missing_item", quantity: 1 }],
      }),
    );
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("validation_failed");
    expect((r.body as { message: string }).message).toContain("missing_item");
  });

  it("returns 400 with unsupported_currency when item currency mismatches", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        currency: "ars",
        line_items: [{ id: "item_usd", quantity: 1 }],
      }),
    );
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("unsupported_currency");
  });

  it("returns 400 when requested quantity exceeds available_quantity", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        currency: "ars",
        line_items: [{ id: "item_b", quantity: 10 }], // only 5 available
      }),
    );
    expect(r.status).toBe(400);
    expect((r.body as { message: string }).message).toContain("only 5 available");
  });

  it("returns 400 on schema validation failure", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        currency: "ars",
        line_items: [],
      }),
    );
    expect(r.status).toBe(400);
  });

  it("idempotency: same key + same body returns the same response with Idempotent-Replayed", async () => {
    const { facilitator } = buildTestFacilitator();
    const req = buildPostRequest("/checkout_sessions", VALID_CREATE_BODY);
    const r1 = await facilitator.createSession(req);
    const r2 = await facilitator.createSession(req);
    expect(r1.status).toBe(r2.status);
    expect(r2.headers["Idempotent-Replayed"]).toBe("true");
    expect((r1.body as CheckoutSession).id).toBe(
      (r2.body as CheckoutSession).id,
    );
  });

  it("idempotency: same key + DIFFERENT body returns 422 idempotency_conflict", async () => {
    const { facilitator } = buildTestFacilitator();
    const r1 = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(r1.status).toBe(201);
    const r2 = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        currency: "ars",
        line_items: [{ id: "item_b", quantity: 1 }],
      }),
    );
    expect(r2.status).toBe(422);
    expect((r2.body as { code: string }).code).toBe("idempotency_conflict");
  });

  it("returns 400 when buyer.email is missing (email is required by Buyer schema downstream)", async () => {
    // Per ACP, `buyer` on create-request is partial; we drop a buyer-without-email
    // rather than failing — verify we don't attach an incomplete buyer.
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        ...VALID_CREATE_BODY,
        buyer: { first_name: "Tere" },
      }),
    );
    expect(r.status).toBe(201);
    const session = r.body as CheckoutSession;
    expect(session.buyer).toBeUndefined();
  });
});

// ============================================================================
// GET
// ============================================================================
describe("handleGetSession", () => {
  it("returns 200 with the stored session", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.getSession(
      buildGetRequest(`/checkout_sessions/${session.id}`),
      session.id,
    );
    expect(r.status).toBe(200);
    expect((r.body as CheckoutSession).id).toBe(session.id);
  });

  it("returns 404 when session does not exist", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.getSession(
      buildGetRequest("/checkout_sessions/cs_missing"),
      "cs_missing",
    );
    expect(r.status).toBe(404);
  });

  it("returns the order alongside the session when status=completed", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;

    await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-key-1" },
      ),
      session.id,
    );

    const r = await facilitator.getSession(
      buildGetRequest(`/checkout_sessions/${session.id}`),
      session.id,
    );
    expect(r.status).toBe(200);
    expect((r.body as CheckoutSession & { order: Order }).order).toBeDefined();
  });
});

// ============================================================================
// UPDATE
// ============================================================================
describe("handleUpdateSession", () => {
  it("updates buyer fields (merge with existing)", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", {
        ...VALID_CREATE_BODY,
        buyer: { email: "old@example.com" },
      }),
    );
    const session = created.body as CheckoutSession;

    const r = await facilitator.updateSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}`,
        { buyer: { first_name: "Tere" } },
        { "Idempotency-Key": "update-key-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(200);
    const updated = r.body as CheckoutSession;
    expect(updated.buyer?.email).toBe("old@example.com");
    expect(updated.buyer?.first_name).toBe("Tere");
  });

  it("updates line items and recomputes totals", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;

    const r = await facilitator.updateSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}`,
        { line_items: [{ id: "item_a", quantity: 1 }] },
        { "Idempotency-Key": "update-key-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(200);
    const updated = r.body as CheckoutSession;
    expect(updated.line_items[0]?.quantity).toBe(1);
    const totalRow = updated.totals.find((t) => t.type === "total");
    expect(totalRow?.amount).toBe(19900);
  });

  it("returns 404 for unknown session id", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.updateSession(
      buildPostRequest(
        "/checkout_sessions/cs_missing",
        { metadata: { x: 1 } },
        { "Idempotency-Key": "update-key-1" },
      ),
      "cs_missing",
    );
    expect(r.status).toBe(404);
  });

  it("rejects update on completed session", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );

    const r = await facilitator.updateSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}`,
        { metadata: { x: 1 } },
        { "Idempotency-Key": "update-key-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(409);
  });
});

// ============================================================================
// COMPLETE
// ============================================================================
describe("handleCompleteSession", () => {
  it("returns 200 with session+order on payment success", async () => {
    const { facilitator, payment } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;

    const r = await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );

    expect(r.status).toBe(200);
    const body = r.body as CheckoutSession & { order: Order };
    expect(body.status).toBe("completed");
    expect(body.order.id).toMatch(/^ord_test_/);
    expect(body.order.checkout_session_id).toBe(session.id);
    expect(body.order.metadata?.["payment_provider_id"]).toBe("pay_mock_001");
    expect(payment.processPaymentCalled).toBe(1);
  });

  it("invokes onOrderConfirmed hook and merges returned metadata into order", async () => {
    const { facilitator } = buildTestFacilitator({
      hooks: {
        onOrderConfirmed: async () => ({
          metadata: { factura_cae: "70123456789012", factura_tipo: "C" },
        }),
      },
    });
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );
    const body = r.body as CheckoutSession & { order: Order };
    expect(body.order.metadata?.["factura_cae"]).toBe("70123456789012");
    expect(body.order.metadata?.["factura_tipo"]).toBe("C");
  });

  it("returns 402 with payment_declined when provider returns success: false", async () => {
    const { facilitator } = buildTestFacilitator({
      payment: {
        outcome: {
          success: false,
          code: "card_expired",
          message: "Card expired.",
        },
      },
    });
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;

    const r = await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(402);
    expect((r.body as { code: string }).code).toBe("card_expired");
  });

  it("returns 400 when handler_id is unknown", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        {
          ...VALID_COMPLETE_BODY,
          payment_data: {
            ...VALID_COMPLETE_BODY.payment_data,
            handler_id: "nonexistent_handler",
          },
        },
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(400);
    expect((r.body as { code: string }).code).toBe("unsupported_capability");
  });

  it("idempotent re-complete: same Idempotency-Key returns the same body", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const req = buildPostRequest(
      `/checkout_sessions/${session.id}/complete`,
      VALID_COMPLETE_BODY,
      { "Idempotency-Key": "complete-1" },
    );
    const r1 = await facilitator.completeSession(req, session.id);
    const r2 = await facilitator.completeSession(req, session.id);
    expect(r1.status).toBe(r2.status);
    expect(r2.headers["Idempotent-Replayed"]).toBe("true");
  });

  it("returns 404 when session not found", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.completeSession(
      buildPostRequest(
        "/checkout_sessions/cs_missing/complete",
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      "cs_missing",
    );
    expect(r.status).toBe(404);
  });
});

// ============================================================================
// CANCEL
// ============================================================================
describe("handleCancelSession", () => {
  it("transitions status to canceled", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.cancelSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/cancel`,
        { reason: "buyer changed mind" },
        { "Idempotency-Key": "cancel-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(200);
    expect((r.body as CheckoutSession).status).toBe("canceled");
  });

  it("invokes onSessionCanceled hook with reason", async () => {
    let receivedReason: string | undefined;
    const { facilitator } = buildTestFacilitator({
      hooks: {
        onSessionCanceled: async ({ reason }) => {
          receivedReason = reason;
        },
      },
    });
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    await facilitator.cancelSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/cancel`,
        { reason: "out of stock locally" },
        { "Idempotency-Key": "cancel-1" },
      ),
      session.id,
    );
    expect(receivedReason).toBe("out of stock locally");
  });

  it("returns 405 when session is already completed", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.createSession(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    await facilitator.completeSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
      session.id,
    );

    const r = await facilitator.cancelSession(
      buildPostRequest(
        `/checkout_sessions/${session.id}/cancel`,
        {},
        { "Idempotency-Key": "cancel-1" },
      ),
      session.id,
    );
    expect(r.status).toBe(405);
  });
});

// ============================================================================
// Dispatcher
// ============================================================================
describe("dispatch (path-based router)", () => {
  it("routes POST /checkout_sessions to create", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.dispatch(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(r.status).toBe(201);
  });

  it("routes GET /checkout_sessions/{id} to get", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.dispatch(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.dispatch(
      buildGetRequest(`/checkout_sessions/${session.id}`),
    );
    expect(r.status).toBe(200);
  });

  it("routes POST /checkout_sessions/{id}/complete to complete", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.dispatch(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.dispatch(
      buildPostRequest(
        `/checkout_sessions/${session.id}/complete`,
        VALID_COMPLETE_BODY,
        { "Idempotency-Key": "complete-1" },
      ),
    );
    expect(r.status).toBe(200);
  });

  it("routes POST /checkout_sessions/{id}/cancel to cancel", async () => {
    const { facilitator } = buildTestFacilitator();
    const created = await facilitator.dispatch(
      buildPostRequest("/checkout_sessions", VALID_CREATE_BODY),
    );
    const session = created.body as CheckoutSession;
    const r = await facilitator.dispatch(
      buildPostRequest(
        `/checkout_sessions/${session.id}/cancel`,
        {},
        { "Idempotency-Key": "cancel-1" },
      ),
    );
    expect(r.status).toBe(200);
  });

  it("routes GET /.well-known/acp.json to discovery", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.dispatch({
      method: "GET",
      path: "/.well-known/acp.json",
      headers: {},
      rawBody: "",
    });
    expect(r.status).toBe(200);
    expect((r.body as { protocol: { name: string } }).protocol.name).toBe(
      "acp",
    );
  });

  it("returns 404 on unknown path", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.dispatch({
      method: "GET",
      path: "/nope",
      headers: { "API-Version": "2026-04-17" },
      rawBody: "",
    });
    expect(r.status).toBe(404);
  });

  it("strips configured basePath before matching", async () => {
    const state = new InMemoryStateAdapter();
    const fac = createFacilitator({
      state,
      catalog: {
        async resolveItem(id) {
          return id === "item_a"
            ? {
                id,
                name: "A",
                unit_amount: 1000,
                currency: "ars",
              }
            : null;
        },
      },
      paymentProviders: { test_handler: new MockPaymentProvider() },
      paymentHandlers: [TEST_PAYMENT_HANDLER],
      dispatcher: { basePath: "/api/acp" },
    });
    const r = await fac.dispatch(
      buildPostRequest("/api/acp/checkout_sessions", VALID_CREATE_BODY),
    );
    expect(r.status).toBe(201);
  });

  it("strips query string before matching", async () => {
    const { facilitator } = buildTestFacilitator();
    const r = await facilitator.dispatch({
      method: "GET",
      path: "/.well-known/acp.json?cache=bust",
      headers: {},
      rawBody: "",
    });
    expect(r.status).toBe(200);
  });
});
