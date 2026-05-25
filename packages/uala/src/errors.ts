/**
 * Ualá error model. All public-API errors inherit from `UalaError` so
 * agents (and ar-agents/tool() callers) can `instanceof` dispatch in one
 * branch instead of pattern-matching across cases.
 *
 * `UalaError` extends `ArAgentsError` from `@ar-agents/core` so the same
 * middleware (withRetry, withMetrics, …) treats Ualá errors identically
 * to errors from every other `@ar-agents/*` package.
 */

import { ArAgentsError } from "@ar-agents/core";

/** Codes whose `retryable` flag is `true` (server-side / transient). */
const RETRYABLE_CODES = new Set(["api_error"]);

export class UalaError extends ArAgentsError {
  public readonly status?: number | undefined;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    opts: { status?: number; details?: unknown } = {},
  ) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES.has(code) || (opts.status !== undefined && opts.status >= 500),
      context: {
        ...(opts.status !== undefined ? { status: opts.status } : {}),
        ...(opts.details !== undefined ? { details: opts.details } : {}),
      },
    });
    this.name = "UalaError";
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.details !== undefined) this.details = opts.details;
  }
}

export class UalaUnconfiguredError extends UalaError {
  constructor(operation: string) {
    super(
      "unconfigured",
      `Ualá adapter is not configured. Operation "${operation}" requires a real UalaAdapter (e.g. UalaApiAdapter) wired with credentials. The default UnconfiguredUalaAdapter is for unit-tests only.`,
    );
    this.name = "UalaUnconfiguredError";
  }
}

export class UalaAuthError extends UalaError {
  constructor(message = "Authentication failed against Ualá API.") {
    super("auth_failed", message, { status: 401 });
    this.name = "UalaAuthError";
  }
}

export class UalaApiError extends UalaError {
  constructor(status: number, body: unknown) {
    super(
      "api_error",
      `Ualá API returned HTTP ${status}. ` +
        `Body: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`,
      { status, details: body },
    );
    this.name = "UalaApiError";
  }
}

export class UalaValidationError extends UalaError {
  constructor(field: string, message: string) {
    super("validation", `Invalid "${field}": ${message}`);
    this.name = "UalaValidationError";
  }
}
