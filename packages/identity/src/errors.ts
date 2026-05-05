/**
 * Errors emitted by `@ar-agents/identity` adapters and helpers.
 *
 * The base class `IdentityError` carries a machine-readable `code` (suitable
 * for programmatic error handling by agents) and a human-readable `message`
 * (suitable for surfacing to end users). All specific subclasses extend it.
 */

export type IdentityErrorCode =
  | "afip_not_configured"
  | "afip_cert_invalid"
  | "afip_service_unavailable"
  | "afip_cuit_not_found"
  | "afip_rate_limited"
  | "afip_unknown_error";

export class IdentityError extends Error {
  constructor(
    public code: IdentityErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "IdentityError";
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
