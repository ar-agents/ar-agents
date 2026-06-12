/**
 * Error taxonomy for @ar-agents/fecred. Mirrors @ar-agents/wscdc:
 *   - validation errors before the call (bad input, do NOT retry)
 *   - AFIP protocol errors (network / HTTP / SOAP fault, may retry)
 *   - business outcomes (resultado="R", arrayErrores populated) are
 *     NOT thrown. They come back inside the result object and the
 *     caller decides.
 */

import { ArAgentsError } from "@ar-agents/core";

export class FecredError extends ArAgentsError {
  constructor(message: string, code = "fecred_error", context: Record<string, unknown> = {}) {
    super(message, { code, retryable: false, context });
    this.name = "FecredError";
  }
}

/** Bad input passed to the adapter (CUIT shape, date format, etc.).
 * Do NOT retry. */
export class FecredValidationError extends FecredError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "FecredValidationError";
    this.field = field;
  }
}

/** Network / HTTP / SOAP-fault errors talking to AFIP. Retryable with
 * backoff. */
export class FecredProtocolError extends FecredError {
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
    this.name = "FecredProtocolError";
    this.status = opts.status ?? null;
    this.faultCode = opts.faultCode ?? null;
    (this as { retryable: boolean }).retryable = true;
  }
}

/** Adapter not wired. Surface to the operator. */
export class FecredUnconfiguredError extends FecredError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `WSFECred adapter not configured for "${operation}" (${label}). Wire HttpFecredAdapter with a valid WSAA AccessTicket for service "wsfecred".`,
      "unconfigured",
      { operation, label },
    );
    this.name = "FecredUnconfiguredError";
    this.operation = operation;
  }
}
