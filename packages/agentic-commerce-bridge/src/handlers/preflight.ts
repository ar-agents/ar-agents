// Preflight checks shared by all 5 ACP endpoints — version negotiation +
// idempotency-key validation. Returns the parsed prerequisites or an early
// `AcpResponse` to short-circuit.

import type { AcpRequest, AcpResponse, FacilitatorOptions } from "./types";
import { header } from "./types";
import { negotiateVersion } from "../version";
import { validateIdempotencyKey, IDEMPOTENCY_HEADER } from "../idempotency";
import {
  badRequest,
  errorResponse,
  inFlight,
  unprocessable,
  replayedResponse,
} from "./responses";
import { LATEST_API_VERSION } from "../schemas/common";
import {
  idempotencyConflict,
  idempotencyInFlight as idempotencyInFlightError,
} from "../schemas/error";

export interface Prereqs {
  apiVersion: string;
  idempotencyKey: string;
  bodyHash: string;
}

/**
 * Run version + idempotency preflight on POST endpoints. GETs skip
 * idempotency.
 *
 * On success: caller proceeds with the operation, then calls
 * `state.complete(scope, key, response)` to cache the result.
 *
 * On replay: this function returns the cached response — caller exits.
 */
export async function preflightPost(
  req: AcpRequest,
  scope: string,
  options: FacilitatorOptions,
): Promise<{ ok: Prereqs } | { response: AcpResponse }> {
  // 1. API version negotiation.
  const versionHeader = header(req.headers, "API-Version");
  const versionResult = negotiateVersion(versionHeader, options.version);
  if ("code" in versionResult) {
    return { response: badRequest(versionResult) };
  }

  // 2. Idempotency-Key validation.
  const idemHeader = header(req.headers, IDEMPOTENCY_HEADER);
  const idemResult = await validateIdempotencyKey(idemHeader, req.rawBody);
  if ("code" in idemResult) {
    return { response: badRequest(idemResult) };
  }

  // 3. Try to claim the idempotency slot.
  const claim = await options.state.tryClaim(
    scope,
    idemResult.key,
    idemResult.bodyHash,
  );

  switch (claim.kind) {
    case "claimed":
      return {
        ok: {
          apiVersion: versionResult.version,
          idempotencyKey: idemResult.key,
          bodyHash: idemResult.bodyHash,
        },
      };
    case "replay":
      return {
        response: replayedResponse(claim.status, claim.body, claim.headers),
      };
    case "in_flight":
      return {
        response: inFlight(idempotencyInFlightError(), claim.retryAfterSeconds),
      };
    case "conflict":
      return { response: unprocessable(idempotencyConflict()) };
  }
}

/**
 * GET preflight — only version negotiation. No idempotency.
 */
export function preflightGet(
  req: AcpRequest,
  options: FacilitatorOptions,
): { ok: { apiVersion: string } } | { response: AcpResponse } {
  const versionHeader = header(req.headers, "API-Version");
  // GET allows missing version, falling back to latest.
  const versionResult = negotiateVersion(versionHeader, {
    ...options.version,
    defaultVersion: options.version?.defaultVersion ?? LATEST_API_VERSION,
  });
  if ("code" in versionResult) {
    return { response: badRequest(versionResult) };
  }
  return { ok: { apiVersion: versionResult.version } };
}

export { errorResponse };
