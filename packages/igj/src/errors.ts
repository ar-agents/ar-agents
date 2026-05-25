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

import { ArAgentsError } from "@ar-agents/core";

const RETRYABLE_CODES: Record<IgjErrorCode, boolean> = {
  fetcher_not_configured: false,
  ckan_unreachable: true,
  ckan_invalid_response: false,
  entity_not_found: false,
  invalid_query: false,
  unknown_error: false,
};

export class IgjError extends ArAgentsError {
  override readonly code: IgjErrorCode;
  readonly details?: unknown;

  constructor(code: IgjErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES[code] ?? false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "IgjError";
    this.code = code;
    this.details = details;
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
