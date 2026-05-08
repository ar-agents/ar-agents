// Helpers for building AcpResponse objects. Centralizes the
// header-naming + status-code mapping so the handlers stay declarative.

import type { AcpResponse } from "./types";
import type { AcpError } from "../schemas/error";
import {
  IDEMPOTENT_REPLAYED_HEADER,
  RETRY_AFTER_HEADER,
} from "../idempotency";

const JSON_CONTENT_TYPE = { "Content-Type": "application/json" };

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): AcpResponse {
  return {
    status,
    body,
    headers: { ...JSON_CONTENT_TYPE, ...extraHeaders },
  };
}

export function errorResponse(
  status: number,
  error: AcpError,
  extraHeaders: Record<string, string> = {},
): AcpResponse {
  return jsonResponse(status, error, extraHeaders);
}

export function notFound(error: AcpError): AcpResponse {
  return errorResponse(404, error);
}

export function badRequest(error: AcpError): AcpResponse {
  return errorResponse(400, error);
}

export function unprocessable(error: AcpError): AcpResponse {
  return errorResponse(422, error);
}

export function methodNotAllowed(error: AcpError): AcpResponse {
  return errorResponse(405, error);
}

export function inFlight(error: AcpError, retryAfterSeconds: number): AcpResponse {
  return errorResponse(409, error, {
    [RETRY_AFTER_HEADER]: String(retryAfterSeconds),
  });
}

export function replayedResponse(
  status: number,
  body: unknown,
  cachedHeaders: Record<string, string> = {},
): AcpResponse {
  return {
    status,
    body,
    headers: {
      ...JSON_CONTENT_TYPE,
      ...cachedHeaders,
      [IDEMPOTENT_REPLAYED_HEADER]: "true",
    },
  };
}

export function internalError(message = "Internal server error."): AcpResponse {
  return errorResponse(500, {
    type: "processing_error",
    code: "internal_error",
    message,
  });
}
