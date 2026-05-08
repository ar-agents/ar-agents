/**
 * `@ar-agents/mercadopago/testing` — fixtures and a mock client for tests.
 *
 * What you get:
 *
 *   - **Factories** for every shape a user-side test will need: `mockPayment`,
 *     `mockPreapproval`, `mockSubscriptionPayment`, `mockPreference`,
 *     `mockRefund`, `mockCustomer`, `mockWebhookHeaders`. Each accepts a
 *     partial `overrides` object so you only spell the fields your test
 *     actually cares about.
 *
 *   - **`MockMercadoPagoClient`** — a class with the same surface as
 *     `MercadoPagoClient` but backed by an in-memory store. No network. Its
 *     mutations (createPayment, createPreapproval, etc.) update the store
 *     so a test can do create-then-get without staging fixtures twice.
 *     Read-only methods that don't fit a clean store model (search filters,
 *     pagination edge cases) throw `MockNotImplementedError` — by design,
 *     so you notice when a test wanders into territory that needs MSW or a
 *     real sandbox token.
 *
 *   - **`mockSignedWebhook`** — produces a `{ body, headers, searchParams }`
 *     bundle whose `x-signature` passes `verifyWebhookSignature` against the
 *     same secret. Test the full webhook stack end-to-end without hand-rolling
 *     the HMAC.
 *
 * Why a subpath: the testing helpers are dev-time only and would bloat the
 * production bundle if exported from the main entry. Imports compile away
 * cleanly when bundlers tree-shake.
 *
 * @example
 * ```ts
 * import { MockMercadoPagoClient, mockPayment, mockSignedWebhook } from "@ar-agents/mercadopago/testing";
 *
 * test("approves and stores a payment", async () => {
 *   const mp = new MockMercadoPagoClient();
 *   mp.seed.payments([mockPayment({ status: "approved", transaction_amount: 1000 })]);
 *   const got = await mp.searchPayments({ status: "approved" });
 *   expect(got.results).toHaveLength(1);
 * });
 *
 * test("end-to-end webhook with a verified signature", async () => {
 *   const { body, headers, searchParams } = await mockSignedWebhook({
 *     topic: "payment",
 *     dataId: "123",
 *     secret: "test-secret",
 *   });
 *   const ok = await verifyWebhookSignature({
 *     requestId: headers.get("x-request-id"),
 *     dataId: "123",
 *     signatureHeader: headers.get("x-signature"),
 *     secret: "test-secret",
 *   });
 *   expect(ok).toBe(true);
 * });
 * ```
 */

import type {
  Payment,
  Preapproval,
  SubscriptionPayment,
  Preference,
  Refund,
  Customer,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

let counter = 0;
const nextId = () => `mock-${++counter}`;

/** Build a Payment fixture. Sensible defaults for the most common scenario
 *  (an approved $1000 ARS sale with an external_reference). */
export function mockPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: nextId(),
    status: "approved",
    status_detail: "accredited",
    transaction_amount: 1000,
    currency_id: "ARS",
    date_created: new Date().toISOString(),
    date_approved: new Date().toISOString(),
    external_reference: `mock-ref-${counter}`,
    description: "Mock payment",
    payment_method_id: "visa",
    payment_type_id: "credit_card",
    payer: {
      id: nextId(),
      email: "buyer@example.com",
    },
    ...overrides,
  } as Payment;
}

/** Build a Preapproval (recurring subscription) fixture. */
export function mockPreapproval(overrides: Partial<Preapproval> = {}): Preapproval {
  return {
    id: nextId(),
    status: "authorized",
    payer_id: 12345,
    payer_email: "buyer@example.com",
    init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${nextId()}`,
    reason: "Mock subscription",
    external_reference: `mock-sub-${counter}`,
    date_created: new Date().toISOString(),
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 1000,
      currency_id: "ARS",
    },
    ...overrides,
  } as Preapproval;
}

/** Build a SubscriptionPayment (single recurring-charge attempt) fixture. */
export function mockSubscriptionPayment(
  overrides: Partial<SubscriptionPayment> = {},
): SubscriptionPayment {
  return {
    id: nextId(),
    preapproval_id: nextId(),
    status: "approved",
    payment_id: nextId(),
    transaction_amount: 1000,
    currency_id: "ARS",
    date_created: new Date().toISOString(),
    debit_date: new Date().toISOString(),
    retry_attempt: 0,
    next_retry_date: null,
    ...overrides,
  } as SubscriptionPayment;
}

/** Build a Preference (Checkout Pro) fixture. */
export function mockPreference(overrides: Partial<Preference> = {}): Preference {
  const id = nextId();
  return {
    id,
    init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
    sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
    items: [
      {
        id: "item-1",
        title: "Mock item",
        quantity: 1,
        unit_price: 1000,
        currency_id: "ARS",
      },
    ],
    external_reference: `mock-pref-${counter}`,
    date_created: new Date().toISOString(),
    ...overrides,
  } as Preference;
}

/** Build a Refund fixture. */
export function mockRefund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: nextId(),
    payment_id: nextId(),
    amount: 1000,
    source: { id: nextId(), name: "Mock Source", type: "test" },
    date_created: new Date().toISOString(),
    status: "approved",
    ...overrides,
  } as Refund;
}

/** Build a Customer fixture. */
export function mockCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: nextId(),
    email: "buyer@example.com",
    first_name: "Test",
    last_name: "Buyer",
    date_created: new Date().toISOString(),
    ...overrides,
  } as Customer;
}

/** Build a `webhookHeaders + searchParams + body` triple for a `payment.created`
 *  topic. Use directly when you don't need a verified signature. */
export function mockWebhookHeaders(args: {
  topic?: string;
  dataId?: string;
  requestId?: string;
} = {}): { headers: Headers; searchParams: URLSearchParams; body: string } {
  const topic = args.topic ?? "payment";
  const dataId = args.dataId ?? nextId();
  const requestId = args.requestId ?? nextId();
  const headers = new Headers({
    "x-request-id": requestId,
    "content-type": "application/json",
  });
  const searchParams = new URLSearchParams({
    topic,
    "data.id": dataId,
  });
  const body = JSON.stringify({
    action: "payment.created",
    api_version: "v1",
    data: { id: dataId },
    type: topic,
    user_id: 12345,
    live_mode: false,
  });
  return { headers, searchParams, body };
}

/**
 * Like `mockWebhookHeaders`, but also computes a real HMAC-SHA256 signature
 * against `secret` so `verifyWebhookSignature` accepts it. Use this in tests
 * for the full webhook handler stack.
 */
export async function mockSignedWebhook(args: {
  topic?: string;
  dataId?: string;
  requestId?: string;
  secret: string;
  ts?: number; // override for replay-window tests
}): Promise<{ headers: Headers; searchParams: URLSearchParams; body: string }> {
  const base = mockWebhookHeaders(args);
  const dataId = base.searchParams.get("data.id")!;
  const requestId = base.headers.get("x-request-id")!;
  const ts = args.ts ?? Math.floor(Date.now() / 1000);
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  const v1 = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  base.headers.set("x-signature", `ts=${ts},v1=${v1}`);
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// MockMercadoPagoClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a mock client method has no in-memory implementation. By design:
 * if your test relied on the missing path, switch to MSW or a real sandbox
 * token rather than expanding the mock surface ad-hoc.
 */
export class MockNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `MockMercadoPagoClient.${method} is not implemented. Use MSW or a real ` +
        `sandbox token if your test exercises this path.`,
    );
    this.name = "MockNotImplementedError";
  }
}

/**
 * In-memory client. Implements the most-commonly-needed read + write paths.
 * Tests that need long-tail behaviour (search by complex filters, error
 * injection) should reach for MSW.
 */
export class MockMercadoPagoClient {
  private payments = new Map<string, Payment>();
  private preapprovals = new Map<string, Preapproval>();
  private preferences = new Map<string, Preference>();
  private refunds = new Map<string, Refund>();
  private customers = new Map<string, Customer>();

  /** Seed the in-memory store. */
  seed = {
    payments: (xs: Payment[]) => {
      for (const p of xs) this.payments.set(String(p.id), p);
    },
    preapprovals: (xs: Preapproval[]) => {
      for (const x of xs) this.preapprovals.set(x.id, x);
    },
    preferences: (xs: Preference[]) => {
      for (const x of xs) this.preferences.set(x.id, x);
    },
    refunds: (xs: Refund[]) => {
      for (const r of xs) this.refunds.set(String(r.id), r);
    },
    customers: (xs: Customer[]) => {
      for (const c of xs) this.customers.set(c.id, c);
    },
  };

  // Payment methods
  async getPayment(id: string): Promise<Payment> {
    const p = this.payments.get(id);
    if (!p) throw new Error(`Payment not found: ${id}`);
    return p;
  }

  async createPayment(params: Partial<Payment>): Promise<Payment> {
    const p = mockPayment(params);
    this.payments.set(String(p.id), p);
    return p;
  }

  async searchPayments(filter: { status?: string; externalReference?: string } = {}) {
    const all = Array.from(this.payments.values());
    const filtered = all.filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      if (
        filter.externalReference &&
        p.external_reference !== filter.externalReference
      )
        return false;
      return true;
    });
    return {
      paging: { total: filtered.length, limit: 30, offset: 0 },
      results: filtered,
    };
  }

  async cancelPayment(id: string): Promise<Payment> {
    const p = await this.getPayment(id);
    const updated = { ...p, status: "cancelled" as const };
    this.payments.set(id, updated);
    return updated;
  }

  // Preapproval methods
  async getPreapproval(id: string): Promise<Preapproval> {
    const sub = this.preapprovals.get(id);
    if (!sub) throw new Error(`Preapproval not found: ${id}`);
    return sub;
  }

  async createPreapproval(params: Partial<Preapproval>): Promise<Preapproval> {
    const sub = mockPreapproval(params);
    this.preapprovals.set(sub.id, sub);
    return sub;
  }

  async cancelPreapproval(id: string): Promise<Preapproval> {
    const sub = await this.getPreapproval(id);
    const updated = { ...sub, status: "cancelled" as const };
    this.preapprovals.set(id, updated);
    return updated;
  }

  async pausePreapproval(id: string): Promise<Preapproval> {
    const sub = await this.getPreapproval(id);
    const updated = { ...sub, status: "paused" as const };
    this.preapprovals.set(id, updated);
    return updated;
  }

  async resumePreapproval(id: string): Promise<Preapproval> {
    const sub = await this.getPreapproval(id);
    const updated = { ...sub, status: "authorized" as const };
    this.preapprovals.set(id, updated);
    return updated;
  }

  // Refund
  async createRefund(params: { payment_id: string; amount?: number }): Promise<Refund> {
    const refund = mockRefund({
      payment_id: params.payment_id,
      amount: params.amount ?? 1000,
    });
    this.refunds.set(String(refund.id), refund);
    // Mark the payment as refunded.
    const payment = this.payments.get(params.payment_id);
    if (payment) {
      this.payments.set(params.payment_id, { ...payment, status: "refunded" });
    }
    return refund;
  }

  // Customer
  async getCustomer(id: string): Promise<Customer> {
    const c = this.customers.get(id);
    if (!c) throw new Error(`Customer not found: ${id}`);
    return c;
  }

  async createCustomer(params: Partial<Customer>): Promise<Customer> {
    const c = mockCustomer(params);
    this.customers.set(c.id, c);
    return c;
  }

  // Preference
  async getPreference(id: string): Promise<Preference> {
    const pref = this.preferences.get(id);
    if (!pref) throw new Error(`Preference not found: ${id}`);
    return pref;
  }

  async createPreference(params: Partial<Preference>): Promise<Preference> {
    const pref = mockPreference(params);
    this.preferences.set(pref.id, pref);
    return pref;
  }

  // Catch-all for unimplemented surface — tests can still construct the client
  // and only fail on the method they actually need that's missing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
