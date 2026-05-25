/**
 * Error taxonomy for @ar-agents/suss.
 *
 * Extends `ArAgentsError` from `@ar-agents/core` so the family error
 * contract (code / retryable / context) is uniform.
 */

import { ArAgentsError } from "@ar-agents/core";

export class SussError extends ArAgentsError {
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
    this.name = "SussError";
  }
}

export class SussValidationError extends SussError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, {
      code: "validation_failed",
      retryable: false,
      context: { field },
    });
    this.name = "SussValidationError";
    this.field = field;
  }
}

export class SussUnconfiguredError extends SussError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(`SUSS adapter not configured for "${operation}" (${label}).`, {
      code: "unconfigured",
      retryable: false,
      context: { operation, label },
    });
    this.name = "SussUnconfiguredError";
    this.operation = operation;
  }
}
