import { ArAgentsError } from "@ar-agents/core";

export class CnvError extends ArAgentsError {
  constructor(
    message: string,
    code = "cnv_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "CnvError";
  }
}

export class CnvValidationError extends CnvError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "CnvValidationError";
    this.field = field;
  }
}

export class CnvUnconfiguredError extends CnvError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `CNV adapter not configured for "${operation}" (${label}). Wire HttpCnvAdapter against the AIF public endpoint or an InMemoryCnvAdapter for tests.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "CnvUnconfiguredError";
    this.operation = operation;
  }
}

export class CnvApiError extends CnvError {
  readonly status: number;
  constructor(status: number, body: unknown) {
    super(`CNV API returned HTTP ${status}`, "api_error", { status, body });
    this.name = "CnvApiError";
    this.status = status;
    (this as { retryable: boolean }).retryable = status >= 500 || status === 429;
  }
}
