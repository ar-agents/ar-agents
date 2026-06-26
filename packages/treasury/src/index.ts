/**
 * @ar-agents/treasury — the fiscal/treasury rail for a Sociedad Automatizada.
 *
 * The moat half of the crypto<->fiat bridge: an autonomous society earns in
 * crypto (USDC on Base) but must pay AFIP in pesos. This module is the pure,
 * deterministic BRAIN of that loop: track balances, size the peso tax buffer,
 * plan a just-in-time USDC->ARS conversion, and account for the Ganancias
 * cedular tax on each disposal. The actual off-ramp (USDC->ARS payout to a CVU)
 * is done by an OffRampAdapter wrapping a registered PSAV (Manteca / Ripio B2B);
 * we integrate one, we do not become one (CNV RG 1058/2025).
 *
 * Pure functions (clock + fx injected, never read) so they are unit-testable and
 * deterministic. Irreversible moves (convert, pay) must be gated by the agent's
 * requireConfirmation (RFC-001) and written to the signed audit log by the caller.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Money + state
// ─────────────────────────────────────────────────────────────────────────────

/** Stablecoin balance, USDC (the society earns here). */
export type Usd = number;
/** Peso balance, ARS (held in a CVU; what AFIP is paid from). */
export type Ars = number;

export interface TreasuryState {
  /** USDC balance (on Base). */
  usd: Usd;
  /** ARS balance (in the society's CVU). */
  ars: Ars;
  /**
   * Average USD cost basis per USDC unit currently held. For USDC ~= 1, but the
   * society may have acquired crypto that appreciated; cedular is on the gain.
   */
  costBasisPerUsd: number;
}

export const ZERO_STATE: TreasuryState = { usd: 0, ars: 0, costBasisPerUsd: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// Ganancias cedular on a crypto disposal (verified: 5% ARS / 15% foreign, on the
// GAIN; crypto is IVA-exempt; holding + own-wallet transfers are not taxable).
// ─────────────────────────────────────────────────────────────────────────────

export type Denomination = "ARS" | "FOREIGN";
export const CEDULAR_RATE: Record<Denomination, number> = { ARS: 0.05, FOREIGN: 0.15 };

/**
 * Cedular tax owed (in ARS) on disposing `amountUsd` of crypto with the given
 * per-unit cost basis, at `fxRate` (ARS per USD). Taxed on the gain only; 0 if no gain.
 */
export function cedularTax(
  amountUsd: Usd,
  costBasisPerUsd: number,
  fxRate: number,
  denom: Denomination = "ARS",
): Ars {
  const proceeds = amountUsd * fxRate;
  const cost = amountUsd * costBasisPerUsd * fxRate;
  const gain = Math.max(0, proceeds - cost);
  return gain * CEDULAR_RATE[denom];
}

// ─────────────────────────────────────────────────────────────────────────────
// Obligations (what the society owes AFIP / fisco) + the peso buffer
// ─────────────────────────────────────────────────────────────────────────────

export type ObligationKind = "monotributo" | "vep" | "iibb" | "cedular";

export interface Obligation {
  id: string;
  kind: ObligationKind;
  amountArs: Ars;
  /** Epoch ms when it is due. */
  dueAtMs: number;
}

/** The next obligation due at/after `nowMs`, or null. */
export function nextObligation(obligations: Obligation[], nowMs: number): Obligation | null {
  const upcoming = obligations
    .filter((o) => o.dueAtMs >= nowMs)
    .sort((a, b) => a.dueAtMs - b.dueAtMs);
  return upcoming[0] ?? null;
}

/**
 * ARS needed to cover every obligation due within `horizonMs` from now, times a
 * safety multiple (default 1.1) so a small fx move does not leave AFIP short.
 */
export function requiredArsBuffer(
  obligations: Obligation[],
  nowMs: number,
  horizonMs: number,
  safety = 1.1,
): Ars {
  const due = obligations.filter((o) => o.dueAtMs >= nowMs && o.dueAtMs <= nowMs + horizonMs);
  const total = due.reduce((sum, o) => sum + o.amountArs, 0);
  return total * safety;
}

// ─────────────────────────────────────────────────────────────────────────────
// Just-in-time conversion policy
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversionPlan {
  /** How much USDC to convert now (0 = do nothing). */
  convertUsd: Usd;
  /** ARS expected from that conversion, net of spread. */
  expectedArs: Ars;
  reason: string;
}

/**
 * Plan a just-in-time conversion: if the ARS balance is below `requiredArs`,
 * convert only enough USDC (at `fxRate` net of `spread`) to top the buffer back
 * up, capped by available USDC. Never over-converts (minimizes taxable disposals
 * + fx exposure). Pure.
 */
export function planConversion(
  state: TreasuryState,
  requiredArs: Ars,
  fxRate: number,
  spread = 0.01,
): ConversionPlan {
  const shortfall = requiredArs - state.ars;
  if (shortfall <= 0) {
    return { convertUsd: 0, expectedArs: 0, reason: "ars buffer sufficient" };
  }
  const effectiveRate = fxRate * (1 - spread);
  if (effectiveRate <= 0 || state.usd <= 0) {
    return { convertUsd: 0, expectedArs: 0, reason: "no usd available or invalid rate" };
  }
  const neededUsd = shortfall / effectiveRate;
  const convertUsd = Math.min(neededUsd, state.usd);
  const expectedArs = convertUsd * effectiveRate;
  return {
    convertUsd,
    expectedArs,
    reason: convertUsd < neededUsd ? "partial: usd insufficient for full buffer" : "top up to buffer",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure state transitions (apply a conversion / a payment)
// ─────────────────────────────────────────────────────────────────────────────

export interface OffRampReceipt {
  amountUsd: Usd;
  arsReceived: Ars;
  /** ARS per USD actually realized (net of spread). */
  rate: number;
  txId: string;
  /**
   * Set by session-model PSAVs (Ripio): the on-chain address the society must
   * send `amountUsd` USDC to in order to complete the off-ramp. Manteca (which
   * sells from the platform balance) leaves it undefined.
   */
  depositAddress?: string;
}

/** Apply a completed off-ramp conversion to the state (USDC down, ARS up). */
export function applyConversion(state: TreasuryState, receipt: OffRampReceipt): TreasuryState {
  return {
    usd: state.usd - receipt.amountUsd,
    ars: state.ars + receipt.arsReceived,
    costBasisPerUsd: state.costBasisPerUsd,
  };
}

/** Apply a tax/obligation payment (ARS down). Throws if it would overdraw the CVU. */
export function applyPayment(state: TreasuryState, amountArs: Ars): TreasuryState {
  if (amountArs > state.ars) {
    throw new Error(
      `insufficient ARS: need ${amountArs.toFixed(2)}, have ${state.ars.toFixed(2)}`,
    );
  }
  return { ...state, ars: state.ars - amountArs };
}

// ─────────────────────────────────────────────────────────────────────────────
// OffRampAdapter — integrate a registered PSAV (Manteca first, Ripio B2B alt).
// We never custody the conversion ourselves; we orchestrate on top of a PSAV.
// ─────────────────────────────────────────────────────────────────────────────

export interface OffRampQuote {
  amountUsd: Usd;
  arsOut: Ars;
  /** Gross ARS per USD before spread. */
  rate: number;
  spread: number;
}

/** Settlement state of an off-ramp, normalized across PSAVs. */
export type OffRampStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN";

export interface OffRampStatusReport {
  txId: string;
  status: OffRampStatus;
  /** ARS actually settled to the CVU once COMPLETED, if the PSAV reports it. */
  arsSettled?: Ars;
  /** Provider-native status string, kept for the signed audit log / forensics. */
  raw?: string;
}

export interface OffRampAdapter {
  /** Quote a USDC->ARS conversion (net of spread). No side effects. */
  quote(amountUsd: Usd): Promise<OffRampQuote>;
  /**
   * Execute the conversion + payout of ARS to the society's CVU. IRREVERSIBLE:
   * the caller MUST gate this behind requireConfirmation (RFC-001) and log it.
   * `opts.externalId` is a REQUIRED idempotency key — a STABLE id derived from the
   * payment (e.g. obligation id + period + amount). Reuse the SAME key on retry so
   * the PSAV deduplicates it and a retried convert never double-spends.
   */
  convert(amountUsd: Usd, opts: { externalId: string }): Promise<OffRampReceipt>;
  /**
   * Poll the settlement of a prior convert(). A real off-ramp is ASYNCHRONOUS:
   * the PSAV sells the crypto, then settles ARS to the CVU over seconds-to-minutes
   * (Manteca models this as a multi-stage "synthetic"). Optional because the
   * in-memory adapter settles instantly.
   */
  getStatus?(txId: string): Promise<OffRampStatusReport>;
}

/**
 * Deterministic in-memory off-ramp for tests/dev (no network, no PSAV). A real
 * adapter wraps Manteca's API Cripto / API Rampa (or Ripio B2B): fund a wallet
 * with USDC -> POST a conversion -> ARS settles to the CVU -> webhook confirms.
 */
export class InMemoryOffRampAdapter implements OffRampAdapter {
  private readonly settled = new Map<string, OffRampReceipt>();
  constructor(
    private readonly rate: number,
    private readonly spread = 0.01,
  ) {}

  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    return {
      amountUsd,
      arsOut: amountUsd * this.rate * (1 - this.spread),
      rate: this.rate,
      spread: this.spread,
    };
  }

  async convert(amountUsd: Usd, opts: { externalId: string }): Promise<OffRampReceipt> {
    if (!opts?.externalId)
      throw new Error("InMemoryOffRampAdapter.convert: externalId (idempotency key) is required");
    const cached = this.settled.get(opts.externalId);
    if (cached) return cached; // idempotent: a retry with the same key returns the same receipt
    const q = await this.quote(amountUsd);
    const receipt = {
      amountUsd,
      arsReceived: q.arsOut,
      rate: this.rate * (1 - this.spread),
      txId: `mem-${opts.externalId}`,
    };
    this.settled.set(opts.externalId, receipt);
    return receipt;
  }

  /** The in-memory adapter settles instantly: any tx it issued is COMPLETED. */
  async getStatus(txId: string): Promise<OffRampStatusReport> {
    return { txId, status: "COMPLETED", raw: "in-memory" };
  }
}

/**
 * Wrap any OffRampAdapter so a retried OR concurrent convert() with the same
 * externalId returns the ORIGINAL receipt instead of creating a second payout.
 *
 * The real PSAV adapters do not all enforce idempotency server-side — e.g. Mural
 * only echoes the key as a `memo`, so a retry creates AND executes a SECOND
 * payout (double-send of real funds). This decorator gives every adapter a
 * deterministic-key dedupe: a store of completed converts (retry-safe) plus an
 * in-flight map so two simultaneous calls share one payout (concurrency-safe).
 *
 * The default store is in-memory (per process instance) — enough for the retry/
 * concurrency that happens within one invocation chain. For cross-instance
 * durability inject a shared, atomic store (e.g. KV-backed) via `store`.
 */
export function withOffRampIdempotency(
  adapter: OffRampAdapter,
  store: Map<string, OffRampReceipt> = new Map(),
): OffRampAdapter {
  const inflight = new Map<string, Promise<OffRampReceipt>>();
  return {
    quote: (amountUsd) => adapter.quote(amountUsd),
    ...(adapter.getStatus
      ? { getStatus: (txId: string) => adapter.getStatus!(txId) }
      : {}),
    convert: async (amountUsd, opts) => {
      if (!opts?.externalId)
        throw new Error(
          "withOffRampIdempotency: externalId (idempotency key) is required",
        );
      const done = store.get(opts.externalId);
      if (done) return done; // retry: return the original receipt, never re-pay
      const running = inflight.get(opts.externalId);
      if (running) return running; // concurrent: share the single in-flight payout
      const p = (async () => {
        const receipt = await adapter.convert(amountUsd, opts);
        store.set(opts.externalId, receipt);
        return receipt;
      })();
      inflight.set(opts.externalId, p);
      try {
        return await p;
      } finally {
        inflight.delete(opts.externalId);
      }
    },
  };
}

/**
 * One-shot helper: given the current state, the obligations, and an off-ramp,
 * compute + (optionally) execute the conversion needed to fund the buffer. Returns
 * the plan; if `offramp` is provided it also performs the conversion and returns
 * the receipt + the resulting state. The convert() call is irreversible: only pass
 * `offramp` from a path already behind requireConfirmation.
 */
export async function fundTaxBuffer(args: {
  state: TreasuryState;
  obligations: Obligation[];
  nowMs: number;
  horizonMs: number;
  fxRate: number;
  spread?: number;
  safety?: number;
  offramp?: OffRampAdapter;
  /**
   * Idempotency key for the off-ramp convert. Defaults to a deterministic id from
   * the obligations being funded + the amount, so a retried fundTaxBuffer with the
   * same inputs is deduplicated by the PSAV and never double-spends. Pass an
   * explicit stable id to override.
   */
  externalId?: string;
}): Promise<{ plan: ConversionPlan; receipt?: OffRampReceipt; state: TreasuryState }> {
  const required = requiredArsBuffer(args.obligations, args.nowMs, args.horizonMs, args.safety);
  const plan = planConversion(args.state, required, args.fxRate, args.spread);
  if (plan.convertUsd <= 0 || !args.offramp) {
    return { plan, state: args.state };
  }
  const externalId =
    args.externalId ??
    `fund-${args.obligations.map((o) => o.id).join("+")}-${plan.convertUsd.toFixed(2)}`;
  const receipt = await args.offramp.convert(plan.convertUsd, { externalId });
  return { plan, receipt, state: applyConversion(args.state, receipt) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete PSAV adapter (Manteca) + the AFIP fiscal layer. Re-exported so the
// pure core and the real-world rails share one import. These are still ai/zod-
// free; only `@ar-agents/treasury/tools` pulls in the Vercel AI SDK.
// ─────────────────────────────────────────────────────────────────────────────

export {
  MantecaOffRampAdapter,
  type MantecaConfig,
  MantecaApiError,
  MantecaAuthError,
  MantecaRateLimitError,
} from "./manteca";

export {
  RipioOffRampAdapter,
  type RipioConfig,
  RipioApiError,
  RipioAuthError,
  RipioRateLimitError,
  normalizeRipioStatus,
  RIPIO_SANDBOX,
  RIPIO_PROD,
} from "./ripio";

export {
  MuralOffRampAdapter,
  type MuralConfig,
  MuralApiError,
  MuralAuthError,
  MuralRateLimitError,
  normalizeMuralStatus,
  MURAL_PROD,
  MURAL_SANDBOX,
} from "./mural";

export {
  BitsoOffRampAdapter,
  type BitsoConfig,
  BitsoApiError,
  BitsoAuthError,
  BitsoRateLimitError,
  normalizeBitsoStatus,
  deriveOriginId,
  BITSO_PROD,
  BITSO_SANDBOX,
} from "./bitso";

export {
  MONOTRIBUTO_2026,
  MONOTRIBUTO_TABLE_EFFECTIVE,
  type MonotributoCategory,
  type MonotributoActivity,
  type MonotributoRow,
  monotributoCuota,
  categoryForAnnualIncome,
  type SettlementMethod,
  type SettlementAutonomy,
  type SettlementPlan,
  settlementPlan,
  WSCREATEVEP_IS_GOV_ONLY,
} from "./afip";
