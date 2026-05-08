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

export class BoError extends Error {
  constructor(
    public code: BoErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "BoError";
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
