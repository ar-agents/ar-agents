/**
 * Error base + taxonomy primitives for @ar-agents/*.
 *
 * Every package SHOULD extend `ArAgentsError` for its own typed
 * errors so callers can rely on:
 *
 *   - `code: string` — machine-readable identifier
 *   - `retryable: boolean` — whether the caller should backoff + retry
 *   - `context: Record<string, unknown>` — structured ctx for logs
 *
 * Use the helper subclasses when the situation matches; subclass them
 * for jurisdiction/service-specific cases.
 */

export interface ArAgentsErrorInit {
  code: string;
  /** Retry after backoff? Defaults to false. */
  retryable?: boolean;
  /** Structured context attached to the error. Never include secrets. */
  context?: Record<string, unknown>;
  /** Underlying cause. */
  cause?: unknown;
}

export class ArAgentsError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(message: string, init: ArAgentsErrorInit) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "ArAgentsError";
    this.code = init.code;
    this.retryable = init.retryable ?? false;
    this.context = init.context ?? {};
  }
}

/** Caller passed bad input. Do NOT retry. */
export class ArAgentsValidationError extends ArAgentsError {
  readonly field: string;
  constructor(field: string, message: string, context?: Record<string, unknown>) {
    super(`Invalid ${field}: ${message}`, {
      code: "validation_failed",
      retryable: false,
      context: { ...context, field },
    });
    this.name = "ArAgentsValidationError";
    this.field = field;
  }
}

/**
 * Upstream returned a 2xx body whose SHAPE failed the response schema.
 *
 * This is the single most important error in the SDK's live-integration
 * story: it is what turns a malformed / partial / silently-changed API
 * response into a LOUD failure instead of letting `?? 0 / ?? [] / ?? false`
 * defaults fabricate a clean, creditworthy, zero-debt, invoiced, or canceled
 * result. Distinct from {@link ArAgentsValidationError} (bad *caller* input) so
 * a caller can tell "I sent garbage" apart from "the State/bank sent garbage."
 *
 * NOT retryable: a contract mismatch does not fix itself on backoff. Surface it
 * — a human needs to look at whether the upstream shape drifted.
 */
export class ArAgentsResponseValidationError extends ArAgentsError {
  readonly field: string;
  constructor(field: string, message: string, context?: Record<string, unknown>) {
    super(`Response validation failed at ${field}: ${message}`, {
      code: "response_validation_failed",
      retryable: false,
      context: { ...context, field },
    });
    this.name = "ArAgentsResponseValidationError";
    this.field = field;
  }
}

/** Adapter not wired. Surface to the operator. */
export class ArAgentsUnconfiguredError extends ArAgentsError {
  constructor(
    operation: string,
    label = "unconfigured",
    context?: Record<string, unknown>,
  ) {
    super(`Operation "${operation}" is not configured (${label}).`, {
      code: "unconfigured",
      retryable: false,
      context: { ...context, operation, label },
    });
    this.name = "ArAgentsUnconfiguredError";
  }
}

/** Auth rejected (token missing / expired / wrong scope). Don't retry blindly. */
export class ArAgentsAuthError extends ArAgentsError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "auth_failed",
      retryable: false,
      context: context ?? {},
    });
    this.name = "ArAgentsAuthError";
  }
}

/** Rate limit hit. Honors `retryAfterMs` for the caller's backoff loop. */
export class ArAgentsRateLimitError extends ArAgentsError {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number, context?: Record<string, unknown>) {
    super(`Rate limit exceeded; retry in ${retryAfterMs}ms.`, {
      code: "rate_limited",
      retryable: true,
      context: { ...context, retryAfterMs },
    });
    this.name = "ArAgentsRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Network / HTTP / upstream-service-down. Generally safe to retry. */
export class ArAgentsProtocolError extends ArAgentsError {
  readonly status: number | null;
  constructor(
    message: string,
    init: { status?: number | null; context?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, {
      code: "protocol_error",
      retryable: true,
      context: { ...init.context, status: init.status ?? null },
      cause: init.cause,
    });
    this.name = "ArAgentsProtocolError";
    this.status = init.status ?? null;
  }
}

/**
 * Type guard for any `@ar-agents/*` error. Use in switch logic:
 *
 *   try { ... } catch (e) {
 *     if (isArAgentsError(e) && e.retryable) backoffAndRetry();
 *     else throw e;
 *   }
 */
export function isArAgentsError(value: unknown): value is ArAgentsError {
  return value instanceof Error && (value as ArAgentsError).code !== undefined;
}
