/**
 * Error taxonomy for @ar-agents/suss.
 */

export class SussError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;
  constructor(
    message: string,
    init: {
      code: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, init.cause !== undefined ? ({ cause: init.cause } as ErrorOptions) : undefined);
    this.name = "SussError";
    this.code = init.code;
    this.retryable = init.retryable ?? false;
    this.context = init.context ?? {};
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
