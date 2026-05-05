import { classifyError, MercadoPagoError } from "./errors";
import type {
  AccountInfo,
  CreateCustomerParams,
  CreatePaymentParams,
  CreatePreapprovalParams,
  CreatePreferenceParams,
  CreateRefundParams,
  Customer,
  CustomerCard,
  InstallmentOffer,
  Payment,
  PaymentMethod,
  PaymentsSearchResult,
  Preapproval,
  Preference,
  Refund,
  SearchPaymentsParams,
} from "./types";

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

export interface MercadoPagoClientOptions {
  /** Access token. TEST- prefix for sandbox, APP_USR- for production. */
  accessToken: string;
  /**
   * Override the API base URL. Mostly useful for tests against MSW or for
   * pointing at a regional MP host. Defaults to https://api.mercadopago.com.
   */
  baseUrl?: string;
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch. Override to
   * inject your own retry/instrumentation layer or to test with MSW.
   */
  fetch?: typeof fetch;
}

interface RequestOptions {
  /** Idempotency key. Required for POST/PUT to dedupe retries safely. */
  idempotencyKey?: string;
  /** Query string params. Object → URLSearchParams. */
  query?: Record<string, string | number | undefined>;
  /** Context for error classification. */
  classifyContext?: {
    preapprovalId?: string;
    paymentId?: string;
    customerId?: string;
    payerEmail?: string;
    sellerEmail?: string;
  };
}

/**
 * Thin, typed wrapper around Mercado Pago's REST API. Exposes the surface
 * the agent layer needs: Subscriptions (Preapprovals), Payments, Checkout Pro
 * (Preferences), Customers + saved Cards, Refunds, Payment Methods +
 * Installments, and Account info. Deliberately narrower than a full SDK
 * rebuild — we add endpoints when the agent layer needs them.
 */
export class MercadoPagoClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: MercadoPagoClientOptions) {
    if (!options.accessToken) {
      throw new Error(
        "MercadoPagoClient requires an accessToken. Get one from https://www.mercadopago.com.ar/developers/panel/credentials",
      );
    }
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
    if (options?.idempotencyKey) {
      headers["X-Idempotency-Key"] = options.idempotencyKey;
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let url = `${this.baseUrl}${path}`;
    if (options?.query) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && v !== "") {
          search.set(k, String(v));
        }
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }

    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const res = await fetchFn(url, init);
    if (!res.ok) {
      let parsed: unknown;
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      throw classifyError(res.status, path, parsed, options?.classifyContext);
    }
    // Some endpoints (DELETE customer card) return 200 with empty body
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Subscriptions (Preapprovals) — v0.1 surface, kept stable
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a recurring subscription (preapproval). The returned `init_point`
   * URL is where the buyer must complete the FIRST payment with their card +
   * CVV — there is no API path that bypasses this human step.
   */
  async createPreapproval(
    params: CreatePreapprovalParams,
  ): Promise<Preapproval> {
    return this.request<Preapproval>(
      "POST",
      "/preapproval",
      {
        reason: params.reason,
        payer_email: params.payerEmail,
        back_url: params.backUrl,
        external_reference: params.externalReference,
        auto_recurring: {
          frequency: params.frequency,
          frequency_type: params.frequencyType,
          transaction_amount: params.amount,
          currency_id: params.currency,
        },
      },
      { classifyContext: { payerEmail: params.payerEmail } },
    );
  }

  async getPreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>("GET", `/preapproval/${id}`, undefined, {
      classifyContext: { preapprovalId: id },
    });
  }

  async cancelPreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "cancelled" },
      { classifyContext: { preapprovalId: id } },
    );
  }

  async pausePreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "paused" },
      { classifyContext: { preapprovalId: id } },
    );
  }

  async resumePreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "authorized" },
      { classifyContext: { preapprovalId: id } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Payments (v0.2)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a payment. Two main flows:
   * - **Card payment**: pass `token` (from MP frontend Cardform) + payment_method_id.
   * - **Account money / cash**: omit token, pass payment_method_id like "account_money", "rapipago", "pagofacil".
   *
   * For credit card payments where you don't have a card token (i.e., you only
   * have a payer email and want to send them a payment link), use
   * `createPreference` (Checkout Pro) instead.
   *
   * Idempotency: pass `idempotencyKey` to safely retry. Required for production
   * to dedupe network-failed requests.
   */
  async createPayment(params: CreatePaymentParams): Promise<Payment> {
    const body: Record<string, unknown> = {
      transaction_amount: params.transactionAmount,
      payment_method_id: params.paymentMethodId,
      payer: {
        email: params.payerEmail,
        ...(params.identification ? { identification: params.identification } : {}),
      },
    };
    if (params.installments !== undefined) body.installments = params.installments;
    if (params.token !== undefined) body.token = params.token;
    if (params.description !== undefined) body.description = params.description;
    if (params.externalReference !== undefined) body.external_reference = params.externalReference;
    if (params.notificationUrl !== undefined) body.notification_url = params.notificationUrl;
    if (params.statementDescriptor !== undefined)
      body.statement_descriptor = params.statementDescriptor;
    if (params.capture !== undefined) body.capture = params.capture;
    if (params.additionalInfo !== undefined) body.additional_info = params.additionalInfo;

    return this.request<Payment>("POST", "/v1/payments", body, {
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
      classifyContext: { payerEmail: params.payerEmail },
    });
  }

  /** Fetch a payment by ID. */
  async getPayment(id: string): Promise<Payment> {
    return this.request<Payment>("GET", `/v1/payments/${id}`, undefined, {
      classifyContext: { paymentId: id },
    });
  }

  /**
   * Search payments with filters. Common: by external_reference (your-system
   * id), by status, by date range. Pagination via offset + limit (max 100).
   */
  async searchPayments(params: SearchPaymentsParams = {}): Promise<PaymentsSearchResult> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
    };
    if (params.externalReference) query["external_reference"] = params.externalReference;
    if (params.status) query["status"] = params.status as string;
    if (params.payerEmail) query["payer.email"] = params.payerEmail;
    if (params.beginDate) query["begin_date"] = params.beginDate;
    if (params.endDate) query["end_date"] = params.endDate;
    if (params.sort) query["sort"] = params.sort;
    if (params.criteria) query["criteria"] = params.criteria;

    return this.request<PaymentsSearchResult>(
      "GET",
      "/v1/payments/search",
      undefined,
      { query },
    );
  }

  /**
   * Capture a previously authorized payment. Only works for credit-card
   * payments created with `capture: false`. Optional partial capture amount.
   */
  async capturePayment(id: string, amount?: number): Promise<Payment> {
    return this.request<Payment>(
      "PUT",
      `/v1/payments/${id}`,
      amount !== undefined ? { capture: true, transaction_amount: amount } : { capture: true },
      { classifyContext: { paymentId: id } },
    );
  }

  /**
   * Cancel a pending or in_process payment. Once approved, you must use
   * `createRefund` instead.
   */
  async cancelPayment(id: string): Promise<Payment> {
    return this.request<Payment>(
      "PUT",
      `/v1/payments/${id}`,
      { status: "cancelled" },
      { classifyContext: { paymentId: id } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Refunds
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Refund a payment fully (omit `amount`) or partially. Idempotency key
   * recommended — refunds can fail mid-flight and you don't want double-refunds
   * on retry.
   */
  async createRefund(params: CreateRefundParams): Promise<Refund> {
    const body = params.amount !== undefined ? { amount: params.amount } : undefined;
    return this.request<Refund>(
      "POST",
      `/v1/payments/${params.paymentId}/refunds`,
      body,
      {
        ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
        classifyContext: { paymentId: params.paymentId },
      },
    );
  }

  async listRefunds(paymentId: string): Promise<Refund[]> {
    const res = await this.request<Refund[] | { refunds: Refund[] }>(
      "GET",
      `/v1/payments/${paymentId}/refunds`,
      undefined,
      { classifyContext: { paymentId } },
    );
    return Array.isArray(res) ? res : res.refunds ?? [];
  }

  async getRefund(paymentId: string, refundId: string): Promise<Refund> {
    return this.request<Refund>(
      "GET",
      `/v1/payments/${paymentId}/refunds/${refundId}`,
      undefined,
      { classifyContext: { paymentId } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Checkout Pro (Preferences)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a payment preference for Checkout Pro. Returns `init_point` URL
   * where the buyer completes payment on MP-hosted form. This is the
   * recommended flow when you don't have a card token (most common path for
   * agents — you don't want to handle PCI data).
   *
   * Sandbox: use `sandbox_init_point` instead of `init_point`.
   */
  async createPreference(params: CreatePreferenceParams): Promise<Preference> {
    const body: Record<string, unknown> = {
      items: params.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        unit_price: it.unit_price,
        currency_id: it.currency_id ?? "ARS",
        ...(it.description ? { description: it.description } : {}),
        ...(it.picture_url ? { picture_url: it.picture_url } : {}),
      })),
    };
    if (params.payer) body.payer = params.payer;
    if (params.backUrls) body.back_urls = params.backUrls;
    if (params.autoReturn) body.auto_return = params.autoReturn;
    if (params.notificationUrl) body.notification_url = params.notificationUrl;
    if (params.externalReference) body.external_reference = params.externalReference;
    if (params.paymentMethods) body.payment_methods = params.paymentMethods;
    if (params.statementDescriptor)
      body.statement_descriptor = params.statementDescriptor;
    if (params.expires !== undefined) body.expires = params.expires;
    if (params.expirationDateFrom) body.expiration_date_from = params.expirationDateFrom;
    if (params.expirationDateTo) body.expiration_date_to = params.expirationDateTo;

    return this.request<Preference>("POST", "/checkout/preferences", body);
  }

  async getPreference(id: string): Promise<Preference> {
    return this.request<Preference>("GET", `/checkout/preferences/${id}`);
  }

  async updatePreference(
    id: string,
    patch: Partial<CreatePreferenceParams>,
  ): Promise<Preference> {
    return this.request<Preference>("PUT", `/checkout/preferences/${id}`, patch);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Customers + Saved Cards
  // ───────────────────────────────────────────────────────────────────────────

  async createCustomer(params: CreateCustomerParams): Promise<Customer> {
    const body: Record<string, unknown> = { email: params.email };
    if (params.firstName) body.first_name = params.firstName;
    if (params.lastName) body.last_name = params.lastName;
    if (params.phone) body.phone = { area_code: params.phone.areaCode, number: params.phone.number };
    if (params.identification) body.identification = params.identification;
    if (params.description) body.description = params.description;
    return this.request<Customer>("POST", "/v1/customers", body, {
      classifyContext: { payerEmail: params.email },
    });
  }

  async getCustomer(id: string): Promise<Customer> {
    return this.request<Customer>("GET", `/v1/customers/${id}`, undefined, {
      classifyContext: { customerId: id },
    });
  }

  /**
   * Search customers. Most common: by email (returns 0 or 1 result).
   * Note: MP's `/v1/customers/search` returns a paginated wrapper, not a flat array.
   */
  async searchCustomers(params: { email?: string; limit?: number; offset?: number } = {}): Promise<{
    paging: { total: number; limit: number; offset: number };
    results: Customer[];
  }> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 10,
      offset: params.offset ?? 0,
    };
    if (params.email) query["email"] = params.email;
    return this.request("GET", "/v1/customers/search", undefined, { query });
  }

  async listCustomerCards(customerId: string): Promise<CustomerCard[]> {
    return this.request<CustomerCard[]>(
      "GET",
      `/v1/customers/${customerId}/cards`,
      undefined,
      { classifyContext: { customerId } },
    );
  }

  async getCustomerCard(customerId: string, cardId: string): Promise<CustomerCard> {
    return this.request<CustomerCard>(
      "GET",
      `/v1/customers/${customerId}/cards/${cardId}`,
      undefined,
      { classifyContext: { customerId } },
    );
  }

  async deleteCustomerCard(customerId: string, cardId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/v1/customers/${customerId}/cards/${cardId}`,
      undefined,
      { classifyContext: { customerId } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Payment Methods + Installments
  // ───────────────────────────────────────────────────────────────────────────

  /** List all payment methods enabled for the account's site (MLA = Argentina). */
  async listPaymentMethods(): Promise<PaymentMethod[]> {
    return this.request<PaymentMethod[]>("GET", "/v1/payment_methods");
  }

  /**
   * Get installment options for an amount. THE killer AR feature — returns
   * `payer_costs` with `recommended_message` strings like "12 cuotas sin
   * interés de $X" that you should surface verbatim to the user.
   *
   * Pass `bin` (first 6 digits of card) for issuer-specific offers (e.g.,
   * Naranja's interest-free promotions). Without bin, returns generic offers.
   */
  async getInstallments(params: {
    amount: number;
    paymentMethodId?: string;
    bin?: string;
    issuerId?: string;
  }): Promise<InstallmentOffer[]> {
    const query: Record<string, string | number | undefined> = {
      amount: params.amount,
    };
    if (params.paymentMethodId) query["payment_method_id"] = params.paymentMethodId;
    if (params.bin) query["bin"] = params.bin;
    if (params.issuerId) query["issuer.id"] = params.issuerId;
    return this.request<InstallmentOffer[]>(
      "GET",
      "/v1/payment_methods/installments",
      undefined,
      { query },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Account
  // ───────────────────────────────────────────────────────────────────────────

  /** Get info about the account that owns this access token. */
  async getMe(): Promise<AccountInfo> {
    return this.request<AccountInfo>("GET", "/users/me");
  }
}

export { MercadoPagoError };
