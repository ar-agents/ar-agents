/**
 * ROADMAP.md M2-4d: v0 owner top-up flow (manual USDC transfer). The owner
 * funds a society by sending USDC directly to its CDP wallet address on Base
 * from their OWN external wallet -- an owner/ops action, not something this
 * codebase initiates. This module composes `@ar-agents/wallet-cdp`'s
 * on-chain balance read with `@ar-agents/treasury`'s pure reconciliation at
 * the host boundary, the same pattern `./money-audit-summarizers.ts` uses
 * for the two tool-call money legs.
 *
 * Pure over an injected `knownState`: the starter has no persisted
 * TreasuryState store yet (a future ROADMAP item), so the caller supplies
 * the last-known state and this function returns the reconciled one -- it
 * does not read/write any storage itself. It does not append to the local
 * audit log or move money; see docs/guides/owner-topup.md for the full
 * procedure, including where the caller wires the returned `auditSummary`
 * into `appendLocalAudit`.
 */

import { getUsdcBalance, type CdpAccountLike } from "@ar-agents/wallet-cdp";
import { reconcileTopUp, topUpAuditEvent, formatMoneyAuditSummary, type TreasuryState } from "@ar-agents/treasury";

export interface OwnerTopUpResult {
  state: TreasuryState;
  observed: { network: string; amountUsd: number; amountAtomic: string };
  toppedUpUsd: number;
  /** Present only when toppedUpUsd > 0 -- nothing to log for a no-op reconcile. */
  auditSummary?: string;
}

/**
 * Observe the society wallet's current USDC balance and reconcile it into
 * `args.knownState`. If the observed balance is higher than known, the
 * delta is treated as an owner top-up and a formatted audit summary is
 * returned for the caller to persist.
 */
export async function reconcileOwnerTopUp(args: {
  account: CdpAccountLike;
  knownState: TreasuryState;
  network?: string;
  provider?: string;
}): Promise<OwnerTopUpResult> {
  const balance = await getUsdcBalance(args.account, { network: args.network });
  const { toppedUpUsd, state } = reconcileTopUp(args.knownState, balance.amountUsd);
  const observed = {
    network: balance.network,
    amountUsd: balance.amountUsd,
    amountAtomic: balance.amountAtomic,
  };
  if (toppedUpUsd <= 0) return { state, observed, toppedUpUsd: 0 };

  // Deliberately omit `from`: a balance observation does not reveal the
  // sender (a direct on-chain transfer carries no memo the recipient side
  // can read), so the audit renders "origen desconocido" honestly rather
  // than guessing.
  const event = topUpAuditEvent({
    amount: toppedUpUsd,
    asset: "USDC",
    provider: args.provider ?? balance.network,
  });
  return { state, observed, toppedUpUsd, auditSummary: formatMoneyAuditSummary(event) };
}
