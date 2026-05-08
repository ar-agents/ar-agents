/**
 * Error hierarchy for `@ar-agents/gde-tad`.
 */

/** Base class — all errors thrown by this package extend this. */
export class GdeTadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GdeTadError";
  }
}

/** Adapter rejected for missing config (cert, token, env). */
export class GdeTadNotConfiguredError extends GdeTadError {
  constructor(detail: string) {
    super(`@ar-agents/gde-tad is not configured: ${detail}`);
    this.name = "GdeTadNotConfiguredError";
  }
}

/** Authentication / authorization failure against TAD or GDE. */
export class GdeTadAuthError extends GdeTadError {
  constructor(detail: string) {
    super(`TAD/GDE auth failed: ${detail}`);
    this.name = "GdeTadAuthError";
  }
}

/** Pre-flight validation rejected the payload. */
export class GdeTadValidationError extends GdeTadError {
  readonly findings: Array<{ code: string; field: string; message: string }>;
  constructor(
    detail: string,
    findings: Array<{ code: string; field: string; message: string }>,
  ) {
    super(detail);
    this.findings = findings;
    this.name = "GdeTadValidationError";
  }
}
