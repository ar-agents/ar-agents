import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStateAdapter } from "../src/state";
import type { CheckoutSession } from "../src/schemas/checkout-session";
import type { Order } from "../src/schemas/order";
import type { Cart } from "../src/schemas/cart";

const sampleSession: CheckoutSession = {
  id: "cs_abc",
  status: "ready_for_payment",
  currency: "ars",
  line_items: [
    {
      id: "li_1",
      item: { id: "item_x" },
      quantity: 1,
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 5000 }],
    },
  ],
  fulfillment_options: [],
  totals: [{ type: "total", display_text: "Total", amount: 5000 }],
  messages: [],
  links: [],
};

const sampleOrder: Order = {
  type: "order",
  id: "ord_xyz",
  checkout_session_id: "cs_abc",
  permalink_url: "https://example.com/o/ord_xyz",
};

const sampleCart: Cart = {
  id: "cart_1",
  currency: "ars",
  line_items: [
    {
      id: "li_1",
      item: { id: "item_x" },
      quantity: 1,
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 5000 }],
    },
  ],
  totals: [{ type: "total", display_text: "Total", amount: 5000 }],
};

describe("InMemoryStateAdapter — sessions", () => {
  let store: InMemoryStateAdapter;
  beforeEach(() => {
    store = new InMemoryStateAdapter();
  });

  it("persists and retrieves a session", async () => {
    await store.saveSession(sampleSession);
    expect(await store.loadSession("cs_abc")).toEqual(sampleSession);
  });

  it("returns null for unknown session id", async () => {
    expect(await store.loadSession("missing")).toBeNull();
  });

  it("deleteSession removes the record", async () => {
    await store.saveSession(sampleSession);
    await store.deleteSession("cs_abc");
    expect(await store.loadSession("cs_abc")).toBeNull();
  });
});

describe("InMemoryStateAdapter — orders", () => {
  let store: InMemoryStateAdapter;
  beforeEach(() => {
    store = new InMemoryStateAdapter();
  });

  it("persists and retrieves by id and by session id", async () => {
    await store.saveOrder(sampleOrder);
    expect(await store.loadOrder("ord_xyz")).toEqual(sampleOrder);
    expect(await store.loadOrderBySession("cs_abc")).toEqual(sampleOrder);
  });
});

describe("InMemoryStateAdapter — carts", () => {
  let store: InMemoryStateAdapter;
  beforeEach(() => {
    store = new InMemoryStateAdapter();
  });

  it("persists, retrieves, and deletes a cart", async () => {
    await store.saveCart(sampleCart);
    expect(await store.loadCart("cart_1")).toEqual(sampleCart);
    await store.deleteCart("cart_1");
    expect(await store.loadCart("cart_1")).toBeNull();
  });
});

describe("InMemoryStateAdapter — idempotency", () => {
  let store: InMemoryStateAdapter;
  beforeEach(() => {
    store = new InMemoryStateAdapter();
  });

  it("first claim returns kind=claimed", async () => {
    const r = await store.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("claimed");
  });

  it("second claim of same key + same body while in_flight returns in_flight", async () => {
    await store.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    const r = await store.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("in_flight");
    if (r.kind === "in_flight") {
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("second claim of same key with DIFFERENT body returns conflict", async () => {
    await store.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    const r = await store.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_DIFFERENT",
    );
    expect(r.kind).toBe("conflict");
  });

  it("after complete, replay returns the cached response", async () => {
    await store.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    await store.complete("POST /checkout_sessions", "key_1", {
      status: 201,
      body: { id: "cs_abc", status: "ready_for_payment" },
      headers: { "Idempotent-Replayed": "true" },
    });
    const r = await store.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("replay");
    if (r.kind === "replay") {
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: "cs_abc", status: "ready_for_payment" });
    }
  });

  it("scopes idempotency by (scope, key) — different endpoints can reuse", async () => {
    await store.tryClaim("POST /checkout_sessions", "key_1", "h1");
    const r = await store.tryClaim(
      "POST /carts",
      "key_1",
      "h_different",
    );
    expect(r.kind).toBe("claimed");
  });

  it("release() unclaims so a retry can proceed", async () => {
    await store.tryClaim("POST /checkout_sessions", "key_1", "h1");
    await store.release("POST /checkout_sessions", "key_1");
    const r = await store.tryClaim("POST /checkout_sessions", "key_1", "h1");
    expect(r.kind).toBe("claimed");
  });
});
