/**
 * Errors emitted by `@ar-agents/boletin-oficial` adapters and helpers.
 */

export type BoErrorCode =
  | "fetcher_not_configured"
  | "fetcher_unreachable"
  | "fetcher_unexpected_response"
  | "norma_not_found"
  | "invalid_query"
  | "subscription_invalid"
  | "unknown_error";

import { ArAgentsError } from "@ar-agents/core";

const RETRYABLE_CODES: Record<BoErrorCode, boolean> = {
  fetcher_not_configured: false,
  fetcher_unreachable: true,
  fetcher_unexpected_response: false,
  norma_not_found: false,
  invalid_query: false,
  subscription_invalid: false,
  unknown_error: false,
};

export class BoError extends ArAgentsError {
  override readonly code: BoErrorCode;
  readonly details?: unknown;

  constructor(code: BoErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES[code] ?? false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "BoError";
    this.code = code;
    this.details = details;
  }
}

export class FetcherNotConfiguredError extends BoError {
  constructor() {
    super(
      "fetcher_not_configured",
      "Boletín Oficial fetcher is not configured. To enable real BO lookups, pass a `LiveBoFetcher` (default endpoints) or your own `BoFetcher` to `boletinOficialTools()`. The default `UnconfiguredBoFetcher` returns `available: false` so tools are always safe to call.",
    );
    this.name = "FetcherNotConfiguredError";
  }
}
