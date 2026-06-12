/**
 * x402 error model. All public-API errors inherit from `X402Error` so
 * agents (and ar-agents/tool() callers) can `instanceof` dispatch in one
 * branch instead of pattern-matching across cases.
 *
 * `X402Error` extends `ArAgentsError` from `@ar-agents/core` so the same
 * middleware (withRetry, withMetrics, ...) treats x402 errors identically
 * to errors from every other `@ar-agents/*` package.
 */

import { ArAgentsError } from "@ar-agents/core";

/** Codes whose `retryable` flag is `true` (server-side / transient). */
const RETRYABLE_CODES = new Set(["facilitator_error"]);

export class X402Error extends ArAgentsError {
  public readonly status?: number | undefined;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    opts: { status?: number; details?: unknown } = {},
  ) {
    super(message, {
      code,
      retryable:
        RETRYABLE_CODES.has(code) ||
        (opts.status !== undefined && opts.status >= 500),
      context: {
        ...(opts.status !== undefined ? { status: opts.status } : {}),
        ...(opts.details !== undefined ? { details: opts.details } : {}),
      },
    });
    this.name = "X402Error";
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.details !== undefined) this.details = opts.details;
  }
}

/** No signer wired. The default unconfigured signer cannot pay. */
export class X402UnconfiguredError extends X402Error {
  constructor(operation: string) {
    super(
      "unconfigured",
      `x402 signer is not configured. Operation "${operation}" requires a signer callback (e.g. one built on viem or the CDP SDK) passed to x402Fetch / x402Tools. Without it this package can only PROBE payment requirements, never pay.`,
    );
    this.name = "X402UnconfiguredError";
  }
}

/** The 402 body / header / facilitator response failed schema validation. */
export class X402ProtocolError extends X402Error {
  constructor(message: string, details?: unknown) {
    super("protocol", message, { details });
    this.name = "X402ProtocolError";
  }
}

/** The facilitator returned a non-2xx HTTP status. */
export class X402FacilitatorError extends X402Error {
  constructor(status: number, body: unknown) {
    super(
      "facilitator_error",
      `x402 facilitator returned HTTP ${status}. Body: ${
        typeof body === "string"
          ? body.slice(0, 200)
          : (JSON.stringify(body) ?? "<empty>").slice(0, 200)
      }`,
      { status, details: body },
    );
    this.name = "X402FacilitatorError";
  }
}

/** The resource server still returned 402 after payment was attached. */
export class X402PaymentRejectedError extends X402Error {
  constructor(message: string, details?: unknown) {
    super("payment_rejected", message, { status: 402, details });
    this.name = "X402PaymentRejectedError";
  }
}
