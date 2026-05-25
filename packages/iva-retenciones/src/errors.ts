/**
 * Error taxonomy for @ar-agents/iva-retenciones.
 */

export class IvaRetentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IvaRetentionError";
  }
}

export class IvaRetentionValidationError extends IvaRetentionError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`);
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
    );
    this.name = "IvaRetentionUnconfiguredError";
    this.operation = operation;
  }
}
