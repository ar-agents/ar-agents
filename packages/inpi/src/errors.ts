import { ArAgentsError } from "@ar-agents/core";

export class InpiError extends ArAgentsError {
  constructor(
    message: string,
    code = "inpi_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "InpiError";
  }
}

export class InpiValidationError extends InpiError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "InpiValidationError";
    this.field = field;
  }
}

export class InpiUnconfiguredError extends InpiError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `INPI adapter not configured for "${operation}" (${label}). Wire HttpInpiAdapter against the public INPI search portal or an InMemoryInpiAdapter for tests.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "InpiUnconfiguredError";
    this.operation = operation;
  }
}

export class InpiApiError extends InpiError {
  readonly status: number;
  constructor(status: number, body: unknown) {
    super(`INPI API returned HTTP ${status}`, "api_error", { status, body });
    this.name = "InpiApiError";
    this.status = status;
    (this as { retryable: boolean }).retryable = status >= 500 || status === 429;
  }
}
