/**
 * Per-society administrator capability token (art. 102 administrator surface).
 *
 * The administrator authorizes suspend / resume / approve / deny by PRESENTING
 * this token, not by knowing a CUIT (a CUIT is semi-public, so "knows the admin
 * CUIT" must never be authentication). Minted WRITE-ONCE at constitution,
 * returned to the human exactly once, stored only as a SHA-256 hash, verified in
 * constant time. The CUIT stays in the signed record as the *named* administrator;
 * this token is the *proof*.
 *
 * Thin wrapper over the generic capability-token mechanism (kind "admin",
 * prefix `sat_`). The storage key shape is unchanged, so tokens minted before
 * this refactor keep verifying.
 */

import {
  hasCapabilityToken,
  mintCapabilityToken,
  verifyCapabilityToken,
} from "./capability-token";

const KIND = "admin";
const PREFIX = "sat";

/** Mint the society's admin token (write-once); returns plaintext once, else null. */
export function mintAdminToken(sessionId: string): Promise<string | null> {
  return mintCapabilityToken(KIND, PREFIX, sessionId);
}

/** Whether a society has an admin token (i.e. was constituted on the v2 path). */
export function hasAdminToken(sessionId: string): Promise<boolean> {
  return hasCapabilityToken(KIND, sessionId);
}

/** Verify a presented admin token against the stored hash, in constant time. */
export function verifyAdminToken(sessionId: string, token: string): Promise<boolean> {
  return verifyCapabilityToken(KIND, sessionId, token);
}
