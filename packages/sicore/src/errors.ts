/**
 * Error taxonomy for @ar-agents/sicore.
 *
 * Agents should distinguish:
 *   - validation errors (bad input, do NOT retry)
 *   - rate-table errors (no entry for category/status, surface to operator)
 *   - unconfigured errors (adapter not wired, surface to operator)
 *
 * `SicoreError` extends `ArAgentsError` from `@ar-agents/core` so the
 * `@ar-agents/*` family shares one error contract.
 */

import { ArAgentsError } from "@ar-agents/core";

export class SicoreError extends ArAgentsError {
  constructor(message: string, code = "sicore_error", context: Record<string, unknown> = {}) {
    super(message, { code, retryable: false, context });
    this.name = "SicoreError";
  }
}

/** Bad input (e.g. negative payment, invalid CUIT). Do NOT retry. */
export class SicoreValidationError extends SicoreError {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`, "validation_failed", { field });
    this.name = "SicoreValidationError";
    this.field = field;
  }
}

/** No rate-table entry for the (category, status) pair the caller asked
 * for. Usually means the table is incomplete for the supplier's
 * situation. */
export class SicoreRateNotFoundError extends SicoreError {
  readonly category: string;
  readonly status: string;
  constructor(category: string, status: string) {
    super(
      `No SICORE rate-table entry for category="${category}" status="${status}"`,
      "rate_not_found",
      { category, status },
    );
    this.name = "SicoreRateNotFoundError";
    this.category = category;
    this.status = status;
  }
}

/** Adapter not wired (no submission target). Surface to the operator. */
export class SicoreUnconfiguredError extends SicoreError {
  readonly operation: string;
  constructor(operation: string, label = "unconfigured") {
    super(
      `SICORE adapter not configured for "${operation}" (${label}). Wire an adapter (or call the pure calc primitives directly).`,
      "unconfigured",
      { operation, label },
    );
    this.name = "SicoreUnconfiguredError";
    this.operation = operation;
  }
}
