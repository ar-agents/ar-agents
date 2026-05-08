import { z } from "zod";

// ACP `Error` — terminal errors returned at HTTP 4xx/5xx (no valid session
// could be returned). Distinct from `MessageError`, which is a 200-with-warning
// shape (see `messages.ts`).
//
// The spec lists an open enum of `code` values; we model the well-known ones
// and accept unknowns via passthrough.
export const ErrorType = z.enum([
  "invalid_request",
  "request_not_idempotent",
  "processing_error",
  "service_unavailable",
]);
export type ErrorType = z.infer<typeof ErrorType>;

export const ErrorCode = z.enum([
  // idempotency
  "idempotency_key_required",
  "idempotency_in_flight",
  "idempotency_conflict",
  // version
  "missing_api_version",
  "unsupported_api_version",
  // auth
  "missing_authorization",
  "invalid_authorization",
  // payment
  "requires_3ds",
  "requires_authentication",
  "payment_declined",
  "card_expired",
  "insufficient_funds",
  "invalid_payment_token",
  "expired_payment_token",
  // session
  "session_not_found",
  "session_expired",
  "session_completed",
  "session_canceled",
  "session_not_cancelable",
  "session_not_completable",
  "session_in_progress",
  // capability
  "unsupported_capability",
  "unsupported_currency",
  "unsupported_locale",
  // generic
  "validation_failed",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const AcpError = z.object({
  type: z.union([ErrorType, z.string()]),
  code: z.union([ErrorCode, z.string()]),
  message: z.string(),
  param: z.string().optional(),
  // Optional list of supported versions when `code === "unsupported_api_version"`.
  supported_versions: z.array(z.string()).optional(),
  // Free-form details.
  details: z.record(z.string(), z.unknown()).optional(),
});
export type AcpError = z.infer<typeof AcpError>;

// Convenience constructors for the most common errors.
export function idempotencyKeyRequired(): AcpError {
  return {
    type: "invalid_request",
    code: "idempotency_key_required",
    message: "Idempotency-Key header is required on POST requests.",
  };
}

export function idempotencyInFlight(retryAfterSeconds = 5): AcpError {
  return {
    type: "invalid_request",
    code: "idempotency_in_flight",
    message: "A request with this Idempotency-Key is currently being processed.",
    details: { retry_after_seconds: retryAfterSeconds },
  };
}

export function idempotencyConflict(): AcpError {
  return {
    type: "invalid_request",
    code: "idempotency_conflict",
    message: "Idempotency-Key has already been used with a different request body.",
  };
}

export function missingApiVersion(): AcpError {
  return {
    type: "invalid_request",
    code: "missing_api_version",
    message: "API-Version header is required.",
  };
}

export function unsupportedApiVersion(
  requested: string,
  supported: readonly string[],
): AcpError {
  return {
    type: "invalid_request",
    code: "unsupported_api_version",
    message: `API version '${requested}' is not supported.`,
    supported_versions: [...supported],
  };
}

export function sessionNotFound(id: string): AcpError {
  return {
    type: "invalid_request",
    code: "session_not_found",
    message: `Checkout session '${id}' not found.`,
  };
}

export function sessionNotCancelable(id: string, status: string): AcpError {
  return {
    type: "invalid_request",
    code: "session_not_cancelable",
    message: `Checkout session '${id}' cannot be canceled (status: ${status}).`,
  };
}

export function validationFailed(message: string, param?: string): AcpError {
  const error: AcpError = {
    type: "invalid_request",
    code: "validation_failed",
    message,
  };
  if (param !== undefined) error.param = param;
  return error;
}
