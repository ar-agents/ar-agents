/**
 * Errors emitted by `@ar-agents/banking` adapters and helpers.
 *
 * The base class `BankingError` carries a machine-readable `code` (suitable
 * for programmatic error handling by agents) and a human-readable `message`
 * (suitable for surfacing to end users).
 */

export type BankingErrorCode =
  | "bcra_not_configured"
  | "bcra_cuit_not_found"
  | "bcra_service_unavailable"
  | "bcra_rate_limited"
  | "bcra_unknown_error";

export class BankingError extends Error {
  constructor(
    public code: BankingErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "BankingError";
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
