/**
 * `MoneyAuditEvent` — the common, cross-leg money-audit schema (ROADMAP.md
 * M2-4c: "every wallet transfer and OffRampAdapter conversion appends to the
 * same signed audit log with a common schema, reusing the treasury package
 * receipt shapes").
 *
 * Lives here (not in `@ar-agents/wallet-cdp` or `@ar-agents/core`) because
 * the acceptance criterion is literally "reusing the treasury package
 * receipt shapes": `OffRampReceipt` (the fiat leg) already lives in
 * `./index.ts`, and this module's shape mirrors it — `asset`/`amount` for a
 * plain-decimal leg, `counterAsset`/`counterAmount` for the settlement side
 * of a conversion, `ref` for the provider's txId. The crypto leg
 * (`@ar-agents/wallet-cdp`'s `TransferReceipt`) is deliberately NOT imported
 * here: wallet-cdp has no dependency on treasury today (only on
 * `@ar-agents/core`), and adding one just to share a type would invert the
 * dependency direction for no real gain. Instead, the HOST (the starter app,
 * which already depends on both packages) maps each receipt shape into this
 * one common event at the tool-call boundary — see
 * `apps/sociedad-ia-starter/src/lib/money-audit-summarizers.ts`.
 *
 * Pure, no `ai`/`zod` — same posture as the rest of `./index.ts`.
 */

/** Which side of the crypto<->fiat bridge produced this event. */
export type MoneyAuditLeg = "crypto" | "fiat";

/** The money-moving operations this schema covers: an outbound wallet-cdp
 *  transfer, an OffRampAdapter USDC->ARS conversion, and an inbound owner
 *  top-up -- USDC an owner sends directly to the society's CDP wallet from
 *  their own external wallet (ROADMAP.md M2-4d), observed on-chain rather
 *  than initiated by this codebase. Extend as new operations get audited
 *  the same way. */
export type MoneyAuditKind = "transfer" | "offramp_convert" | "topup";

/**
 * Cross-leg outcome taxonomy. Deliberately wider than either single leg's
 * own vocabulary so ONE schema covers both:
 *   - wallet-cdp's `guardedTransferUsdc` returns `"executed" | "deferred"` and
 *     THROWS `WalletCdpPolicyDeniedError` (-> "denied") / `WalletCdpUpstreamError`
 *     (-> "failed") for the other two cases (see errors.ts's ROADMAP.md M2-4b
 *     taxonomy: `policy_denied` / `upstream_error`).
 *   - an `OffRampAdapter.convert()` either resolves (-> "executed") or throws
 *     (-> "failed"); it has no approvals-gate concept of its own, so "denied"
 *     is crypto-leg-specific in practice today, kept here for symmetry.
 */
export type MoneyAuditOutcome = "executed" | "deferred" | "denied" | "failed";

export interface MoneyAuditEvent {
  leg: MoneyAuditLeg;
  kind: MoneyAuditKind;
  /** The asset being moved/sold, e.g. "USDC". */
  asset: string;
  /** Crypto leg: atomic base units (string, e.g. USDC 6 decimals). Mutually
   *  exclusive in practice with `amount` — set exactly one. */
  amountAtomic?: string;
  /** Decimals for `amountAtomic`. Defaults to 6 (USDC) when omitted. */
  decimals?: number;
  /** Fiat leg (or any plain-decimal leg): the amount of `asset` moved/sold. */
  amount?: number;
  /** The settlement side of a conversion (e.g. "ARS" received for USDC sold).
   *  Only meaningful for `kind: "offramp_convert"`. */
  counterAsset?: string;
  counterAmount?: number;
  /** Redacted-safe counterparty: an on-chain address (already public) is
   *  fine; NEVER a raw CVU/CBU/bank detail or other PII. */
  counterparty?: string;
  /** Provider-native reference: a tx hash (crypto) or the PSAV's txId (fiat). */
  ref?: string;
  outcome: MoneyAuditOutcome;
  /** Network (crypto, e.g. "base-sepolia") or PSAV name (fiat, e.g.
   *  "Manteca"), when known. Omitted rather than guessed. */
  provider?: string;
}

const OUTCOME_ES: Record<MoneyAuditOutcome, string> = {
  executed: "ejecutada",
  deferred: "diferida, pendiente de aprobacion",
  denied: "denegada por politica",
  failed: "fallida",
};

/** Matches the starter's own `MAX_SUMMARY_LEN`
 *  (apps/sociedad-ia-starter/src/lib/audit-log.ts) so a caller never gets a
 *  string that silently gets truncated further downstream — same
 *  duplicate-the-small-constant convention `apps/landing/src/lib/
 *  society-audit.ts` already uses for the same reason. */
const MAX_SUMMARY_LEN = 280;

function truncateMiddle(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

/** Render `amountAtomic` (a non-negative integer string of base units) as a
 *  human decimal, e.g. ("1000000", 6) -> "1.000000". Non-numeric input is
 *  echoed back verbatim rather than thrown — a formatter must never be the
 *  thing that breaks an audit write. */
function formatAtomic(amountAtomic: string, decimals: number): string {
  if (!/^\d+$/.test(amountAtomic)) return amountAtomic;
  const padded = amountAtomic.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals) || "0";
  const fracPart = decimals > 0 ? padded.slice(padded.length - decimals) : "";
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function formatCryptoLeg(e: MoneyAuditEvent): string {
  const amountStr =
    e.amountAtomic !== undefined ? formatAtomic(e.amountAtomic, e.decimals ?? 6) : String(e.amount ?? "?");
  if (e.kind === "topup") {
    const from = e.counterparty ? truncateMiddle(e.counterparty, 6, 4) : "origen desconocido";
    let s = `${e.asset} ${amountStr} recibido de ${from}`;
    if (e.provider) s += ` (${e.provider})`;
    s += ` ${OUTCOME_ES[e.outcome]}`;
    if (e.ref) s += `, tx ${truncateMiddle(e.ref, 8, 6)}`;
    return s;
  }
  const to = e.counterparty ? truncateMiddle(e.counterparty, 6, 4) : "destinatario desconocido";
  let s = `${e.asset} ${amountStr} -> ${to}`;
  if (e.provider) s += ` (${e.provider})`;
  s += ` ${OUTCOME_ES[e.outcome]}`;
  if (e.ref) s += `, tx ${truncateMiddle(e.ref, 8, 6)}`;
  return s;
}

function formatFiatLeg(e: MoneyAuditEvent): string {
  const amountStr = e.amount !== undefined ? e.amount.toFixed(2) : "?";
  let s = `${e.asset} ${amountStr}`;
  if (e.counterAsset && e.counterAmount !== undefined) {
    s += ` -> ${e.counterAsset} ${e.counterAmount.toFixed(2)}`;
  }
  if (e.provider) s += ` via ${e.provider}`;
  s += ` ${OUTCOME_ES[e.outcome]}`;
  if (e.ref) s += `, ref ${truncateMiddle(e.ref, 10, 6)}`;
  return s;
}

/**
 * Render a `MoneyAuditEvent` into the short, public-safe, es-AR-ish one-line
 * summary the local audit rail expects (`LocalAuditEntry.summary`,
 * `apps/sociedad-ia-starter/src/lib/audit-log.ts`). Never throws; caps at
 * `MAX_SUMMARY_LEN` itself (the audit rail's own `redactSummary` caps again,
 * defense in depth, same posture as the sink's server-side re-cap).
 *
 * No em dashes, no raw args/output — only the already-typed fields on
 * `MoneyAuditEvent`, which the caller is responsible for populating from
 * redacted, public-safe data in the first place (an on-chain address is
 * fine; a CVU/CBU/bank account number is not).
 */
export function formatMoneyAuditSummary(event: MoneyAuditEvent): string {
  const s = event.leg === "crypto" ? formatCryptoLeg(event) : formatFiatLeg(event);
  return s.length > MAX_SUMMARY_LEN ? `${s.slice(0, MAX_SUMMARY_LEN - 1)}…` : s;
}

/**
 * Build the MoneyAuditEvent for an owner USDC top-up (ROADMAP.md M2-4d). A
 * crypto-leg inbound transfer: counterparty is the SOURCE address the funds
 * arrived from (public, on-chain, when known), ref the funding tx hash.
 */
export function topUpAuditEvent(args: {
  amountAtomic?: string;
  amount?: number;
  decimals?: number;
  asset?: string;
  from?: string;
  ref?: string;
  provider?: string;
  outcome?: MoneyAuditOutcome;
}): MoneyAuditEvent {
  return {
    leg: "crypto",
    kind: "topup",
    asset: args.asset ?? "USDC",
    outcome: args.outcome ?? "executed",
    ...(args.amountAtomic !== undefined ? { amountAtomic: args.amountAtomic } : {}),
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.decimals !== undefined ? { decimals: args.decimals } : {}),
    ...(args.from !== undefined ? { counterparty: args.from } : {}),
    ...(args.ref !== undefined ? { ref: args.ref } : {}),
    ...(args.provider !== undefined ? { provider: args.provider } : {}),
  };
}
