import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { classifyError, MercadoPagoError, MercadoPagoOverloadedError, MercadoPagoRateLimitError, MercadoPagoTimeoutError } from "./errors";
import type {
  AccountInfo,
  CardToken,
  CreateCardTokenParams,
  CreateCustomerParams,
  CreatePaymentParams,
  CreatePosParams,
  CreatePreapprovalParams,
  CreatePreferenceParams,
  CreateQrPaymentParams,
  CreateRefundParams,
  CreateStoreParams,
  CreateSubscriptionPlanParams,
  AccountBalance,
  AccountMovement,
  BankAccount,
  CreateOrderParams,
  CreatePointPaymentIntentParams,
  CreateWebhookParams,
  Customer,
  CustomerCard,
  Dispute,
  IdentificationType,
  InstallmentOffer,
  Issuer,
  MerchantOrder,
  Order,
  Payment,
  PointDevice,
  PointPaymentIntent,
  PaymentMethod,
  PaymentsSearchResult,
  Pos,
  Preapproval,
  Preference,
  QrOrder,
  Refund,
  SearchPaymentsParams,
  Settlement,
  Store,
  SubscriptionPayment,
  SubscriptionPlan,
  WebhookConfig,
} from "./types";

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  /**
   * Per-request timeout in ms. Aborts the request and throws if exceeded.
   * Default 30_000 (30s). MP can be slow under load; 30s is a safe upper bound.
   */
  requestTimeoutMs?: number;
  /**
   * Number of retries on 5xx + network errors. Default 1 (single retry).
   * 4xx errors are NEVER retried (they're user/config errors). Each retry
   * uses exponential backoff: 250ms, 500ms, 1000ms, ...
   */
  maxRetries?: number;
  /**
   * Observability hook fired AFTER every request (success or failure).
   * Useful for logging, metrics, tracing. Synchronous, fire-and-forget.
   *
   * The `traceContext` field follows the W3C Trace Context spec — pass
   * an OpenTelemetry-compatible context propagator and you get full
   * distributed tracing for free. See `traceContext` option below.
   */
  onCall?: (event: {
    method: string;
    path: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
    /** v0.9: MP's `x-request-id` echo. Useful for support tickets. */
    requestId?: string | null;
    /** v0.9: MP's rate-limit headers when present. */
    rateLimit?: {
      remaining: number | null;
      resetSeconds: number | null;
    };
    /** v0.9: Circuit breaker state at the time of the call. */
    circuitState?: "CLOSED" | "OPEN" | "HALF_OPEN";
    /** v0.9: Trace context for OpenTelemetry-style propagation. */
    traceContext?: { traceId?: string; spanId?: string };
  }) => void;
  /**
   * v0.9 — Opt-in circuit breaker. When MP is failing, fail fast instead of
   * piling up retries against a dead service. Pass a configured instance
   * (or share one across multiple clients to give them shared backpressure
   * signal).
   *
   * @example
   * ```ts
   * const breaker = new CircuitBreaker({
   *   failureThreshold: 5,
   *   resetTimeoutMs: 30_000,
   *   onStateChange: (e) => metrics.gauge("circuit.state", e.to),
   * });
   * const client = new MercadoPagoClient({ accessToken: "...", circuitBreaker: breaker });
   * ```
   */
  circuitBreaker?: CircuitBreaker;
  /**
   * v0.9 — Optional W3C Trace Context propagator. If provided, the client
   * extracts traceId/spanId on each request, injects `traceparent` /
   * `tracestate` headers (MP echoes them back via x-request-id), and surfaces
   * them in `onCall` events. Compatible with OpenTelemetry without adding
   * `@opentelemetry/api` as a peer dep.
   *
   * If you have OTEL set up, just pass `() => trace.getActiveSpan()?.spanContext()`.
   */
  traceContext?: () =>
    | { traceId?: string; spanId?: string; traceFlags?: number }
    | undefined;
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
  /**
   * v0.9 — Parent AbortSignal for deadline propagation. When the agent
   * has a fixed budget (e.g., 5s for the whole tool call), pass it here.
   * The client merges it with its own per-request timeout — whichever
   * fires first wins.
   */
  signal?: AbortSignal;
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
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly onCall: MercadoPagoClientOptions["onCall"];
  private readonly circuitBreaker: CircuitBreaker | undefined;
  private readonly traceContext: MercadoPagoClientOptions["traceContext"];

  constructor(options: MercadoPagoClientOptions) {
    if (!options.accessToken) {
      throw new Error(
        "MercadoPagoClient requires an accessToken. Get one from https://www.mercadopago.com.ar/developers/panel/credentials",
      );
    }
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 1);
    this.onCall = options.onCall;
    this.circuitBreaker = options.circuitBreaker;
    this.traceContext = options.traceContext;
  }

  /**
   * v0.9 — Inspect the circuit breaker state (when configured). Returns
   * `null` when no circuit breaker is wired. Useful for health checks.
   */
  getCircuitState(): ReturnType<CircuitBreaker["getStats"]> | null {
    return this.circuitBreaker?.getStats() ?? null;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    // Wrap the entire request loop in the circuit breaker (when configured).
    // The breaker observes terminal failures (after retries exhausted) and
    // opens after enough cascading failures.
    const exec = () => this.requestUnprotected<T>(method, path, body, options);
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(exec);
    }
    return exec();
  }

  private async requestUnprotected<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

    // v0.9 — W3C Trace Context propagation. If the caller wired traceContext,
    // inject the standard `traceparent` header so MP's logs can be correlated
    // with your distributed traces (and any agent middleware downstream).
    const trace = this.traceContext?.();
    if (trace?.traceId && trace?.spanId) {
      const flags = (trace.traceFlags ?? 1).toString(16).padStart(2, "0");
      headers["traceparent"] = `00-${trace.traceId}-${trace.spanId}-${flags}`;
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
    const t0 = Date.now();
    let attempt = 0;
    let lastError: unknown;
    let lastStatus: number | null = null;

    const fireOnCall = (event: {
      success: boolean;
      httpStatus: number | null;
      retried: number;
      requestId: string | null;
      rateLimit: { remaining: number | null; resetSeconds: number | null };
    }) => {
      const traceCtx: { traceId?: string; spanId?: string } | undefined =
        trace?.traceId
          ? {
              traceId: trace.traceId,
              ...(trace.spanId !== undefined ? { spanId: trace.spanId } : {}),
            }
          : undefined;
      this.onCall?.({
        method,
        path,
        durationMs: Date.now() - t0,
        ...event,
        ...(this.circuitBreaker ? { circuitState: this.circuitBreaker.getState() } : {}),
        ...(traceCtx ? { traceContext: traceCtx } : {}),
      });
    };

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      // v0.9 — Deadline propagation: if the caller passed a parent signal,
      // abort the request when EITHER the timeout or the parent fires.
      const parentSignal = options?.signal;
      const onParentAbort = () => controller.abort();
      if (parentSignal) {
        if (parentSignal.aborted) {
          clearTimeout(timer);
          throw new MercadoPagoTimeoutError(path, 0);
        }
        parentSignal.addEventListener("abort", onParentAbort, { once: true });
      }

      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) init.body = JSON.stringify(body);

      try {
        const res = await fetchFn(url, init);
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
        lastStatus = res.status;

        const requestId = res.headers.get("x-request-id");
        const rlRemaining = res.headers.get("x-rate-limit-remaining");
        const rlReset = res.headers.get("x-rate-limit-reset");
        const rateLimit = {
          remaining: rlRemaining !== null ? Number(rlRemaining) : null,
          resetSeconds: rlReset !== null ? Number(rlReset) : null,
        };

        if (res.ok) {
          const text = await res.text();
          fireOnCall({
            success: true,
            httpStatus: res.status,
            retried: attempt,
            requestId,
            rateLimit,
          });
          if (!text) return undefined as T;
          return JSON.parse(text) as T;
        }

        // Retry on 5xx and 429 (rate-limit); never on 4xx user/config errors
        const isRetryable = res.status >= 500 || res.status === 429;
        if (isRetryable && attempt < this.maxRetries) {
          // Honor Retry-After header on 429
          const retryAfter = res.headers.get("retry-after");
          const waitMs = retryAfter
            ? Number(retryAfter) * 1000
            : 250 * Math.pow(2, attempt);
          attempt++;
          await sleep(waitMs);
          continue;
        }

        // Detect HTML / non-JSON 5xx (MP overloaded)
        const contentType = res.headers.get("content-type") ?? "";
        if (res.status >= 500 && !contentType.includes("application/json")) {
          fireOnCall({
            success: false,
            httpStatus: res.status,
            retried: attempt,
            requestId,
            rateLimit,
          });
          throw new MercadoPagoOverloadedError(path, res.status);
        }

        let parsed: unknown;
        const text = await res.text();
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        const err = classifyError(res.status, path, parsed, options?.classifyContext);
        fireOnCall({
          success: false,
          httpStatus: res.status,
          retried: attempt,
          requestId,
          rateLimit,
        });
        throw err;
      } catch (err) {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
        // If err is a MercadoPagoError, the 5xx-final / 4xx branch already
        // fired onCall above — don't double-fire. Just re-throw.
        if (err instanceof MercadoPagoError) throw err;

        // Network error / abort / parse error — retry if budget remains
        const isAbort = err instanceof Error && err.name === "AbortError";
        // If parent signal aborted, don't retry (caller's deadline has expired)
        const isParentAbort = parentSignal?.aborted ?? false;
        const isNetwork = !lastStatus && !isAbort;
        if ((isNetwork || (isAbort && !isParentAbort)) && attempt < this.maxRetries) {
          lastError = err;
          attempt++;
          await sleep(250 * Math.pow(2, attempt - 1));
          continue;
        }
        fireOnCall({
          success: false,
          httpStatus: lastStatus,
          retried: attempt,
          requestId: null,
          rateLimit: { remaining: null, resetSeconds: null },
        });
        if (isAbort) {
          throw new MercadoPagoTimeoutError(path, this.requestTimeoutMs);
        }
        throw err;
      }
    }

    throw lastError ?? new Error(`MercadoPago request failed after ${this.maxRetries} retries`);
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
    // v0.5 — Marketplace split routing
    if (params.marketplace) body.marketplace = params.marketplace;
    if (params.marketplaceFee !== undefined) body.marketplace_fee = params.marketplaceFee;
    if (params.collectorId !== undefined) body.collector_id = params.collectorId;

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

  // ───────────────────────────────────────────────────────────────────────────
  // Card tokens (server-side, for saved-card retokenization)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a single-use card token from a saved card. This is the server-side
   * retokenization path (PCI-safe because the card data lives in MP's vault,
   * we only pass the saved card_id + customer_id + the user-supplied CVV).
   *
   * Tokens expire in 7 days but typically burn on first use. AR currently
   * REQUIRES CVV on every charge (MP doesn't store it); skipping CVV requires
   * a private MP product enablement, not a public API.
   */
  async createCardToken(params: CreateCardTokenParams): Promise<CardToken> {
    return this.request<CardToken>("POST", "/v1/card_tokens", {
      card_id: params.cardId,
      customer_id: params.customerId,
      security_code: params.securityCode,
    });
  }

  /**
   * High-level helper: charge a saved card in 3 steps.
   * 1. Mint a card token from {customer_id, card_id, security_code}
   * 2. Lookup card to fill payment_method_id (avoids agent guessing)
   * 3. Create the payment with the token + idempotency key
   *
   * Returns the resulting Payment. Uses deterministic idempotency from
   * (card_id, amount, externalReference) so retries dedupe on MP's side.
   */
  async chargeSavedCard(params: {
    customerId: string;
    cardId: string;
    securityCode: string;
    amount: number;
    description: string;
    installments?: number;
    externalReference?: string;
    statementDescriptor?: string;
    idempotencyKey?: string;
  }): Promise<Payment> {
    // Step 1: Mint single-use token
    const token = await this.createCardToken({
      cardId: params.cardId,
      customerId: params.customerId,
      securityCode: params.securityCode,
    });

    // Step 2: Lookup the saved card to fill payment_method_id
    const card = await this.getCustomerCard(params.customerId, params.cardId);
    const paymentMethodId = card.payment_method?.id;
    if (!paymentMethodId) {
      throw new MercadoPagoError(
        `Saved card ${params.cardId} has no payment_method.id. Cannot charge.`,
        0,
        `/v1/customers/${params.customerId}/cards/${params.cardId}`,
      );
    }

    // Step 3: Create payment
    const body: Record<string, unknown> = {
      transaction_amount: params.amount,
      token: token.id,
      payment_method_id: paymentMethodId,
      installments: params.installments ?? 1,
      description: params.description,
      payer: { type: "customer", id: params.customerId },
    };
    if (params.externalReference) body.external_reference = params.externalReference;
    if (params.statementDescriptor) body.statement_descriptor = params.statementDescriptor;

    return this.request<Payment>("POST", "/v1/payments", body, {
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
      classifyContext: { customerId: params.customerId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QR (in-store dynamic) — Section 2 of v0.3 spec
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a dynamic in-store QR order. Returns `qr_data` (EMVCo TLV string)
   * + `in_store_order_id`. The buyer scans the QR with any AR wallet (Modo,
   * BNA+, Cuenta DNI, Naranja X, etc. — interop is mandated by Transferencias
   * 3.0). On payment, MP fires `point_integration_wh` then `payment` topics.
   *
   * Requires a pre-configured POS (`external_pos_id` from MP dashboard or
   * `POST /pos`). The seller's `user_id` is auto-fetched from `/users/me`.
   *
   * The lib does NOT render the QR image — pass `qr_data` to a QR renderer
   * (e.g., `qrcode` package) to get a data URL. The agent tool layer wraps
   * this and returns both raw + data URL.
   */
  async createQrPayment(userId: string, params: CreateQrPaymentParams): Promise<QrOrder> {
    const body: Record<string, unknown> = {
      total_amount: params.totalAmount,
      title: params.title,
    };
    if (params.description) body.description = params.description;
    if (params.notificationUrl) body.notification_url = params.notificationUrl;
    if (params.externalReference) body.external_reference = params.externalReference;
    if (params.expirationDate) body.expiration_date = params.expirationDate;
    body.items = params.items ?? [
      {
        title: params.title,
        quantity: 1,
        unit_price: params.totalAmount,
        unit_measure: "unit",
        total_amount: params.totalAmount,
      },
    ];

    return this.request<QrOrder>(
      "PUT",
      `/instore/orders/qr/seller/collectors/${encodeURIComponent(userId)}/pos/${encodeURIComponent(params.externalPosId)}/qrs`,
      body,
    );
  }

  /**
   * Cancel a pending QR order on a POS. Necessary if the buyer never scans
   * — otherwise the next `createQrPayment` on the same POS returns 409.
   */
  async cancelQrPayment(userId: string, externalPosId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/instore/orders/qr/seller/collectors/${encodeURIComponent(userId)}/pos/${encodeURIComponent(externalPosId)}/qrs`,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Subscription Plans (preapproval_plan — reusable plans, v0.4)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a reusable subscription plan. Customers later subscribe to it via
   * `subscribeToPlan` (which creates a preapproval pointing at the plan).
   *
   * Use this when you have fixed tiers (Básico/Pro/Enterprise). For custom
   * per-customer amounts, skip plans and use `createPreapproval` directly.
   */
  async createSubscriptionPlan(params: CreateSubscriptionPlanParams): Promise<SubscriptionPlan> {
    const body: Record<string, unknown> = {
      reason: params.reason,
      back_url: params.backUrl,
      auto_recurring: {
        frequency: params.frequency,
        frequency_type: params.frequencyType,
        transaction_amount: params.amount,
        currency_id: params.currency,
        ...(params.freeTrialFrequency !== undefined && params.freeTrialFrequencyType !== undefined
          ? {
              free_trial: {
                frequency: params.freeTrialFrequency,
                frequency_type: params.freeTrialFrequencyType,
              },
            }
          : {}),
      },
    };
    if (params.externalReference) body.external_reference = params.externalReference;
    return this.request<SubscriptionPlan>("POST", "/preapproval_plan", body);
  }

  async getSubscriptionPlan(id: string): Promise<SubscriptionPlan> {
    return this.request<SubscriptionPlan>("GET", `/preapproval_plan/${id}`);
  }

  async listSubscriptionPlans(params: { limit?: number; offset?: number; status?: string } = {}): Promise<{
    paging: { total: number; limit: number; offset: number };
    results: SubscriptionPlan[];
  }> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
    };
    if (params.status) query["status"] = params.status;
    return this.request("GET", "/preapproval_plan/search", undefined, { query });
  }

  async updateSubscriptionPlan(
    id: string,
    patch: { reason?: string; status?: "active" | "cancelled"; amount?: number; backUrl?: string },
  ): Promise<SubscriptionPlan> {
    const body: Record<string, unknown> = {};
    if (patch.reason !== undefined) body.reason = patch.reason;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.backUrl !== undefined) body.back_url = patch.backUrl;
    if (patch.amount !== undefined) {
      body.auto_recurring = { transaction_amount: patch.amount };
    }
    return this.request<SubscriptionPlan>("PUT", `/preapproval_plan/${id}`, body);
  }

  /**
   * Subscribe a customer to an existing plan. Returns a Preapproval with
   * `init_point` URL where the buyer completes the first payment.
   */
  async subscribeToPlan(params: {
    planId: string;
    payerEmail: string;
    cardTokenId?: string;
    externalReference?: string;
  }): Promise<Preapproval> {
    const body: Record<string, unknown> = {
      preapproval_plan_id: params.planId,
      payer_email: params.payerEmail,
    };
    if (params.cardTokenId) body.card_token_id = params.cardTokenId;
    if (params.externalReference) body.external_reference = params.externalReference;
    return this.request<Preapproval>("POST", "/preapproval", body, {
      classifyContext: { payerEmail: params.payerEmail },
    });
  }

  /**
   * List the auto-charge attempts (authorized_payments) under a preapproval.
   * Useful for "show me the cobros of the last 6 months for this client".
   */
  async listSubscriptionPayments(preapprovalId: string, params: { limit?: number; offset?: number } = {}): Promise<{
    paging: { total: number; limit: number; offset: number };
    results: SubscriptionPayment[];
  }> {
    const query: Record<string, string | number | undefined> = {
      preapproval_id: preapprovalId,
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
    };
    return this.request(
      "GET",
      `/authorized_payments/search`,
      undefined,
      { query, classifyContext: { preapprovalId } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stores + POS (for QR payments self-serve setup, v0.4)
  // ───────────────────────────────────────────────────────────────────────────

  /** Create a store for the seller. POSes (for QR) live under stores. */
  async createStore(userId: string, params: CreateStoreParams): Promise<Store> {
    const body: Record<string, unknown> = {
      name: params.name,
      external_id: params.externalId,
    };
    if (params.location) {
      body.location = {
        ...(params.location.addressLine ? { address_line: params.location.addressLine } : {}),
        ...(params.location.cityName ? { city_name: params.location.cityName } : {}),
        ...(params.location.stateName ? { state_name: params.location.stateName } : {}),
        ...(params.location.countryId ? { country_id: params.location.countryId } : {}),
        ...(params.location.latitude !== undefined ? { latitude: params.location.latitude } : {}),
        ...(params.location.longitude !== undefined ? { longitude: params.location.longitude } : {}),
      };
    }
    return this.request<Store>("POST", `/users/${encodeURIComponent(userId)}/stores`, body);
  }

  async listStores(userId: string, params: { limit?: number; offset?: number } = {}): Promise<{
    paging: { total: number; limit: number; offset: number };
    results: Store[];
  }> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    };
    return this.request("GET", `/users/${encodeURIComponent(userId)}/stores/search`, undefined, { query });
  }

  /** Create a POS under a store. The POS's `external_id` is what `createQrPayment` uses. */
  async createPos(params: CreatePosParams): Promise<Pos> {
    const body: Record<string, unknown> = {
      name: params.name,
      external_id: params.externalId,
      store_id: params.storeId,
      category: params.category ?? 621102, // "Other Food and Beverage Services" — generic default
    };
    if (params.fixedAmount !== undefined) body.fixed_amount = params.fixedAmount;
    return this.request<Pos>("POST", "/pos", body);
  }

  async listPos(params: { storeId?: string | number; limit?: number; offset?: number } = {}): Promise<{
    paging: { total: number; limit: number; offset: number };
    results: Pos[];
  }> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    };
    if (params.storeId !== undefined) query["store_id"] = String(params.storeId);
    return this.request("GET", "/pos", undefined, { query });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Disputes (read-only, v0.4)
  // ───────────────────────────────────────────────────────────────────────────

  async listPaymentDisputes(paymentId: string): Promise<Dispute[]> {
    return this.request<Dispute[]>("GET", `/v1/payments/${paymentId}/disputes`, undefined, {
      classifyContext: { paymentId },
    });
  }

  async getDispute(paymentId: string, disputeId: string): Promise<Dispute> {
    return this.request<Dispute>(
      "GET",
      `/v1/payments/${paymentId}/disputes/${disputeId}`,
      undefined,
      { classifyContext: { paymentId } },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Identification Types + Issuers (lookup helpers, v0.4)
  // ───────────────────────────────────────────────────────────────────────────

  /** List valid identification types for the seller's site. AR returns DNI/CI/LE/LC/Otro/Pasaporte/CUIT/CUIL. */
  async listIdentificationTypes(): Promise<IdentificationType[]> {
    return this.request<IdentificationType[]>("GET", "/v1/identification_types");
  }

  /** List card issuers for a payment method. Useful with `bin` for installments. */
  async listIssuers(params: { paymentMethodId: string; bin?: string }): Promise<Issuer[]> {
    const query: Record<string, string | number | undefined> = {
      payment_method_id: params.paymentMethodId,
    };
    if (params.bin) query["bin"] = params.bin;
    return this.request<Issuer[]>("GET", "/v1/payment_methods/card_issuers", undefined, { query });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Webhooks management (v0.4)
  // ───────────────────────────────────────────────────────────────────────────

  /** List configured webhook subscriptions. */
  async listWebhooks(): Promise<WebhookConfig[]> {
    return this.request<WebhookConfig[]>("GET", "/v1/webhooks");
  }

  /** Create a webhook subscription for a topic. */
  async createWebhook(params: CreateWebhookParams): Promise<WebhookConfig> {
    return this.request<WebhookConfig>("POST", "/v1/webhooks", {
      url: params.url,
      topic: params.topic,
    });
  }

  async updateWebhook(id: string, patch: { url?: string; topic?: string }): Promise<WebhookConfig> {
    return this.request<WebhookConfig>("PUT", `/v1/webhooks/${id}`, patch);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request("DELETE", `/v1/webhooks/${id}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.5 — Order Management API
  //
  // The Order API is MP's newer abstraction for purchases, replacing some
  // Preference flows. Distinct from Preference: Order is a transactional
  // entity with explicit lifecycle (created → processed → captured/canceled),
  // supports manual capture (auth-only, capture later), and can attach
  // multiple payments to a single Order.
  //
  // Use Order when you need:
  // - Auth-only flow (capture later, e.g. ride-share, hotels)
  // - Multi-payment aggregation (one Order = N partial payments)
  // - In-store + online unified status
  //
  // Stick with Preference (Checkout Pro) when you just need a hosted pay-link.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a new Order. Use `capture_mode: "manual"` for auth-only flows
   * where you want to capture funds later (ride-share, hotels, marketplaces).
   *
   * For marketplace splits, set `marketplace`, `marketplace_fee`,
   * `collector_id` — see `MarketplaceParams`.
   */
  async createOrder(
    params: CreateOrderParams,
    options?: RequestOptions,
  ): Promise<Order> {
    const body: Record<string, unknown> = {
      type: params.type,
    };
    if (params.currency_id) body.currency_id = params.currency_id;
    if (params.external_reference) body.external_reference = params.external_reference;
    if (params.items) body.items = params.items;
    if (params.total_amount !== undefined) body.total_amount = params.total_amount;
    if (params.payer) body.payer = params.payer;
    if (params.capture_mode) body.capture_mode = params.capture_mode;
    if (params.notification_url) body.notification_url = params.notification_url;
    if (params.marketplace) body.marketplace = params.marketplace;
    if (params.marketplace_fee !== undefined) body.marketplace_fee = params.marketplace_fee;
    if (params.collector_id !== undefined) body.collector_id = params.collector_id;

    return this.request<Order>("POST", "/v1/orders", body, options);
  }

  async getOrder(id: string): Promise<Order> {
    return this.request<Order>("GET", `/v1/orders/${id}`);
  }

  async updateOrder(
    id: string,
    patch: Partial<CreateOrderParams>,
  ): Promise<Order> {
    return this.request<Order>("PUT", `/v1/orders/${id}`, patch);
  }

  /**
   * Capture a previously-authorized Order (only for orders created with
   * `capture_mode: "manual"`). Captures up to the originally-authorized
   * amount; pass `amount` for partial capture.
   */
  async captureOrder(id: string, amount?: number): Promise<Order> {
    const body = amount !== undefined ? { amount } : {};
    return this.request<Order>("POST", `/v1/orders/${id}/capture`, body);
  }

  /**
   * Cancel an Order. Releases any auth-holds; marks the Order as canceled.
   * For orders that have already been captured, use `createRefund` instead.
   */
  async cancelOrder(id: string): Promise<Order> {
    return this.request<Order>("POST", `/v1/orders/${id}/cancel`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.6 — Account Balance + Movements
  //
  // Inspect the seller's MP wallet — what's available to withdraw, what's
  // in retention (pending release), and the movement log.
  //
  // For per-seller marketplace setups, instantiate the client AS THE SELLER
  // (with their OAuth access_token) before calling these — `getAccountBalance`
  // returns the balance of WHOEVER's accessToken is active.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get the seller's current MP wallet balance (available + unavailable).
   * - `available_balance`: spendable / withdrawable right now.
   * - `unavailable_balance`: in retention (e.g., 14-21 days for new sellers).
   * - `total_amount` = sum of both.
   */
  async getAccountBalance(): Promise<AccountBalance> {
    return this.request<AccountBalance>("GET", "/users/me/mercadopago_account/balance");
  }

  /**
   * List wallet movements (incoming payments, transfers, refunds, holdings).
   * Defaults to most-recent-first, paginated. Filter by date range with
   * `from`/`to` (ISO 8601).
   */
  async listAccountMovements(
    params: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ): Promise<{ movements: AccountMovement[]; paging: { limit: number; offset: number; total: number } }> {
    const query: Record<string, string | number> = {};
    if (params.from) query.begin_date = params.from;
    if (params.to) query.end_date = params.to;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    const result = await this.request<{
      results?: AccountMovement[];
      paging?: { limit: number; offset: number; total: number };
    }>("GET", "/users/me/mercadopago_account/movements/search", undefined, { query });
    return {
      movements: result.results ?? [],
      paging: result.paging ?? { limit: params.limit ?? 25, offset: params.offset ?? 0, total: 0 },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.6 — Settlements (release_money)
  //
  // When MP transfers funds from your MP wallet to your registered CBU.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List settlements (transfers from MP wallet to your bank account).
   * Useful for monthly conciliation reports.
   */
  async listSettlements(
    params: { from?: string; to?: string; status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ settlements: Settlement[]; paging: { limit: number; offset: number; total: number } }> {
    const query: Record<string, string | number> = {};
    if (params.from) query.begin_date = params.from;
    if (params.to) query.end_date = params.to;
    if (params.status) query.status = params.status;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    const result = await this.request<{
      results?: Settlement[];
      paging?: { limit: number; offset: number; total: number };
    }>("GET", "/v1/account/release_money/search", undefined, { query });
    return {
      settlements: result.results ?? [],
      paging: result.paging ?? { limit: params.limit ?? 25, offset: params.offset ?? 0, total: 0 },
    };
  }

  /**
   * Get a single settlement by id. Returns the full Settlement object
   * including bank_account info (CBU, bank name).
   */
  async getSettlement(id: string): Promise<Settlement> {
    return this.request<Settlement>("GET", `/v1/account/release_money/${id}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Customer + Card extensions (close gaps)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Update a customer's profile (name, last name, address, etc.). MP merges
   * the patch — fields you don't send remain unchanged.
   */
  async updateCustomer(
    id: string,
    patch: Partial<{
      first_name: string;
      last_name: string;
      phone: { area_code?: string; number?: string };
      identification: { type: string; number: string };
      address: { street_name?: string; street_number?: number; zip_code?: string };
      description: string;
      default_card?: string;
    }>,
  ): Promise<Customer> {
    return this.request<Customer>("PUT", `/v1/customers/${id}`, patch);
  }

  /**
   * Add a saved card to a customer using a card token (one-time, get from
   * MP's frontend Cardform). The card is then chargeable with charge_saved_card.
   */
  async createCustomerCard(
    customerId: string,
    cardToken: string,
  ): Promise<CustomerCard> {
    return this.request<CustomerCard>(
      "POST",
      `/v1/customers/${customerId}/cards`,
      { token: cardToken },
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Subscription extensions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Update an existing subscription. Common patches:
   * - `transaction_amount` to change the recurring amount
   * - `card_token_id` to switch payment method (e.g., expired card)
   * - `status: "cancelled" | "paused"` (alternative to dedicated cancel/pause endpoints)
   * - `reason` to update the description shown to the buyer
   */
  async updatePreapproval(
    id: string,
    patch: Partial<{
      transaction_amount: number;
      card_token_id: string;
      status: "authorized" | "paused" | "cancelled";
      reason: string;
      external_reference: string;
    }>,
  ): Promise<Preapproval> {
    return this.request<Preapproval>("PUT", `/preapproval/${id}`, patch);
  }

  /**
   * Search subscriptions across the seller's account. Common filters:
   * `status` (pending/authorized/paused/cancelled), `payer_email`,
   * `external_reference`. Paginated.
   */
  async searchPreapprovals(
    params: {
      status?: string;
      payerEmail?: string;
      externalReference?: string;
      preapproval_plan_id?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    results: Preapproval[];
    paging: { limit: number; offset: number; total: number };
  }> {
    const query: Record<string, string | number> = {};
    if (params.status) query.status = params.status;
    if (params.payerEmail) query.payer_email = params.payerEmail;
    if (params.externalReference) query.external_reference = params.externalReference;
    if (params.preapproval_plan_id) query.preapproval_plan_id = params.preapproval_plan_id;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    const result = await this.request<{
      results?: Preapproval[];
      paging?: { limit: number; offset: number; total: number };
    }>("GET", "/preapproval/search", undefined, { query });
    return {
      results: result.results ?? [],
      paging: result.paging ?? { limit: params.limit ?? 25, offset: params.offset ?? 0, total: 0 },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Merchant Orders (parent of Payments grouped under a Preference)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get a merchant_order with all its associated payments + shipments.
   * Useful for reconciling "which payments belong to which preference"
   * — typical webhook handler use case.
   */
  async getMerchantOrder(id: string): Promise<MerchantOrder> {
    return this.request<MerchantOrder>("GET", `/merchant_orders/${id}`);
  }

  /**
   * Search merchant_orders by external_reference, preference_id, or status.
   */
  async searchMerchantOrders(
    params: {
      preferenceId?: string;
      externalReference?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    elements: MerchantOrder[];
    paging: { limit: number; offset: number; total: number };
  }> {
    const query: Record<string, string | number> = {};
    if (params.preferenceId) query.preference_id = params.preferenceId;
    if (params.externalReference) query.external_reference = params.externalReference;
    if (params.status) query.status = params.status;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    const result = await this.request<{
      elements?: MerchantOrder[];
      paging?: { limit: number; offset: number; total: number };
    }>("GET", "/merchant_orders/search", undefined, { query });
    return {
      elements: result.elements ?? [],
      paging: result.paging ?? { limit: params.limit ?? 25, offset: params.offset ?? 0, total: 0 },
    };
  }

  /**
   * Update a merchant_order — typically to add items or update shipping.
   */
  async updateMerchantOrder(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<MerchantOrder> {
    return this.request<MerchantOrder>("PUT", `/merchant_orders/${id}`, patch);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Stores + POS CRUD completion
  // ──────────────────────────────────────────────────────────────────────────

  async getStore(userId: string, storeId: string): Promise<Store> {
    return this.request<Store>("GET", `/users/${userId}/stores/${storeId}`);
  }

  async updateStore(
    userId: string,
    storeId: string,
    patch: Partial<CreateStoreParams>,
  ): Promise<Store> {
    return this.request<Store>("PUT", `/users/${userId}/stores/${storeId}`, patch);
  }

  async deleteStore(userId: string, storeId: string): Promise<void> {
    await this.request("DELETE", `/users/${userId}/stores/${storeId}`);
  }

  async getPos(posId: string): Promise<Pos> {
    return this.request<Pos>("GET", `/pos/${posId}`);
  }

  async updatePos(
    posId: string,
    patch: Partial<CreatePosParams>,
  ): Promise<Pos> {
    return this.request<Pos>("PUT", `/pos/${posId}`, patch);
  }

  async deletePos(posId: string): Promise<void> {
    await this.request("DELETE", `/pos/${posId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Bank Accounts (the CBUs the seller has registered for payouts)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List bank accounts registered by the seller. The default is the one
   * that receives `release_money` settlements.
   */
  async listBankAccounts(): Promise<BankAccount[]> {
    const result = await this.request<{ results?: BankAccount[] } | BankAccount[]>(
      "GET",
      "/users/me/bank_accounts",
    );
    if (Array.isArray(result)) return result;
    return result.results ?? [];
  }

  /**
   * Register a new bank account (CBU) for the seller. Note: MP usually
   * requires this through the dashboard for compliance — this endpoint may
   * not work for all sellers.
   */
  async registerBankAccount(params: {
    cbu: string;
    alias?: string;
  }): Promise<BankAccount> {
    return this.request<BankAccount>("POST", "/users/me/bank_accounts", params);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.7 — Point Devices (physical terminal hardware: Smart, Tap to Pay)
  //
  // Distinct from the logical `Pos` entity. PointDevices are the actual
  // physical terminals you have at brick-and-mortar shops.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List the Point devices linked to the seller's MP account. Each device
   * has an id (the device serial), an operating_mode (PDV vs STANDALONE),
   * and an optional pos_id (when bound to a logical POS).
   */
  async listPointDevices(
    params: { posId?: string | number; limit?: number; offset?: number } = {},
  ): Promise<{ devices: PointDevice[]; paging: { total: number; limit: number; offset: number } }> {
    const query: Record<string, string | number> = {};
    if (params.posId !== undefined) query["pos.id"] = params.posId;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    const result = await this.request<{
      devices?: PointDevice[];
      paging?: { total: number; limit: number; offset: number };
    }>("GET", "/point/integration-api/devices", undefined, { query });
    return {
      devices: result.devices ?? [],
      paging: result.paging ?? { total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0 },
    };
  }

  /**
   * Switch a Point device's operating mode:
   * - "PDV": device is bound to a logical Pos and only takes payments
   *   triggered through that Pos (typical for cash-register integrations).
   * - "STANDALONE": device works independently, accepts any payment.
   */
  async updatePointDeviceOperatingMode(
    deviceId: string,
    operatingMode: "PDV" | "STANDALONE",
  ): Promise<PointDevice> {
    return this.request<PointDevice>(
      "PATCH",
      `/point/integration-api/devices/${encodeURIComponent(deviceId)}`,
      { operating_mode: operatingMode },
    );
  }

  /**
   * Create a payment intent on a Point device — the device prompts the buyer
   * to tap/insert/swipe. Returns immediately with intent id; query state via
   * `getPointPaymentIntent()` or wait for `point_integration_wh` webhook.
   *
   * NOTE: amount is in CENTAVOS (Point API differs from Payments API which
   * uses pesos). 100 = $1 ARS, 1000 = $10, 10000 = $100, etc.
   */
  async createPointPaymentIntent(
    deviceId: string,
    params: CreatePointPaymentIntentParams,
  ): Promise<PointPaymentIntent> {
    const body: Record<string, unknown> = {
      amount: params.amount,
      ...(params.description ? { description: params.description } : {}),
      ...(params.externalReference
        ? { additional_info: { external_reference: params.externalReference } }
        : {}),
      payment: {
        installments: params.installments ?? 1,
        ...(params.installmentsCost
          ? { installments_cost: params.installmentsCost }
          : {}),
        ...(params.printOnTerminal !== undefined
          ? { print_on_terminal: params.printOnTerminal }
          : {}),
        ...(params.ticketNumber ? { ticket_number: params.ticketNumber } : {}),
      },
    };
    return this.request<PointPaymentIntent>(
      "POST",
      `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`,
      body,
    );
  }

  /** Get the current state of a Point payment intent. */
  async getPointPaymentIntent(intentId: string): Promise<PointPaymentIntent> {
    return this.request<PointPaymentIntent>(
      "GET",
      `/point/integration-api/payment-intents/${encodeURIComponent(intentId)}`,
    );
  }

  /**
   * Cancel an OPEN payment intent before the buyer interacts with the device.
   * Only works while state is "OPEN" — once the buyer taps, you can't cancel.
   */
  async cancelPointPaymentIntent(
    deviceId: string,
    intentId: string,
  ): Promise<{ id: string; canceled: true }> {
    await this.request(
      "DELETE",
      `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    );
    return { id: intentId, canceled: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // v0.9 — Health check
  //
  // No dedicated ping endpoint exists in MP's public API. We use `getMe()`
  // (`/users/me`) as a lightweight liveness probe — it requires only a valid
  // accessToken, returns ~200 bytes of JSON, and is the same call MP's own
  // dashboard makes on startup. A successful response proves: (a) network
  // path to MP is up, (b) accessToken is valid, (c) MP is responding.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Liveness probe against MP. Returns latency + circuit-breaker state.
   * Use as a /health endpoint for k8s, Vercel cron, or status-page checks.
   *
   * Returns `{ ok: false, ... }` instead of throwing — designed for
   * monitoring loops that want to keep running.
   *
   * @param signal Optional AbortSignal to cap wait time (e.g., 2s for
   *               status-page polling).
   */
  async healthCheck(signal?: AbortSignal): Promise<{
    ok: boolean;
    latencyMs: number;
    /** MP user_id when reachable. */
    userId: string | null;
    /** Last error message when not OK. */
    error: string | null;
    /** Circuit breaker state when configured. */
    circuit: ReturnType<CircuitBreaker["getStats"]> | null;
  }> {
    const t0 = Date.now();
    const circuitBefore = this.circuitBreaker?.getStats() ?? null;
    try {
      const me = await this.request<AccountInfo>(
        "GET",
        "/users/me",
        undefined,
        signal ? { signal } : {},
      );
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        userId: String(me.id),
        error: null,
        circuit: this.circuitBreaker?.getStats() ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        userId: null,
        error: message,
        circuit: this.circuitBreaker?.getStats() ?? circuitBefore,
      };
    }
  }
}

export { MercadoPagoError };
