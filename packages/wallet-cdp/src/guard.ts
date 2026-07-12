/**
 * `guardedTransferUsdc` -- the two-layer gate ROADMAP.md M2-4b asks for.
 *
 * Layer 1 (ar-agents approvals gate, ABOVE a configurable threshold only):
 * reuses the EXACT async consume-or-queue convention already wired through
 * `apps/sociedad-ia-starter/src/lib/governance.ts`'s `approve()` and
 * `apps/landing/src/lib/approvals.ts`'s `gateAction()` -- a plain
 * `(toolName, args) => Promise<boolean>` callback (the same shape
 * `@ar-agents/core`'s `withApproval` takes). `true` means "already approved,
 * consumed"; `false` means "queued for a human, DEFER" (per that module's own
 * doc comment: "The agent retries on a later run once the human approves.").
 * This function deliberately does NOT invent a separate approvalId hand-off
 * -- the (tool, args) pair IS the dedup key on the queue side already, so
 * adding a second identifier would just be a second source of truth.
 *
 * Layer 2 (CDP's own server-side policy, ALWAYS, regardless of the
 * threshold): calling `transferUsdc` after layer 1 clears is the only path to
 * the provider; CDP's policy (attached once via `applySpendPolicy`) is
 * evaluated server-side before signing and can independently reject the
 * transaction even though a human already approved it.
 *
 * Both layers are independent: a denial at layer 1 means layer 2 (the
 * provider) is NEVER CALLED; a denial at layer 2 surfaces even when layer 1
 * has already approved (or was skipped because the amount is below
 * threshold). See test/guard.test.ts for both proofs.
 */

import { classifyTool, levelRequiresApproval } from "@ar-agents/core";
import { type CdpAccountLike, type TransferFn, type TransferReceipt, transferUsdc, withTransferIdempotency } from "./wallet";

/** Same callback shape as `@ar-agents/core`'s `WithApprovalOptions.approve`. */
export type ApproveFn = (toolName: string, args: unknown) => Promise<boolean> | boolean;

export interface GuardedTransferUsdcOptions {
  account: CdpAccountLike;
  to: string;
  /** Atomic base units (USDC: 6 decimals). */
  amountAtomic: string;
  idempotencyKey: string;
  network?: string;
  /**
   * The threshold, in atomic units, at or above which the ar-agents approvals
   * gate is consulted. Below it, the transfer proceeds straight to the
   * provider (whose OWN policy still applies -- see the module header).
   */
  thresholdAtomic: string;
  /** The approvals-gate hook. Only called when `amountAtomic >= thresholdAtomic`. */
  approve: ApproveFn;
  /**
   * The name presented to `approve()` and to the risk classifier. Default
   * "wallet_transfer_usdc" -- matches `@ar-agents/core`'s risk-manifest
   * "transfer" override (classifies as "money", so `levelRequiresApproval`
   * is true), which is what makes this gate meaningful rather than a no-op.
   */
  toolName?: string;
  /** Idempotency store passed to `withTransferIdempotency`. Default: fresh in-memory Map per call. */
  store?: Map<string, TransferReceipt>;
  /** Override the transfer function (tests only; production uses the real, idempotency-wrapped `transferUsdc`). */
  transfer?: TransferFn;
}

export type GuardedTransferUsdcResult =
  | { status: "executed"; receipt: TransferReceipt }
  | { status: "deferred"; toolName: string };

function parseAtomic(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new RangeError(`${field} must be a non-negative integer string of atomic units, got "${value}"`);
  }
  return BigInt(value);
}

/**
 * Guard a USDC transfer with both layers, in order: classify -> (maybe)
 * approve -> transfer. Returns `{status:"deferred"}` WITHOUT ever touching
 * `account`/the provider when the approvals gate does not (yet) approve an
 * above-threshold transfer -- the assertion `test/guard.test.ts` makes is
 * literally "the mock provider's `transfer` was never called" in that case.
 */
export async function guardedTransferUsdc(opts: GuardedTransferUsdcOptions): Promise<GuardedTransferUsdcResult> {
  const toolName = opts.toolName ?? "wallet_transfer_usdc";
  const args = { to: opts.to, amountAtomic: opts.amountAtomic, idempotencyKey: opts.idempotencyKey };

  // (a) Classify through the existing risk manifest. A tool named
  // "wallet_transfer_usdc" matches @ar-agents/core's "transfer" override and
  // classifies "money" -> requires approval. Computed for real (not assumed)
  // so a caller who renames `toolName` into something the manifest reads
  // differently gets the manifest's ACTUAL answer, not a hardcoded one.
  const risk = classifyTool({ name: toolName });
  const isAboveThreshold = parseAtomic(opts.amountAtomic, "amountAtomic") >= parseAtomic(opts.thresholdAtomic, "thresholdAtomic");

  // (b) Above threshold: consult the approvals gate. Below threshold: this
  // layer is skipped entirely (approve() is not even called), by design --
  // the whole point of the threshold is that small, routine spend does not
  // need a human, while CDP's own policy (layer 2) still bounds it below.
  if (levelRequiresApproval(risk) && isAboveThreshold) {
    const approved = await opts.approve(toolName, args);
    if (!approved) {
      return { status: "deferred", toolName };
    }
  }

  // (c) Only now does the provider get called. Its OWN policy -- attached via
  // applySpendPolicy, evaluated server-side -- is the second, independent
  // layer: it can still reject this exact call regardless of (b) above.
  const transfer = opts.transfer ?? withTransferIdempotency(transferUsdc, opts.store);
  const receipt = await transfer(opts.account, {
    to: opts.to,
    amountAtomic: opts.amountAtomic,
    idempotencyKey: opts.idempotencyKey,
    ...(opts.network !== undefined ? { network: opts.network } : {}),
  });
  return { status: "executed", receipt };
}
