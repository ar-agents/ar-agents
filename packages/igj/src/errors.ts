/**
 * Errors emitted by `@ar-agents/igj`.
 */

export type IgjErrorCode =
  | "fetcher_not_configured"
  | "ckan_unreachable"
  | "ckan_invalid_response"
  | "entity_not_found"
  | "invalid_query"
  | "unknown_error";

export class IgjError extends Error {
  constructor(
    public code: IgjErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "IgjError";
  }
}

export class FetcherNotConfiguredError extends IgjError {
  constructor() {
    super(
      "fetcher_not_configured",
      "IGJ fetcher is not configured. To enable real CKAN lookups against datos.jus.gob.ar (no auth required, public endpoint), pass `new LiveCkanFetcher()` to `igjTools()`. The default `UnconfiguredIgjFetcher` returns empty results so tools are always safe to call.",
    );
    this.name = "FetcherNotConfiguredError";
  }
}
