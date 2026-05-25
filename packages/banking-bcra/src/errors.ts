/**
 * Error taxonomy for @ar-agents/banking-bcra.
 *
 * Extends `ArAgentsError` from `@ar-agents/core` so the family error
 * contract (code / retryable / context) is uniform across every
 * `@ar-agents/*` integration.
 */

import { ArAgentsError } from "@ar-agents/core";

export class BcraError extends ArAgentsError {
  constructor(
    message: string,
    init: {
      code: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, init);
    this.name = "BcraError";
  }
}

export class BcraValidationError extends BcraError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, {
      code: "validation_failed",
      retryable: false,
      context: { field },
    });
    this.name = "BcraValidationError";
    this.field = field;
  }
}

export class BcraNotFoundError extends BcraError {
  readonly cuit: string;
  constructor(cuit: string) {
    super(
      `BCRA has no records for CUIT ${cuit}. This is the expected response for taxpayers without any reported bank debt — treat as "clean" rather than as an error.`,
      {
        code: "not_found",
        retryable: false,
        context: { cuit },
      },
    );
    this.name = "BcraNotFoundError";
    this.cuit = cuit;
  }
}

export class BcraApiError extends BcraError {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, context?: Record<string, unknown>) {
    super(`BCRA API returned HTTP ${status}`, {
      code: "api_error",
      retryable: status >= 500 || status === 429,
      context: { ...context, status },
    });
    this.name = "BcraApiError";
    this.status = status;
    this.body = body;
  }
}

export class BcraUnconfiguredError extends BcraError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(`BCRA adapter not configured for "${operation}" (${label}).`, {
      code: "unconfigured",
      retryable: false,
      context: { operation, label },
    });
    this.name = "BcraUnconfiguredError";
    this.operation = operation;
  }
}
