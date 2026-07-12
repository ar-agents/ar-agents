/**
 * ROADMAP.md M2-4c/M2-4d: structured, cross-leg money-audit summaries for
 * the tools in this starter that move or observe money -- wallet-cdp's
 * `wallet_transfer_usdc` (crypto leg, EXECUTES a transfer), treasury's
 * `treasury_offramp_convert` (fiat leg, EXECUTES a conversion), and
 * wallet-cdp's read-only `wallet_check_balance` (crypto leg, OBSERVES a
 * balance increase -- the v0 owner top-up flow's detection side). Maps each
 * tool's own args/result/thrown-error shape into `@ar-agents/treasury`'s
 * common `MoneyAuditEvent`; `./audit-middleware` renders the event with that
 * package's `formatMoneyAuditSummary` instead of falling back to the generic
 * "accion ejecutada" / "no disponible" / "fallo (code)" lines every other
 * tool gets.
 *
 * Registered per tool name in `MONEY_AUDIT_SUMMARIZERS` (wired in by
 * `./agent.ts`), not hardcoded into `./audit-middleware` itself -- that
 * module stays generic so a future money-relevant tool (e.g. ROADMAP.md
 * M2-4f's ARS-in top-up route) only needs a new entry here.
 *
 * Every mapper returns null (never throws) when the call's own shape isn't a
 * money-outcome for THIS registry -- e.g. `{available:false}` (no wallet/
 * off-ramp configured, already a clear generic line), a thrown error that
 * isn't one of the two typed money outcomes (a validation bug should read as
 * a generic failure, not a fabricated "denied"/"failed" money event), or a
 * balance check that found no deposit (a plain read isn't a money event).
 */

import { isArAgentsError } from "@ar-agents/core";
import { formatMoneyAuditSummary, type MoneyAuditEvent } from "@ar-agents/treasury";
import type { MoneySummarizer, MoneySummarizerRegistry } from "./audit-middleware";

export const WALLET_TRANSFER_TOOL_NAME = "wallet_transfer_usdc";
export const OFFRAMP_CONVERT_TOOL_NAME = "treasury_offramp_convert";
export const WALLET_CHECK_BALANCE_TOOL_NAME = "wallet_check_balance";

/** The CDP network this deploy's wallet operates on -- read at call time (not
 *  cached at module load) so tests can flip it between assertions. Matches
 *  `getCdpWallet`'s own default in `./clients.ts`. */
function cdpNetwork(): string {
  return process.env.CDP_NETWORK?.trim() || "base-sepolia";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Crypto leg: `@ar-agents/wallet-cdp/tools`'s `wallet_transfer_usdc`. */
export const walletTransferUsdcSummarizer: MoneySummarizer = {
  onSuccess(args, result) {
    if (!isRecord(args) || !isRecord(result) || result.available !== true) return null;
    const to = str(args.to);
    const amountAtomic = str(args.amountAtomic);
    if (!to || !amountAtomic) return null;

    if (result.status === "executed") {
      const receipt = isRecord(result.receipt) ? result.receipt : {};
      const ref = str(receipt.transactionHash);
      const event: MoneyAuditEvent = {
        leg: "crypto",
        kind: "transfer",
        asset: "USDC",
        amountAtomic,
        decimals: 6,
        counterparty: to,
        outcome: "executed",
        provider: cdpNetwork(),
        ...(ref ? { ref } : {}),
      };
      return event;
    }
    if (result.status === "deferred") {
      const event: MoneyAuditEvent = {
        leg: "crypto",
        kind: "transfer",
        asset: "USDC",
        amountAtomic,
        decimals: 6,
        counterparty: to,
        outcome: "deferred",
        provider: cdpNetwork(),
      };
      return event;
    }
    return null;
  },
  onError(args, err) {
    if (!isRecord(args) || !isArAgentsError(err)) return null;
    const to = str(args.to);
    const amountAtomic = str(args.amountAtomic);
    if (!to || !amountAtomic) return null;

    // Only the two typed outcomes @ar-agents/wallet-cdp's errors.ts documents
    // (ROADMAP.md M2-4b) count as a MONEY outcome here; anything else (e.g. a
    // plain validation error on a malformed amountAtomic) falls through to
    // the generic "fallo (code)" line -- fabricating "denied"/"failed" for a
    // caller bug would misrepresent what actually happened.
    let outcome: "denied" | "failed";
    if (err.code === "policy_denied") outcome = "denied";
    else if (err.code === "upstream_error") outcome = "failed";
    else return null;

    const event: MoneyAuditEvent = {
      leg: "crypto",
      kind: "transfer",
      asset: "USDC",
      amountAtomic,
      decimals: 6,
      counterparty: to,
      outcome,
      provider: cdpNetwork(),
    };
    return event;
  },
};

/**
 * Crypto leg, OBSERVED not executed: `@ar-agents/wallet-cdp/tools`'s
 * read-only `wallet_check_balance` (ROADMAP.md M2-4d). Only produces an
 * event when the tool itself reports `depositDetected: true` -- a balance
 * increase since the LAST check, excluding the very first check ever (that
 * one is the wallet's initial funding baseline, not an observed top-up; see
 * `@ar-agents/wallet-cdp/balance.ts`'s `firstCheck`). A no-change or
 * decrease call returns null here and falls through to the generic "acción
 * ejecutada" line -- a plain balance read isn't a money event worth its own
 * structured entry, only a detected deposit is.
 */
export const walletCheckBalanceSummarizer: MoneySummarizer = {
  onSuccess(_args, result) {
    if (!isRecord(result) || result.available !== true) return null;
    if (result.depositDetected !== true) return null;
    const deltaAtomic = str(result.deltaAtomic);
    if (!deltaAtomic) return null;
    const event: MoneyAuditEvent = {
      leg: "crypto",
      kind: "deposit",
      asset: "USDC",
      amountAtomic: deltaAtomic,
      decimals: 6,
      outcome: "executed",
      provider: cdpNetwork(),
    };
    return event;
  },
};

/** Fiat leg: `@ar-agents/treasury/tools`'s `treasury_offramp_convert`. */
export const treasuryOfframpConvertSummarizer: MoneySummarizer = {
  onSuccess(_args, result) {
    if (!isRecord(result) || result.available !== true) return null;
    const amount = num(result.amountUsd);
    const counterAmount = num(result.arsReceived);
    if (amount === undefined || counterAmount === undefined) return null;
    const ref = str(result.txId);
    const event: MoneyAuditEvent = {
      leg: "fiat",
      kind: "offramp_convert",
      asset: "USDC",
      amount,
      counterAsset: "ARS",
      counterAmount,
      outcome: "executed",
      ...(ref ? { ref } : {}),
    };
    return event;
  },
  onError(args) {
    if (!isRecord(args)) return null;
    const amount = num(args.amountUsd);
    if (amount === undefined) return null;
    const ref = str(args.operationRef);
    const event: MoneyAuditEvent = {
      leg: "fiat",
      kind: "offramp_convert",
      asset: "USDC",
      amount,
      outcome: "failed",
      ...(ref ? { ref } : {}),
    };
    return event;
  },
};

/** Passed as `withLocalAudit`'s `moneySummarizers` option in `./agent.ts`. */
export const MONEY_AUDIT_SUMMARIZERS: MoneySummarizerRegistry = {
  [WALLET_TRANSFER_TOOL_NAME]: walletTransferUsdcSummarizer,
  [OFFRAMP_CONVERT_TOOL_NAME]: treasuryOfframpConvertSummarizer,
  [WALLET_CHECK_BALANCE_TOOL_NAME]: walletCheckBalanceSummarizer,
};

export { formatMoneyAuditSummary };
