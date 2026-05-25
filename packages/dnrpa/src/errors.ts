/**
 * Error taxonomy for @ar-agents/dnrpa.
 *
 * Extends ArAgentsError so middleware (withRetry, withMetrics, …) can
 * switch on code/retryable/context uniformly with the rest of the
 * @ar-agents/* family.
 */

import { ArAgentsError } from "@ar-agents/core";

export class DnrpaError extends ArAgentsError {
  constructor(
    message: string,
    code = "dnrpa_error",
    context: Record<string, unknown> = {},
  ) {
    super(message, { code, retryable: false, context });
    this.name = "DnrpaError";
  }
}

export class DnrpaValidationError extends DnrpaError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "DnrpaValidationError";
    this.field = field;
  }
}

export class DnrpaUnconfiguredError extends DnrpaError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `DNRPA adapter not configured for "${operation}" (${label}). DNRPA does not expose a free public REST API; wire a BrowserDnrpaAdapter against a browse runtime (e.g. browserbase/browse.sh) that drives the public consulta-de-dominio form, or supply your own adapter.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "DnrpaUnconfiguredError";
    this.operation = operation;
  }
}

export class DnrpaCaptchaError extends DnrpaError {
  constructor() {
    super(
      "DNRPA blocked the request with a captcha. The browser-backed adapter must surface the challenge to a human; automating the captcha solve is not supported.",
      "captcha_blocked",
    );
    this.name = "DnrpaCaptchaError";
  }
}
