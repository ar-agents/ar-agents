import { ArAgentsError } from "@ar-agents/core";

export class AnsesError extends ArAgentsError {
  constructor(
    message: string,
    code = "anses_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "AnsesError";
  }
}

export class AnsesValidationError extends AnsesError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "AnsesValidationError";
    this.field = field;
  }
}

export class AnsesUnconfiguredError extends AnsesError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `ANSES adapter not configured for "${operation}" (${label}). Wire HttpAnsesAdapter against the Mi ANSES API (requires OAuth client credentials) or InMemoryAnsesAdapter for tests.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "AnsesUnconfiguredError";
    this.operation = operation;
  }
}

export class AnsesApiError extends AnsesError {
  readonly status: number;
  constructor(status: number, body: unknown) {
    super(`ANSES API returned HTTP ${status}`, "api_error", { status, body });
    this.name = "AnsesApiError";
    this.status = status;
    (this as { retryable: boolean }).retryable = status >= 500 || status === 429;
  }
}
