/**
 * Error taxonomy for @ar-agents/wscdc.
 *
 * Agents should distinguish:
 *   - validation errors before the call (bad input, do NOT retry)
 *   - AFIP protocol errors (network / HTTP / SOAP fault, may retry
 *     with backoff)
 *   - "not approved" outcomes — NOT thrown as errors. A ConstatarResult
 *     with resultado="N" is a valid response that says "this invoice
 *     is forged or has wrong values"; the caller decides what to do.
 *
 * `WscdcError` extends `ArAgentsError` from `@ar-agents/core` so the
 * family contract (code / retryable / context) is uniform across the
 * `@ar-agents/*` packages.
 */

import { ArAgentsError } from "@ar-agents/core";

export class WscdcError extends ArAgentsError {
  constructor(message: string, code = "wscdc_error", context: Record<string, unknown> = {}) {
    super(message, { code, retryable: false, context });
    this.name = "WscdcError";
  }
}

/** Bad input passed to the adapter (CUIT shape, date format, etc.). Do
 * NOT retry. */
export class WscdcValidationError extends WscdcError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "WscdcValidationError";
    this.field = field;
  }
}

/**
 * Network / HTTP / SOAP-fault errors talking to AFIP. The caller may
 * retry these with exponential backoff. Unlike `WscdcValidationError`,
 * these do NOT carry a "bad request" connotation.
 */
export class WscdcProtocolError extends WscdcError {
  readonly status: number | null;
  readonly faultCode: string | null;
  constructor(
    message: string,
    opts: { status?: number | null; faultCode?: string | null } = {},
  ) {
    super(message, "protocol_error", {
      status: opts.status ?? null,
      faultCode: opts.faultCode ?? null,
    });
    this.name = "WscdcProtocolError";
    this.status = opts.status ?? null;
    this.faultCode = opts.faultCode ?? null;
    // Network/HTTP/SOAP issues are generally retryable.
    (this as { retryable: boolean }).retryable = true;
  }
}

/** Adapter not wired. Surface to the operator. */
export class WscdcUnconfiguredError extends WscdcError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `WSCDC adapter not configured for "${operation}" (${label}). Wire HttpWscdcAdapter with a valid WSAA AccessTicket.`,
      "unconfigured",
      { operation, label },
    );
    this.name = "WscdcUnconfiguredError";
    this.operation = operation;
  }
}
