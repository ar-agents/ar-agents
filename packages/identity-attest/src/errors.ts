/**
 * Typed errors for `@ar-agents/identity-attest`. All extend
 * `IdentityAttestError` so callers can do `if (err instanceof IdentityAttestError)`.
 */
import { ArAgentsError } from "@ar-agents/core";

export class IdentityAttestError extends ArAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "identity_attest_error",
      retryable: false,
      context: {},
      cause,
    });
    this.name = "IdentityAttestError";
  }
}

/** Configuration error: signing secret missing, adapter not registered, etc. */
export class IdentityAttestConfigError extends IdentityAttestError {
  constructor(message: string) {
    super(message);
    this.name = "IdentityAttestConfigError";
  }
}

/** The verification request was not found in the store. */
export class VerificationRequestNotFoundError extends IdentityAttestError {
  constructor(requestId: string) {
    super(`Verification request not found: ${requestId}`);
    this.name = "VerificationRequestNotFoundError";
  }
}

/** The user submitted the wrong OTP code. */
export class InvalidOtpCodeError extends IdentityAttestError {
  constructor(public readonly attemptsRemaining: number) {
    super(
      `Invalid OTP code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`,
    );
    this.name = "InvalidOtpCodeError";
  }
}

/** The verification request expired before the user completed it. */
export class VerificationExpiredError extends IdentityAttestError {
  constructor(requestId: string) {
    super(`Verification request expired: ${requestId}`);
    this.name = "VerificationExpiredError";
  }
}

/** The user exceeded the max attempts. Request is now `failed`. */
export class TooManyAttemptsError extends IdentityAttestError {
  constructor(requestId: string) {
    super(`Too many failed attempts on verification ${requestId}. Request is now in 'failed' state — start a new one.`);
    this.name = "TooManyAttemptsError";
  }
}

/** Signature on the attestation doesn't match — possibly tampered with. */
export class InvalidAttestationSignatureError extends IdentityAttestError {
  constructor() {
    super("Attestation signature does not match — the attestation may have been tampered with.");
    this.name = "InvalidAttestationSignatureError";
  }
}

/**
 * The channel proved control of a DIFFERENT subject than the one the request
 * was created for (the adapter returned a `verifiedSubject` that does not match
 * `request.subject`). Fail closed — a valid provider token for one identity
 * must never mint an attestation for another. The request is marked `failed`.
 */
export class SubjectMismatchError extends IdentityAttestError {
  constructor(requestId: string) {
    super(
      `Verification ${requestId}: the channel proved control of a different subject than requested. Request is now in 'failed' state.`,
    );
    this.name = "SubjectMismatchError";
  }
}

/** Adapter-level errors (provider returned 4xx, transport failed, etc.). */
export class AttestAdapterError extends IdentityAttestError {
  constructor(
    public readonly adapter: string,
    message: string,
    cause?: unknown,
  ) {
    super(`[${adapter}] ${message}`, cause);
    this.name = "AttestAdapterError";
  }
}
