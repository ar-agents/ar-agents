/**
 * Errors emitted by `@ar-agents/banking` adapters and helpers.
 *
 * Extends `ArAgentsError` from `@ar-agents/core` so the family contract
 * (code / retryable / context) is uniform.
 */

import { ArAgentsError } from "@ar-agents/core";

export type BankingErrorCode =
  | "bcra_not_configured"
  | "bcra_cuit_not_found"
  | "bcra_service_unavailable"
  | "bcra_rate_limited"
  | "bcra_unknown_error"
  | "bcra_vars_not_configured"
  | "bcra_vars_unavailable";

const RETRYABLE_CODES: Record<BankingErrorCode, boolean> = {
  bcra_not_configured: false,
  bcra_cuit_not_found: false,
  bcra_service_unavailable: true,
  bcra_rate_limited: true,
  bcra_unknown_error: false,
  bcra_vars_not_configured: false,
  bcra_vars_unavailable: true,
};

export class BankingError extends ArAgentsError {
  override readonly code: BankingErrorCode;
  readonly details?: unknown;

  constructor(code: BankingErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES[code] ?? false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "BankingError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown when BCRA Central de Deudores lookup is requested but no adapter
 * is configured. Surface the message verbatim — it explains how to enable.
 */
export class BcraNotConfiguredError extends BankingError {
  constructor() {
    super(
      "bcra_not_configured",
      "BCRA Central de Deudores lookup is not configured. To enable, pass a `BcraDeudaAdapter` to `bankingTools()`. The default `BcraPublicApiAdapter` hits BCRA's public REST endpoint with no auth required: `bankingTools({ bcra: new BcraPublicApiAdapter() })`.",
    );
    this.name = "BcraNotConfiguredError";
  }
}

/**
 * Thrown when BCRA Principales Variables lookup is requested but no
 * adapter is configured. Surface the message verbatim.
 */
export class BcraVarsNotConfiguredError extends BankingError {
  constructor() {
    super(
      "bcra_vars_not_configured",
      "BCRA Principales Variables lookup is not configured. To enable, pass a `BcraVarsAdapter` to `bankingTools()`. The default `BcraVarsPublicApiAdapter` hits BCRA's public REST API (no auth required): `bankingTools({ bcraVars: new BcraVarsPublicApiAdapter() })`.",
    );
    this.name = "BcraVarsNotConfiguredError";
  }
}
