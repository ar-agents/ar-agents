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

/**
 * Stateful in-memory MP fake. Mirrors the subset of MP behavior the lib
 * exercises. Reset between tests to keep them isolated.
 */
export class FakeMpStore {
  preapprovals = new Map<string, PreapprovalRecord>();

  reset(): void {
    this.preapprovals.clear();
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
}

export function buildHandlers(store: FakeMpStore) {
  return [
    http.post(`${MP_BASE}/preapproval`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;

      // Simulate MP rejection of localhost / http back_url.
      const backUrl = String(body.back_url ?? "");
      if (!backUrl.startsWith("https://")) {
        return HttpResponse.json(
          {
            message: "back_url is not a valid URL",
            error: "bad_request",
            status: 400,
          },
          { status: 400 },
        );
      }

      const record = store.create({
        reason: String(body.reason ?? ""),
        payerEmail: String(body.payer_email ?? ""),
        backUrl,
        externalReference:
          body.external_reference !== undefined
            ? String(body.external_reference)
            : undefined,
        autoRecurring: body.auto_recurring as PreapprovalRecord["auto_recurring"],
      });
      return HttpResponse.json(record, { status: 201 });
    }),

    http.get(`${MP_BASE}/preapproval/:id`, ({ params }) => {
      const id = String(params.id);
      const record = store.preapprovals.get(id);
      if (!record) {
        return HttpResponse.json(
          { message: "preapproval not found", status: 404 },
          { status: 404 },
        );
      }
      return HttpResponse.json(record);
    }),

    http.put(`${MP_BASE}/preapproval/:id`, async ({ params, request }) => {
      const id = String(params.id);
      const record = store.preapprovals.get(id);
      if (!record) {
        return HttpResponse.json(
          { message: "preapproval not found", status: 404 },
          { status: 404 },
        );
      }
      const body = (await request.json()) as { status?: string };
      const requested = body.status;
      if (requested === "authorized") {
        return HttpResponse.json(
          {
            message: "You cannot authorize a preapproval, only the payer can",
            status: 400,
          },
          { status: 400 },
        );
      }
      if (
        requested === "cancelled" ||
        requested === "paused"
      ) {
        record.status = requested;
        record.last_modified = new Date().toISOString();
      }
      store.preapprovals.set(id, record);
      return HttpResponse.json(record);
    }),
  ];
}
