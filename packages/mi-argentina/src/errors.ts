/**
 * Errors emitted by `@ar-agents/mi-argentina`.
 *
 * Stable, machine-readable `code` values are part of the public API — agents
 * and end-user code can switch on them. Human-readable `message` carries the
 * actionable explanation; surface verbatim when reporting back to users.
 */

export type MiArgentinaErrorCode =
  | "config_missing"
  | "discovery_failed"
  | "state_missing"
  | "state_mismatch"
  | "code_exchange_failed"
  | "id_token_invalid"
  | "id_token_signature_invalid"
  | "id_token_expired"
  | "id_token_audience_mismatch"
  | "id_token_issuer_mismatch"
  | "userinfo_failed"
  | "refresh_failed"
  | "network_error"
  | "unknown_error";

export class MiArgentinaError extends Error {
  constructor(
    public code: MiArgentinaErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "MiArgentinaError";
  }
}

export class ConfigMissingError extends MiArgentinaError {
  constructor(missing: string[]) {
    super(
      "config_missing",
      `Mi Argentina client is not configured. Missing: ${missing.join(", ")}. Register a client at https://argob.github.io/mi-argentina-docs/ and set the env vars MI_ARGENTINA_CLIENT_ID, MI_ARGENTINA_CLIENT_SECRET, MI_ARGENTINA_REDIRECT_URI.`,
    );
    this.name = "ConfigMissingError";
  }
}

export class StateMismatchError extends MiArgentinaError {
  constructor() {
    super(
      "state_mismatch",
      "OAuth state mismatch. The `state` parameter returned by Mi Argentina does not match what was generated for this session. This usually means the callback was hit on a different browser session, the cookie/state-store entry expired, or the request is forged. ABORT the login flow and ask the user to try again.",
    );
    this.name = "StateMismatchError";
  }
}

export class IdTokenInvalidError extends MiArgentinaError {
  constructor(reason: string) {
    super(
      "id_token_invalid",
      `Mi Argentina ID token is invalid: ${reason}. Treat the user as UNAUTHENTICATED — do NOT trust any claim. The token will not be re-issued automatically; the user must restart the login flow.`,
    );
    this.name = "IdTokenInvalidError";
  }
}
