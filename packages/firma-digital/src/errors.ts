/**
 * Errors emitted by `@ar-agents/firma-digital`.
 */

export type FirmaDigitalErrorCode =
  | "invalid_pem"
  | "invalid_der"
  | "cert_parse_failed"
  | "cms_parse_failed"
  | "no_signers"
  | "signature_verification_failed"
  | "unsupported_algorithm"
  | "unknown_error";

export class FirmaDigitalError extends Error {
  constructor(
    public code: FirmaDigitalErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "FirmaDigitalError";
  }
}
