/**
 * Error taxonomy for @ar-agents/iva-retenciones.
 *
 * `IvaRetentionError` extends `ArAgentsError` from `@ar-agents/core`
 * so the family shares one error contract (code / retryable / context).
 */

import { ArAgentsError } from "@ar-agents/core";

export class IvaRetentionError extends ArAgentsError {
  constructor(
    message: string,
    code = "iva_retention_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "IvaRetentionError";
  }
}

export class IvaRetentionValidationError extends IvaRetentionError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "IvaRetentionValidationError";
    this.field = field;
  }
}

export class IvaRetentionRateNotFoundError extends IvaRetentionError {
  readonly regime: string;
  readonly operationType: string;
  readonly supplierStatus: string;
  constructor(regime: string, operationType: string, supplierStatus: string) {
    super(
      `No IVA retention rate-table entry for regime="${regime}" operationType="${operationType}" supplierStatus="${supplierStatus}"`,
      "rate_not_found",
      { regime, operationType, supplierStatus },
    );
    this.name = "IvaRetentionRateNotFoundError";
    this.regime = regime;
    this.operationType = operationType;
    this.supplierStatus = supplierStatus;
  }
}

export class IvaRetentionUnconfiguredError extends IvaRetentionError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `IVA retention adapter not configured for "${operation}" (${label})`,
      "unconfigured",
      { operation, label },
    );
    this.name = "IvaRetentionUnconfiguredError";
    this.operation = operation;
  }
}
