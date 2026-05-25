/**
 * Error taxonomy for @ar-agents/tienda-nube.
 *
 * Extends `ArAgentsError` from `@ar-agents/core` so the family error
 * contract (code / retryable / context) is uniform.
 */

import { ArAgentsError } from "@ar-agents/core";

export class TiendaNubeError extends ArAgentsError {
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
    this.name = "TiendaNubeError";
  }
}

export class TiendaNubeValidationError extends TiendaNubeError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, {
      code: "validation_failed",
      retryable: false,
      context: { field },
    });
    this.name = "TiendaNubeValidationError";
    this.field = field;
  }
}

export class TiendaNubeAuthError extends TiendaNubeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "auth_failed",
      retryable: false,
      context: context ?? {},
    });
    this.name = "TiendaNubeAuthError";
  }
}

export class TiendaNubeApiError extends TiendaNubeError {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, context?: Record<string, unknown>) {
    const message =
      typeof body === "object" && body !== null && "description" in body
        ? String((body as { description?: unknown }).description ?? "Tienda Nube API error")
        : `Tienda Nube API returned HTTP ${status}`;
    super(message, {
      code: "api_error",
      retryable: status >= 500 || status === 429,
      context: { ...context, status },
    });
    this.name = "TiendaNubeApiError";
    this.status = status;
    this.body = body;
  }
}

export class TiendaNubeUnconfiguredError extends TiendaNubeError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `Tienda Nube adapter not configured for "${operation}" (${label}).`,
      { code: "unconfigured", retryable: false, context: { operation, label } },
    );
    this.name = "TiendaNubeUnconfiguredError";
    this.operation = operation;
  }
}
