// OpenUsdRail — the FiatRail implementation for Open USD (OUSD).
//
// OUSD is the consortium USD stablecoin (Open Standard: Visa/Mastercard/Stripe/
// BlackRock/Coinbase/... ), designed for businesses, with reserve yield paid back
// to adopters. ar-agents adopts it as the FLAGSHIP USD rail — but is architected
// around the FiatRail SEAM, not around OUSD: this is ONE FiatRail impl among many
// (Bitso/Ripio/Manteca already exist), so the registry/oracle stay rail-neutral.
//
// MOCK-ONLY until OUSD is live (launches later in 2026 on Solana/Polygon/Aptos/
// Stellar) AND the AR legal/FX treatment is cleared. ALL chain interaction lives
// behind OpenUsdSettlementBackend; core carries ZERO web3 dependencies. Every
// settlement also emits the accounting_payload (ARS-equivalent at execution) so an
// OUSD movement is AFIP/ARCA-correct.

import type {
  CountryCode,
  CurrencyCode,
  FiatRail,
  FiatRailQuote,
  FiatRailReceipt,
  FiatRailStatusReport,
} from "../jurisdiction";
import { buildAccountingPayload, type AccountingPayload, type FxOracle } from "./accounting";

/** Static facts about Open USD. `status` gates any real integration. */
export const OPEN_USD = {
  asset: "OUSD",
  issuer: "Open Standard",
  chains: ["solana", "polygon", "aptos", "stellar"] as const,
  /** "pre-launch" today: ar-agents' OUSD integration is MOCK until this flips to "live". */
  status: "pre-launch" as const,
} as const;

/**
 * The on/off-chain settlement backend for OUSD, injected by the host. The default
 * is a deterministic MOCK (no chain deps). A real backend (Open Standard SDK /
 * Fireblocks / a chain client) is wired ONLY once OUSD is live + legally cleared.
 */
export interface OpenUsdSettlementBackend {
  /** Move `amount` OUSD off-ramp, idempotent by externalId (same key => same txId). */
  transfer(input: {
    amount: number;
    toAsset: string;
    externalId: string;
  }): Promise<{ txId: string; depositAddress?: string }>;
  getStatus?(txId: string): Promise<FiatRailStatusReport>;
}

/** Deterministic mock backend: txId derived from externalId (idempotent), no I/O. */
export function mockOpenUsdBackend(): OpenUsdSettlementBackend {
  return {
    async transfer({ externalId }) {
      let h = 0;
      for (let i = 0; i < externalId.length; i++) h = (h * 31 + externalId.charCodeAt(i)) >>> 0;
      return { txId: `ousd-mock-${h.toString(16).padStart(8, "0")}` };
    },
  };
}

export interface OpenUsdRailOptions {
  /** Local off-ramp fiat (default "ARS"). */
  currency?: CurrencyCode;
  /** Settlement country (default "AR"). */
  country?: CountryCode;
  /** FX feed for accounting + off-ramp valuation (injected). */
  fx: FxOracle;
  /** On/off-chain backend (default: deterministic mock). */
  backend?: OpenUsdSettlementBackend;
  /** Fractional spread charged on the off-ramp quote (0..1, default 0). */
  spread?: number;
}

/** OpenUsdRail also exposes {@link accountingFor} to value a raw OUSD movement (no off-ramp). */
export interface OpenUsdRail extends FiatRail {
  readonly asset: "OUSD";
  /** The accounting_payload for a bare OUSD movement of `amount` at `at` (execution time). */
  accountingFor(input: { amount: number; at: string }): Promise<AccountingPayload>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the OUSD FiatRail. MOCK by default (pass a real `backend` + `fx` when OUSD
 * is live). `settle` is IRREVERSIBLE — callers MUST gate it behind the art.102
 * approval + spending guardrails, exactly like any other FiatRail.
 */
export function createOpenUsdRail(opts: OpenUsdRailOptions): OpenUsdRail {
  const currency: CurrencyCode = opts.currency ?? "ARS";
  const country: CountryCode = opts.country ?? "AR";
  const backend = opts.backend ?? mockOpenUsdBackend();
  const spread = opts.spread ?? 0;

  async function localPerUsd(at?: string): Promise<number> {
    const q = await opts.fx.rate("USD", currency, at);
    if (!Number.isFinite(q.rate) || q.rate <= 0) {
      throw new TypeError(`OpenUsdRail: FX oracle returned an invalid rate ${q.rate}`);
    }
    return q.rate;
  }

  return {
    id: "open-usd",
    asset: "OUSD",
    country,
    currency,
    direction: "both",

    async quote({ amount }): Promise<FiatRailQuote> {
      const rate = (await localPerUsd()) * (1 - spread);
      return { amount, out: round2(amount * rate), rate, spread };
    },

    async settle({ amount, toAsset, externalId }): Promise<FiatRailReceipt> {
      const rate = (await localPerUsd()) * (1 - spread);
      const received = round2(amount * rate);
      const { txId, depositAddress } = await backend.transfer({ amount, toAsset, externalId });
      return {
        amount,
        received,
        rate,
        txId,
        ...(depositAddress ? { depositAddress } : {}),
      };
    },

    ...(backend.getStatus
      ? { getStatus: (txId: string) => backend.getStatus!(txId) }
      : {}),

    async accountingFor({ amount, at }): Promise<AccountingPayload> {
      return buildAccountingPayload({ usd: amount, asset: OPEN_USD.asset, fx: opts.fx, localCurrency: currency, at });
    },
  };
}
