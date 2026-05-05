/**
 * Base class for any error originating from the Mercado Pago integration. All
 * specific error types extend this. Carries the MP HTTP status, the parsed
 * body when available, and the endpoint that failed for debugging.
 */
export class MercadoPagoError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
    public mpResponse?: unknown,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

/**
 * Thrown when the access token is missing, expired, or rejected by MP.
 */
export class MercadoPagoAuthError extends MercadoPagoError {
  constructor(endpoint: string, body?: unknown) {
    super(
      "Mercado Pago rejected the request as unauthorized. Check the access token (TEST- prefix for sandbox, APP_USR- for production).",
      401,
      endpoint,
      body,
    );
    this.name = "MercadoPagoAuthError";
  }
}

/**
 * Thrown when MP returns the "back_url is not a valid URL" rejection. Common
 * when devs pass localhost or http:// — MP requires HTTPS only, even in sandbox.
 */
export class MercadoPagoBackUrlInvalidError extends MercadoPagoError {
  constructor(endpoint: string, body?: unknown) {
    super(
      "back_url must be a valid HTTPS URL. localhost and http:// URLs are rejected by Mercado Pago, including in sandbox. Use a placeholder like https://example.com/done for local testing.",
      400,
      endpoint,
      body,
    );
    this.name = "MercadoPagoBackUrlInvalidError";
  }
}

/**
 * Thrown when the buyer email matches the seller account's email. MP refuses
 * self-payment on subscriptions: the Confirmar button at the init_point UI
 * stays disabled with no surfaceable error message.
 */
export class MercadoPagoSelfPaymentError extends MercadoPagoError {
  constructor(endpoint: string, body?: unknown) {
    super(
      "The buyer email cannot equal the seller account's email. Mercado Pago blocks self-payment on subscriptions.",
      400,
      endpoint,
      body,
    );
    this.name = "MercadoPagoSelfPaymentError";
  }
}

/**
 * Thrown when MP returns "Cannot operate between different countries". Despite
 * the error text, this generally signals an account-type mismatch (real
 * account-in-test-mode vs. test user account), not a literal country mismatch.
 */
export class MercadoPagoAccountTypeMismatchError extends MercadoPagoError {
  constructor(endpoint: string, body?: unknown) {
    super(
      "Mercado Pago rejected the operation: 'Cannot operate between different countries'. Despite the wording, this usually means the seller token and the buyer email are different account types (real-account-in-test-mode vs. test_user_*@testuser.com). Use a real consumer email as the buyer.",
      400,
      endpoint,
      body,
    );
    this.name = "MercadoPagoAccountTypeMismatchError";
  }
}

/**
 * Thrown when MP's risk engine rejects the first payment of a subscription.
 * IMPORTANT: when this happens, MP automatically cancels the entire preapproval
 * — you cannot retry on the same subscription, you must create a fresh one.
 */
export class MercadoPagoPaymentRejectedError extends MercadoPagoError {
  constructor(
    public preapprovalId: string,
    public statusDetail: string | null,
    body?: unknown,
  ) {
    super(
      `Payment rejected by Mercado Pago risk engine on preapproval ${preapprovalId}. Status detail: ${statusDetail ?? "unknown"}. The preapproval was auto-cancelled by MP — create a fresh subscription to retry.`,
      400,
      `/preapproval/${preapprovalId}`,
      body,
    );
    this.name = "MercadoPagoPaymentRejectedError";
  }
}

/**
 * Thrown when an attempt is made to authorize a preapproval via API. Only the
 * payer can authorize via the init_point UI; there is no admin override even
 * in sandbox.
 */
export class MercadoPagoAuthorizeForbiddenError extends MercadoPagoError {
  constructor(preapprovalId: string, body?: unknown) {
    super(
      `Cannot authorize preapproval ${preapprovalId} via API: only the payer can authorize through the init_point checkout. There is no API shortcut, even in sandbox.`,
      400,
      `/preapproval/${preapprovalId}`,
      body,
    );
    this.name = "MercadoPagoAuthorizeForbiddenError";
  }
}

/**
 * Thrown when MP rate-limits the integration. Retry with exponential backoff.
 */
export class MercadoPagoRateLimitError extends MercadoPagoError {
  constructor(
    endpoint: string,
    public retryAfterSeconds: number | null,
    body?: unknown,
  ) {
    super(
      `Mercado Pago rate limit hit on ${endpoint}. ${
        retryAfterSeconds
          ? `Retry after ${retryAfterSeconds}s.`
          : "Retry with exponential backoff."
      }`,
      429,
      endpoint,
      body,
    );
    this.name = "MercadoPagoRateLimitError";
  }
}

/**
 * Thrown when MP is overloaded and serves an HTML 503 page instead of a JSON
 * error. The library detects content-type !== application/json on 5xx and
 * raises this typed error so retry logic + agent UX can branch correctly.
 */
export class MercadoPagoOverloadedError extends MercadoPagoError {
  constructor(endpoint: string, status: number) {
    super(
      `Mercado Pago appears overloaded — returned a non-JSON ${status} response for ${endpoint}. Wait a few seconds and retry.`,
      status,
      endpoint,
    );
    this.name = "MercadoPagoOverloadedError";
  }
}

/**
 * Thrown when a request exceeds the configured `requestTimeoutMs`. Retried
 * automatically up to `maxRetries`; this surfaces only when the budget runs
 * out.
 */
export class MercadoPagoTimeoutError extends MercadoPagoError {
  constructor(endpoint: string, public readonly timeoutMs: number) {
    super(
      `Mercado Pago request timed out after ${timeoutMs}ms on ${endpoint}. Increase requestTimeoutMs or check connectivity.`,
      0,
      endpoint,
    );
    this.name = "MercadoPagoTimeoutError";
  }
}

/**
 * Maps an MP error response body to the most specific known error class. Falls
 * back to the generic MercadoPagoError when no specific pattern matches.
 */
export function classifyError(
  status: number,
  endpoint: string,
  body: unknown,
  context?: { preapprovalId?: string; payerEmail?: string; sellerEmail?: string },
): MercadoPagoError {
  const bodyText =
    typeof body === "string"
      ? body
      : body && typeof body === "object"
        ? JSON.stringify(body)
        : "";
  const lower = bodyText.toLowerCase();

  if (status === 401) return new MercadoPagoAuthError(endpoint, body);
  if (status === 429) {
    // Try to extract Retry-After from the body if it includes one.
    let retryAfter: number | null = null;
    const obj = body as { retry_after?: number; "retry-after"?: number } | undefined;
    if (obj?.retry_after) retryAfter = Number(obj.retry_after);
    else if (obj?.["retry-after"]) retryAfter = Number(obj["retry-after"]);
    return new MercadoPagoRateLimitError(endpoint, retryAfter, body);
  }
  if (status === 400) {
    if (lower.includes("back_url") && lower.includes("not a valid url")) {
      return new MercadoPagoBackUrlInvalidError(endpoint, body);
    }
    if (
      lower.includes("cannot operate") &&
      lower.includes("different countries")
    ) {
      return new MercadoPagoAccountTypeMismatchError(endpoint, body);
    }
    if (
      lower.includes("only the payer can") &&
      context?.preapprovalId
    ) {
      return new MercadoPagoAuthorizeForbiddenError(context.preapprovalId, body);
    }
    if (
      context?.payerEmail &&
      context?.sellerEmail &&
      context.payerEmail.toLowerCase() === context.sellerEmail.toLowerCase()
    ) {
      return new MercadoPagoSelfPaymentError(endpoint, body);
    }
  }
  return new MercadoPagoError(
    `Mercado Pago ${endpoint} failed: ${status} ${bodyText.slice(0, 200)}`,
    status,
    endpoint,
    body,
  );
}
