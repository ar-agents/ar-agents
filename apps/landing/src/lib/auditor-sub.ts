/**
 * Shared shapes for the El Auditor subscribe → activate money loop.
 *
 * SECURITY (DeepSec deferred HIGH, cross-tenant-id): the audit session an
 * entitlement (API key) binds to must be SERVER-AUTHORITATIVE, never re-derived
 * from a caller-chosen value at activate time. So:
 *
 *  - `subscribe` resolves the session up front: a FRESH random session (and
 *    mints a write-once {@link AUDITOR_SESSION_KIND} capability token, returned
 *    once) UNLESS the caller proves control of an existing session by presenting
 *    that token. It then records a pending row keyed to the MP preapproval id.
 *  - `activate` looks the session up from that pending row by preapproval id —
 *    it does NOT trust MP's `external_reference`. No caller input picks the
 *    session an entitlement lands on, so an attacker can't bind a paid key (or
 *    inject signed entries) into a victim's public session.
 */

/** KV key: preapproval id → the session/payer/plan bound at subscribe time. */
export const PENDING_KEY_PREFIX = "auditor:pending:";

/** Pending rows expire after 3 days — MP authorization happens in minutes. */
export const PENDING_TTL_SECONDS = 3 * 24 * 60 * 60;

/** Capability-token kind/prefix proving control of an auditor audit session. */
export const AUDITOR_SESSION_KIND = "auditor-session";
export const AUDITOR_SESSION_PREFIX = "ast";

/**
 * Server-side record written at subscribe, read at activate. The `sessionId`
 * here is authoritative — the entitlement binds to it, NOT to anything the
 * activate caller (or MP's external_reference) supplies.
 */
export interface PendingSubscription {
  sessionId: string;
  payerEmail: string;
  plan: string;
  createdAt: string;
}

export function pendingKey(preapprovalId: string): string {
  return `${PENDING_KEY_PREFIX}${preapprovalId}`;
}
