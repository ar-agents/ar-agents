/**
 * BIND error model. All public-API errors inherit from `BindError` so
 * agents (and ar-agents/tool() callers) can `instanceof` dispatch in one
 * branch instead of pattern-matching across cases.
 *
 * `BindError` extends `ArAgentsError` from `@ar-agents/core` so the same
 * middleware (withRetry, withMetrics, ...) treats BIND errors identically
 * to errors from every other `@ar-agents/*` package.
 */

import { ArAgentsError } from "@ar-agents/core";

/** Codes whose `retryable` flag is `true` (server-side / transient). */
const RETRYABLE_CODES = new Set(["api_error"]);

export class BindError extends ArAgentsError {
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
    this.name = "BindError";
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.details !== undefined) this.details = opts.details;
  }
}

export class BindAuthError extends BindError {
  constructor(message = "Authentication failed against BIND APIBANK.") {
    super("auth_failed", message, { status: 401 });
    this.name = "BindAuthError";
  }
}

export class BindApiError extends BindError {
  constructor(status: number, body: unknown) {
    super(
      "api_error",
      `BIND APIBANK returned HTTP ${status}. ` +
        `Body: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`,
      { status, details: body },
    );
    this.name = "BindApiError";
  }
}

export class BindValidationError extends BindError {
  constructor(field: string, message: string) {
    super("validation", `Invalid "${field}": ${message}`);
    this.name = "BindValidationError";
  }
}
