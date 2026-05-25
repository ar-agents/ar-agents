/**
 * Error taxonomy for @ar-agents/aduana.
 *
 * Extends ArAgentsError so middleware (withRetry, withMetrics, …) can
 * switch on code/retryable/context uniformly with the rest of the
 * @ar-agents/* family.
 */

import { ArAgentsError } from "@ar-agents/core";

export class AduanaError extends ArAgentsError {
  constructor(
    message: string,
    code = "aduana_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "AduanaError";
  }
}

export class AduanaValidationError extends AduanaError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "AduanaValidationError";
    this.field = field;
  }
}

export class AduanaUnconfiguredError extends AduanaError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `ARCA Aduana adapter not configured for "${operation}" (${label}). Wire HttpAduanaAdapter or a stub for tests.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "AduanaUnconfiguredError";
    this.operation = operation;
  }
}

export class AduanaApiError extends AduanaError {
  readonly status: number;
  constructor(status: number, body: unknown) {
    super(`ARCA Aduana API returned HTTP ${status}`, "api_error", {
      status,
      body,
    });
    this.name = "AduanaApiError";
    this.status = status;
    (this as { retryable: boolean }).retryable = status >= 500 || status === 429;
  }
}
