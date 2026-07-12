/**
 * Typed error taxonomy for @ar-agents/wallet-cdp, extending @ar-agents/core's
 * `ArAgentsError` so a host's generic error handling (retry, audit summary via
 * `isArAgentsError`) picks these up for free -- see
 * apps/sociedad-ia-starter/src/lib/audit-middleware.ts's `summarizeFailure`,
 * which already reads `err.code` off any `ArAgentsError`.
 *
 * The two outcomes a provider-gated transfer can fail with, per ROADMAP.md
 * M2-4b's acceptance ("Provider errors surface typed (policy_denied vs
 * upstream_error)"):
 *
 *   - `policy_denied`  -- CDP's server-side policy engine rejected the
 *     transaction BEFORE signing (wrong recipient, over the per-tx cap, native
 *     ETH, or any other rule mismatch). NOT retryable: retrying the same call
 *     will fail again; the caller must change the request or ask a human.
 *   - `upstream_error` -- anything else (network blip, CDP outage, malformed
 *     SDK response, auth failure). Retryable by default; a real caller should
 *     still back off, this is not a blind-retry license.
 */

import { ArAgentsError, type ArAgentsErrorInit } from "@ar-agents/core";

/** CDP's policy engine rejected the transaction before it was ever signed/sent. */
export class WalletCdpPolicyDeniedError extends ArAgentsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, { code: "policy_denied", retryable: false, context });
    this.name = "WalletCdpPolicyDeniedError";
  }
}

/** Any other CDP/provider failure (network, auth, malformed response, ...). */
export class WalletCdpUpstreamError extends ArAgentsError {
  constructor(message: string, context: Record<string, unknown> = {}, cause?: unknown) {
    const init: ArAgentsErrorInit = { code: "upstream_error", retryable: true, context };
    super(message, cause !== undefined ? { ...init, cause } : init);
    this.name = "WalletCdpUpstreamError";
  }
}

/**
 * A CDP policy-engine denial's message is not a documented, stable contract
 * (Coinbase's docs do not publish an error-code enum for this -- see
 * docs/research/spikes/wallet-provider/coinbase-spike.mjs, which only ever
 * observed the plain-English string below). This regex is therefore an
 * ASSUMPTION, matched defensively against the same phrasing the spike proved
 * live on Base Sepolia ("The request is forbidden due to violating at least
 * one configured policy."), plus the more generic words CDP's docs use for
 * the feature ("policy", "forbidden", "denied", "not permitted"). Anything
 * that does NOT match falls through to `upstream_error` (fails toward
 * "retryable", never silently toward "the transfer definitely happened").
 * CONFIRM against a live denial before depending on this in production; the
 * package's `scripts/wallet-cdp-live-check.mjs` is the place to re-verify it.
 */
const POLICY_DENIAL_PATTERN = /forbidden|violat\w* .*polic|policy engine|not permitted by policy|policy.?denied/i;

/**
 * Classify a thrown error from a CDP account operation (`transfer`,
 * `updateAccount`, `createPolicy`, ...) into the two-outcome taxonomy above.
 * Never throws; always returns one of the two typed errors, wrapping the
 * original error as `cause` (upstream) or in `context.original` (policy,
 * where `cause` is reserved for a genuine root cause chain).
 */
export function classifyCdpError(err: unknown, where: string): WalletCdpPolicyDeniedError | WalletCdpUpstreamError {
  const message = err instanceof Error ? err.message : String(err);
  if (POLICY_DENIAL_PATTERN.test(message)) {
    return new WalletCdpPolicyDeniedError(`${where}: policy denied -- ${message}`, {
      where,
      original: message,
    });
  }
  return new WalletCdpUpstreamError(`${where}: ${message}`, { where }, err);
}
