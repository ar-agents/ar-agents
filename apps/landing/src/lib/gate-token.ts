/**
 * Per-society GATE token (the deployed society's runtime credential).
 *
 * `/api/approvals/gate` is how a deployed, autonomous society asks "is this
 * high-stakes act already approved?" Rejecting unregistered societies (the
 * #4-partial fix) stops poisoning of NONEXISTENT queues, but a stranger who
 * learns a real society's sessionId (it appears in public audit links) could
 * still flood THAT society's pending queue with bogus requests, burying a real
 * malicious approval under fatigue.
 *
 * This token closes that: minted at constitution, baked into the deployed
 * society's env as SOCIETY_GATE_TOKEN, and presented on every gate call. Only the
 * society itself holds it, so only the society can enqueue against its own queue.
 *
 * Thin wrapper over the generic capability-token mechanism (kind "gate", prefix
 * `sgt_`). Same write-once + hash-at-rest + constant-time-verify guarantees as
 * the admin token.
 */

import {
  hasCapabilityToken,
  mintCapabilityToken,
  verifyCapabilityToken,
} from "./capability-token";

const KIND = "gate";
const PREFIX = "sgt";

/** Mint the society's gate token (write-once); returns plaintext once, else null. */
export function mintGateToken(sessionId: string): Promise<string | null> {
  return mintCapabilityToken(KIND, PREFIX, sessionId);
}

/** Whether a society has a gate token (constituted after the #4-full upgrade). */
export function hasGateToken(sessionId: string): Promise<boolean> {
  return hasCapabilityToken(KIND, sessionId);
}

/** Verify a presented gate token against the stored hash, in constant time. */
export function verifyGateToken(sessionId: string, token: string): Promise<boolean> {
  return verifyCapabilityToken(KIND, sessionId, token);
}
