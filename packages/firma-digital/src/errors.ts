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

import { ArAgentsError } from "@ar-agents/core";

export class FirmaDigitalError extends ArAgentsError {
  override readonly code: FirmaDigitalErrorCode;
  readonly details?: unknown;

  constructor(code: FirmaDigitalErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "FirmaDigitalError";
    this.code = code;
    this.details = details;
  }
}
