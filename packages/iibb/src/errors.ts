export class IibbError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "IibbError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class IibbUnconfiguredError extends IibbError {
  constructor(operation: string, jurisdiction?: string) {
    super(
      "unconfigured",
      `IIBB adapter is not configured${
        jurisdiction ? ` for jurisdiction "${jurisdiction}"` : ""
      }. Operation "${operation}" requires a real adapter (e.g. AgipAdapter, ArbaAdapter, or ConvenioMultilateralAdapter) wired with credentials.`,
    );
    this.name = "IibbUnconfiguredError";
  }
}

export class IibbValidationError extends IibbError {
  constructor(field: string, message: string) {
    super("validation", `Invalid "${field}": ${message}`);
    this.name = "IibbValidationError";
  }
}

export class IibbRateNotFoundError extends IibbError {
  constructor(jurisdiction: string, activityCode: string) {
    super(
      "rate_not_found",
      `No alicuota found for activity "${activityCode}" in jurisdiction "${jurisdiction}". Provide an overrideRate or load a rate-book before calculating.`,
    );
    this.name = "IibbRateNotFoundError";
  }
}
