/**
 * Errors emitted by `@ar-agents/constancia` adapters and helpers.
 */

export type ConstanciaErrorCode =
  | "fetcher_not_configured"
  | "fetcher_unreachable"
  | "fetcher_unexpected_response"
  | "cuit_not_found"
  | "invalid_cuit"
  | "captcha_blocked"
  | "unknown_error";

export class ConstanciaError extends Error {
  constructor(
    public code: ConstanciaErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ConstanciaError";
  }
}

export class FetcherNotConfiguredError extends ConstanciaError {
  constructor() {
    super(
      "fetcher_not_configured",
      "Constancia fetcher is not configured. This is a BROWSER-BACKED tool — it drives the public ARCA Constancia de Inscripción web form. To enable: pass a `BrowseSkillConstanciaFetcher` wired to a `browse` runtime (see the `afip-constancia` skill on browserbase/skills) or your own `ConstanciaFetcher` to `constanciaTools()`. The default `UnconfiguredConstanciaFetcher` returns `available: false` so tools are always safe to call. If you only need the tax DATA (not the PDF) and have an AFIP X.509 cert, prefer `@ar-agents/identity` `lookup_cuit_afip` — it is faster and needs no browser.",
    );
    this.name = "FetcherNotConfiguredError";
  }
}
