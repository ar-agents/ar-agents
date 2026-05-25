/**
 * Error taxonomy for @ar-agents/iva-percepciones.
 *
 * `IvaPerceptionError` extends `ArAgentsError` from `@ar-agents/core`
 * so the family shares one error contract (code / retryable / context).
 */

import { ArAgentsError } from "@ar-agents/core";

export class IvaPerceptionError extends ArAgentsError {
  constructor(
    message: string,
    code = "iva_perception_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "IvaPerceptionError";
  }
}

export class IvaPerceptionValidationError extends IvaPerceptionError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "IvaPerceptionValidationError";
    this.field = field;
  }
}

export class IvaPerceptionRateNotFoundError extends IvaPerceptionError {
  readonly regime: string;
  readonly buyerCondition: string;
  constructor(regime: string, buyerCondition: string) {
    super(
      `No IVA perception rate-table entry for regime="${regime}" buyerCondition="${buyerCondition}"`,
      "rate_not_found",
      { regime, buyerCondition },
    );
    this.name = "IvaPerceptionRateNotFoundError";
    this.regime = regime;
    this.buyerCondition = buyerCondition;
  }
}

export class IvaPerceptionUnconfiguredError extends IvaPerceptionError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `IVA perception adapter not configured for "${operation}" (${label})`,
      "unconfigured",
      { operation, label },
    );
    this.name = "IvaPerceptionUnconfiguredError";
    this.operation = operation;
  }
}
