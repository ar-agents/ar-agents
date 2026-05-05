import { http, HttpResponse } from "msw";

const MP_BASE = "https://api.mercadopago.com";

interface PreapprovalRecord {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  payer_email: string;
  init_point: string;
  external_reference?: string;
  date_created: string;
  last_modified: string;
  next_payment_date?: string;
  payer_id?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
  };
}

interface PaymentRecord {
  id: string;
  status: "pending" | "approved" | "in_process" | "rejected" | "cancelled" | "refunded";
  status_detail: string;
  date_created: string;
  date_approved: string | null;
  transaction_amount: number;
  currency_id: "ARS";
  installments: number;
  payment_method_id: string;
  payment_type_id: string;
  external_reference?: string;
  description?: string;
  payer: { email: string; identification?: { type: string; number: string } };
}

interface PreferenceRecord {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  external_reference?: string;
  date_created: string;
  items: Array<{ title: string; quantity: number; unit_price: number; currency_id: string }>;
}

interface CustomerRecord {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  date_created: string;
  date_last_updated: string;
}

interface CardRecord {
  id: string;
  customer_id: string;
  expiration_month: number;
  expiration_year: number;
  first_six_digits: string;
  last_four_digits: string;
  payment_method: { id: string; name: string; payment_type_id: string };
  date_created: string;
}

interface RefundRecord {
  id: string;
  payment_id: string;
  amount: number;
  status: "approved";
  date_created: string;
  source: { id: string; name: string; type: string };
}

/** Stateful in-memory MP fake. Reset between tests for isolation. */
export class FakeMpStore {
  preapprovals = new Map<string, PreapprovalRecord>();
  payments = new Map<string, PaymentRecord>();
  preferences = new Map<string, PreferenceRecord>();
  customers = new Map<string, CustomerRecord>();
  customersByEmail = new Map<string, CustomerRecord>();
  cards = new Map<string, CardRecord>();
  cardsByCustomer = new Map<string, CardRecord[]>();
  refunds = new Map<string, RefundRecord[]>();

  reset(): void {
    this.preapprovals.clear();
    this.payments.clear();
    this.preferences.clear();
    this.customers.clear();
    this.customersByEmail.clear();
    this.cards.clear();
    this.cardsByCustomer.clear();
    this.refunds.clear();
  }

  create(input: {
    reason: string;
    payerEmail: string;
    backUrl: string;
    autoRecurring: PreapprovalRecord["auto_recurring"];
    externalReference?: string;
  }): PreapprovalRecord {
    const id = `fake_${Math.random().toString(36).slice(2, 14)}`;
    const now = new Date().toISOString();
    const record: PreapprovalRecord = {
      id,
      status: "pending",
      payer_email: input.payerEmail,
      init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${id}`,
      date_created: now,
      last_modified: now,
      next_payment_date: now,
      auto_recurring: input.autoRecurring,
      ...(input.externalReference !== undefined ? { external_reference: input.externalReference } : {}),
    };
    this.preapprovals.set(id, record);
    return record;
  }

  createPayment(input: {
    amount: number;
    paymentMethodId: string;
    payerEmail: string;
    externalReference?: string;
    description?: string;
    installments?: number;
    identification?: { type: string; number: string };
  }): PaymentRecord {
    const id = `pay_${Math.random().toString(36).slice(2, 14)}`;
    const now = new Date().toISOString();
    // account_money + tickets approve instantly in this fake; cards need token (rejected)
    const status = input.paymentMethodId === "rapipago" || input.paymentMethodId === "pagofacil"
      ? "pending"
      : "approved";
    const record: PaymentRecord = {
      id,
      status: status as PaymentRecord["status"],
      status_detail: status === "approved" ? "accredited" : "pending_waiting_payment",
      date_created: now,
      date_approved: status === "approved" ? now : null,
      transaction_amount: input.amount,
      currency_id: "ARS",
      installments: input.installments ?? 1,
      payment_method_id: input.paymentMethodId,
      payment_type_id: input.paymentMethodId === "account_money" ? "account_money" : "credit_card",
      payer: {
        email: input.payerEmail,
        ...(input.identification ? { identification: input.identification } : {}),
      },
      ...(input.externalReference !== undefined ? { external_reference: input.externalReference } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    this.payments.set(id, record);
    return record;
  }

  createPreference(input: {
    items: PreferenceRecord["items"];
    externalReference?: string;
  }): PreferenceRecord {
    const id = `pref_${Math.random().toString(36).slice(2, 14)}`;
    const record: PreferenceRecord = {
      id,
      init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
      sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
      date_created: new Date().toISOString(),
      items: input.items,
      ...(input.externalReference !== undefined ? { external_reference: input.externalReference } : {}),
    };
    this.preferences.set(id, record);
    return record;
  }

  createCustomer(input: { email: string; firstName?: string; lastName?: string }): CustomerRecord {
    // Idempotent on email (mirroring MP behavior)
    const existing = this.customersByEmail.get(input.email);
    if (existing) return existing;
    const id = `cust_${Math.random().toString(36).slice(2, 14)}`;
    const now = new Date().toISOString();
    const record: CustomerRecord = {
      id,
      email: input.email,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      date_created: now,
      date_last_updated: now,
    };
    this.customers.set(id, record);
    this.customersByEmail.set(input.email, record);
    return record;
  }
}

export function buildHandlers(store: FakeMpStore) {
  return [
    // ── Subscriptions (kept from v0.1) ──────────────────────────────────────
    http.post(`${MP_BASE}/preapproval`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const backUrl = String(body.back_url ?? "");
      if (!backUrl.startsWith("https://")) {
        return HttpResponse.json(
          { message: "back_url is not a valid URL", error: "bad_request", status: 400 },
          { status: 400 },
        );
      }
      const record = store.create({
        reason: String(body.reason ?? ""),
        payerEmail: String(body.payer_email ?? ""),
        backUrl,
        externalReference:
          body.external_reference !== undefined ? String(body.external_reference) : undefined,
        autoRecurring: body.auto_recurring as PreapprovalRecord["auto_recurring"],
      });
      return HttpResponse.json(record, { status: 201 });
    }),
    http.get(`${MP_BASE}/preapproval/:id`, ({ params }) => {
      const id = String(params.id);
      const record = store.preapprovals.get(id);
      if (!record) return HttpResponse.json({ message: "not found", status: 404 }, { status: 404 });
      return HttpResponse.json(record);
    }),
    http.put(`${MP_BASE}/preapproval/:id`, async ({ params, request }) => {
      const id = String(params.id);
      const record = store.preapprovals.get(id);
      if (!record) return HttpResponse.json({ message: "not found", status: 404 }, { status: 404 });
      const body = (await request.json()) as { status?: string };
      const requested = body.status;
      if (requested === "authorized")
        return HttpResponse.json(
          { message: "You cannot authorize a preapproval, only the payer can", status: 400 },
          { status: 400 },
        );
      if (requested === "cancelled" || requested === "paused") {
        record.status = requested;
        record.last_modified = new Date().toISOString();
      }
      store.preapprovals.set(id, record);
      return HttpResponse.json(record);
    }),

    // ── Payments (v0.2) ─────────────────────────────────────────────────────
    http.post(`${MP_BASE}/v1/payments`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const payer = body.payer as { email: string; identification?: { type: string; number: string } };
      const record = store.createPayment({
        amount: Number(body.transaction_amount),
        paymentMethodId: String(body.payment_method_id),
        payerEmail: payer.email,
        externalReference: body.external_reference !== undefined ? String(body.external_reference) : undefined,
        description: body.description !== undefined ? String(body.description) : undefined,
        installments: body.installments !== undefined ? Number(body.installments) : undefined,
        ...(payer.identification ? { identification: payer.identification } : {}),
      });
      return HttpResponse.json(record, { status: 201 });
    }),
    http.get(`${MP_BASE}/v1/payments/search`, ({ request }) => {
      const url = new URL(request.url);
      const externalRef = url.searchParams.get("external_reference");
      const status = url.searchParams.get("status");
      const limit = Number(url.searchParams.get("limit") ?? 30);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      let results = Array.from(store.payments.values());
      if (externalRef) results = results.filter((p) => p.external_reference === externalRef);
      if (status) results = results.filter((p) => p.status === status);
      const paged = results.slice(offset, offset + limit);
      return HttpResponse.json({
        paging: { total: results.length, limit, offset },
        results: paged,
      });
    }),
    http.get(`${MP_BASE}/v1/payments/:id`, ({ params }) => {
      const id = String(params.id);
      const record = store.payments.get(id);
      if (!record) return HttpResponse.json({ message: "not found", status: 404 }, { status: 404 });
      return HttpResponse.json(record);
    }),
    http.put(`${MP_BASE}/v1/payments/:id`, async ({ params, request }) => {
      const id = String(params.id);
      const record = store.payments.get(id);
      if (!record) return HttpResponse.json({ message: "not found", status: 404 }, { status: 404 });
      const body = (await request.json()) as { status?: string; capture?: boolean };
      if (body.status === "cancelled") record.status = "cancelled";
      if (body.capture === true) record.status = "approved";
      return HttpResponse.json(record);
    }),

    // ── Refunds ─────────────────────────────────────────────────────────────
    http.post(`${MP_BASE}/v1/payments/:id/refunds`, async ({ params, request }) => {
      const paymentId = String(params.id);
      const payment = store.payments.get(paymentId);
      if (!payment)
        return HttpResponse.json({ message: "payment not found", status: 404 }, { status: 404 });
      const text = await request.text();
      const body = text ? (JSON.parse(text) as { amount?: number }) : {};
      const amount = body.amount ?? payment.transaction_amount;
      const refund: RefundRecord = {
        id: `refund_${Math.random().toString(36).slice(2, 14)}`,
        payment_id: paymentId,
        amount,
        status: "approved",
        date_created: new Date().toISOString(),
        source: { id: "1", name: "Test", type: "collector" },
      };
      const list = store.refunds.get(paymentId) ?? [];
      list.push(refund);
      store.refunds.set(paymentId, list);
      return HttpResponse.json(refund, { status: 201 });
    }),
    http.get(`${MP_BASE}/v1/payments/:id/refunds`, ({ params }) => {
      const paymentId = String(params.id);
      return HttpResponse.json(store.refunds.get(paymentId) ?? []);
    }),

    // ── Checkout Pro (Preferences) ──────────────────────────────────────────
    http.post(`${MP_BASE}/checkout/preferences`, async ({ request }) => {
      const body = (await request.json()) as { items: PreferenceRecord["items"]; external_reference?: string };
      const record = store.createPreference({
        items: body.items,
        externalReference: body.external_reference,
      });
      return HttpResponse.json(record, { status: 201 });
    }),
    http.get(`${MP_BASE}/checkout/preferences/:id`, ({ params }) => {
      const id = String(params.id);
      const record = store.preferences.get(id);
      if (!record) return HttpResponse.json({ message: "not found", status: 404 }, { status: 404 });
      return HttpResponse.json(record);
    }),

    // ── Customers ───────────────────────────────────────────────────────────
    http.post(`${MP_BASE}/v1/customers`, async ({ request }) => {
      const body = (await request.json()) as { email: string; first_name?: string; last_name?: string };
      const record = store.createCustomer({
        email: body.email,
        firstName: body.first_name,
        lastName: body.last_name,
      });
      return HttpResponse.json(record, { status: 201 });
    }),
    http.get(`${MP_BASE}/v1/customers/search`, ({ request }) => {
      const url = new URL(request.url);
      const email = url.searchParams.get("email");
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      let results = Array.from(store.customers.values());
      if (email) results = results.filter((c) => c.email === email);
      const paged = results.slice(offset, offset + limit);
      return HttpResponse.json({
        paging: { total: results.length, limit, offset },
        results: paged,
      });
    }),
    http.get(`${MP_BASE}/v1/customers/:id/cards`, ({ params }) => {
      const customerId = String(params.id);
      return HttpResponse.json(store.cardsByCustomer.get(customerId) ?? []);
    }),
    http.delete(`${MP_BASE}/v1/customers/:custId/cards/:cardId`, ({ params }) => {
      const cardId = String(params.cardId);
      const customerId = String(params.custId);
      store.cards.delete(cardId);
      const list = store.cardsByCustomer.get(customerId);
      if (list) {
        store.cardsByCustomer.set(customerId, list.filter((c) => c.id !== cardId));
      }
      return new HttpResponse(null, { status: 200 });
    }),

    // ── Payment Methods + Installments ──────────────────────────────────────
    http.get(`${MP_BASE}/v1/payment_methods`, () => {
      return HttpResponse.json([
        { id: "visa", name: "Visa", payment_type_id: "credit_card", status: "active", min_allowed_amount: 1, max_allowed_amount: 5000000 },
        { id: "master", name: "Mastercard", payment_type_id: "credit_card", status: "active", min_allowed_amount: 1, max_allowed_amount: 5000000 },
        { id: "naranja", name: "Naranja", payment_type_id: "credit_card", status: "active", min_allowed_amount: 1, max_allowed_amount: 5000000 },
        { id: "account_money", name: "Dinero en cuenta", payment_type_id: "account_money", status: "active", min_allowed_amount: 1, max_allowed_amount: 5000000 },
        { id: "rapipago", name: "Rapipago", payment_type_id: "ticket", status: "active", min_allowed_amount: 1, max_allowed_amount: 1500000 },
      ]);
    }),
    http.get(`${MP_BASE}/v1/payment_methods/installments`, ({ request }) => {
      const url = new URL(request.url);
      const amount = Number(url.searchParams.get("amount") ?? 0);
      const pmid = url.searchParams.get("payment_method_id") ?? "visa";
      return HttpResponse.json([
        {
          payment_method_id: pmid,
          payment_type_id: "credit_card",
          issuer: { id: 25, name: "Test Issuer" },
          payer_costs: [
            { installments: 1, installment_rate: 0, installment_amount: amount, total_amount: amount, recommended_message: `1 cuota de $${amount.toFixed(2)}` },
            { installments: 3, installment_rate: 0, installment_amount: amount / 3, total_amount: amount, recommended_message: `3 cuotas sin interés de $${(amount / 3).toFixed(2)}` },
            { installments: 6, installment_rate: 0, installment_amount: amount / 6, total_amount: amount, recommended_message: `6 cuotas sin interés de $${(amount / 6).toFixed(2)}` },
            { installments: 12, installment_rate: 31.42, installment_amount: (amount * 1.3142) / 12, total_amount: amount * 1.3142, recommended_message: `12 cuotas de $${((amount * 1.3142) / 12).toFixed(2)} ($${(amount * 1.3142).toFixed(2)})` },
          ],
        },
      ]);
    }),

    // ── Account ─────────────────────────────────────────────────────────────
    http.get(`${MP_BASE}/users/me`, () => {
      return HttpResponse.json({
        id: 999999999,
        email: "naza@helloastro.co",
        nickname: "TESTUSER123",
        country_id: "AR",
        site_id: "MLA",
        user_type: "registered",
        status: { user_type: "registered" },
      });
    }),
  ];
}
