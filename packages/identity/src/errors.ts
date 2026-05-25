/**
 * Errors emitted by `@ar-agents/identity` adapters and helpers.
 *
 * The base class `IdentityError` extends `@ar-agents/core`'s `ArAgentsError`
 * so callers across the `@ar-agents/*` family can rely on a uniform shape:
 *
 *   - `code: string` — machine-readable identifier
 *   - `retryable: boolean` — whether to backoff + retry
 *   - `context: Record<string, unknown>` — structured ctx (legacy `details`
 *     is mirrored here under the `details` key)
 *
 * The legacy `details` field is kept for backward compatibility with
 * existing callers; new code should read `error.context` instead.
 */

import { ArAgentsError } from "@ar-agents/core";

export type IdentityErrorCode =
  | "afip_not_configured"
  | "afip_cert_invalid"
  | "afip_service_unavailable"
  | "afip_cuit_not_found"
  | "afip_rate_limited"
  | "afip_unknown_error";

/**
 * Per-code retryability hint. Used to populate `ArAgentsError.retryable`
 * so middleware (e.g. `withRetry` in `@ar-agents/core`) can decide
 * without parsing error messages.
 */
const RETRYABLE_CODES: Record<IdentityErrorCode, boolean> = {
  afip_not_configured: false,
  afip_cert_invalid: false,
  afip_service_unavailable: true,
  afip_cuit_not_found: false,
  afip_rate_limited: true,
  afip_unknown_error: false,
};

export class IdentityError extends ArAgentsError {
  /** Narrowed code for jurisdiction-specific switch logic. */
  override readonly code: IdentityErrorCode;
  /** Legacy: arbitrary extra info. New code SHOULD read `context` instead. */
  readonly details?: unknown;

  constructor(code: IdentityErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES[code] ?? false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "IdentityError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown when AFIP lookup is requested but the adapter has no cert/key
 * configured. Surface the message verbatim — it contains setup instructions.
 */
export class AfipNotConfiguredError extends IdentityError {
  constructor() {
    super(
      "afip_not_configured",
      "AFIP padron lookup is not configured. To enable, set AFIP_CERT_PATH + AFIP_KEY_PATH env vars and pass a real `AfipPadronAdapter` to `identityTools()`. See the lib README for the full cert setup walkthrough.",
    );
    this.name = "AfipNotConfiguredError";
  }
}

/**
 * Thrown when AFIP returns an explicit "CUIT not found" response. Distinct
 * from `available: false` cases like "service down" — the lookup ran, AFIP
 * just doesn't know about that taxpayer.
 */
export class AfipCuitNotFoundError extends IdentityError {
  constructor(public cuit: string) {
    super(
      "afip_cuit_not_found",
      `AFIP no tiene registro del CUIT ${cuit}. Es posible que sea un CUIT válido en formato pero no inscripto, o que haya sido dado de baja.`,
    );
    this.name = "AfipCuitNotFoundError";
  }
}
