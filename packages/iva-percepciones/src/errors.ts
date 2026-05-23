/**
 * Error taxonomy for @ar-agents/iva-percepciones.
 */

export class IvaPerceptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IvaPerceptionError";
  }
}

export class IvaPerceptionValidationError extends IvaPerceptionError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`);
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
    );
    this.name = "IvaPerceptionUnconfiguredError";
    this.operation = operation;
  }
}
