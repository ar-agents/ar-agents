// OUSD -> ARS route.
//
// The on-thesis way ar-agents handles Open USD off-ramping: we do NOT become the
// ramp (that is a regulated PSAV/VASP — CNV registration, AML, banking). We
// ORCHESTRATE on top of a licensed PSAV OffRampAdapter (Bitso/Ripio/Manteca/Mural)
// and add the two things that are ours: the AFIP-correct accounting_payload and the
// registry/guardrail posture. This composes @ar-agents/core's accounting bridge
// with treasury's OffRampAdapter.
//
// MOCK-UNTIL-LIVE. OUSD is not issued yet and no AR PSAV has listed it, so by
// default both legs are mocked (InMemoryOffRampAdapter + mockFxOracle). When OUSD
// is live AND a provider lists it AND the AR legal/FX (cepo) treatment is cleared,
// pass a REAL `provider` + `fx`. `OPEN_USD.status` gates whether this can run for real.

import {
  buildAccountingPayload,
  mockFxOracle,
  OPEN_USD,
  type AccountingPayload,
  type CurrencyCode,
  type FxOracle,
} from "@ar-agents/core";
import {
  InMemoryOffRampAdapter,
  type OffRampAdapter,
  type OffRampQuote,
  type OffRampReceipt,
} from "./index";

export interface OusdArsRouteOptions {
  /** The licensed PSAV off-ramp leg. Default: a deterministic mock (until a provider lists OUSD). */
  provider?: OffRampAdapter;
  /** FX feed for the tax-accounting valuation. Default: mockFxOracle (source "mock"). */
  fx?: FxOracle;
  /** Local currency (default "ARS"). */
  localCurrency?: CurrencyCode;
}

export interface OusdArsQuote {
  asset: "OUSD";
  amountOusd: number;
  /** The provider's realized OUSD(USD)->ARS quote (net of spread). */
  offRamp: OffRampQuote;
  /** AFIP-correct ARS valuation at quote time (mark-to-market, independent of the provider spread). */
  accounting: AccountingPayload;
}

export interface OusdArsReceipt {
  asset: "OUSD";
  /** The provider's payout receipt. */
  receipt: OffRampReceipt;
  /** AFIP-correct ARS valuation at execution time. */
  accounting: AccountingPayload;
}

export interface OusdArsRoute {
  readonly asset: "OUSD";
  /** True only when OUSD is live (`OPEN_USD.status === "live"`). Mock otherwise. */
  readonly live: boolean;
  quote(amountOusd: number, opts?: { at?: string }): Promise<OusdArsQuote>;
  /**
   * Execute OUSD -> ARS via the provider + emit the accounting_payload. IRREVERSIBLE:
   * the caller MUST gate this behind the art.102 approval + spending guardrails
   * (@ar-agents/mcp) and record it to the Auditor. `externalId` is the idempotency
   * key (same key on retry => same receipt, never double-spend).
   */
  convert(amountOusd: number, opts: { externalId: string; at?: string }): Promise<OusdArsReceipt>;
}

/**
 * Build the OUSD -> ARS route. OUSD is USD-pegged 1:1, so the OUSD amount maps
 * directly to the OffRampAdapter's USD amount. The provider realizes the actual
 * ARS (net of spread); the accounting_payload is a separate mark-to-market ARS
 * valuation for tax (they SHOULD differ — the gap is the off-ramp cost).
 */
export function createOusdArsRoute(opts: OusdArsRouteOptions = {}): OusdArsRoute {
  // Default mock rate ~1000 ARS/USD (NOT a real quote): InMemoryOffRampAdapter + mockFxOracle.
  const provider = opts.provider ?? new InMemoryOffRampAdapter(1000);
  const fx = opts.fx ?? mockFxOracle(1000);
  const localCurrency: CurrencyCode = opts.localCurrency ?? "ARS";

  return {
    asset: "OUSD",
    live: OPEN_USD.status === "live",

    async quote(amountOusd, o): Promise<OusdArsQuote> {
      const at = o?.at ?? new Date().toISOString();
      const [offRamp, accounting] = await Promise.all([
        provider.quote(amountOusd),
        buildAccountingPayload({ usd: amountOusd, asset: OPEN_USD.asset, fx, at, localCurrency }),
      ]);
      return { asset: "OUSD", amountOusd, offRamp, accounting };
    },

    async convert(amountOusd, o): Promise<OusdArsReceipt> {
      const receipt = await provider.convert(amountOusd, { externalId: o.externalId });
      // Value at execution time (after the conversion completes).
      const at = o.at ?? new Date().toISOString();
      const accounting = await buildAccountingPayload({ usd: amountOusd, asset: OPEN_USD.asset, fx, at, localCurrency });
      return { asset: "OUSD", receipt, accounting };
    },
  };
}
