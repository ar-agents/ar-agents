// The Accounting Rule (rail-neutral).
//
// Every USD-stablecoin movement an autonomous company makes must yield a
// SECONDARY local-currency (ARS for AR) valuation AT EXECUTION TIME, so the act is
// AFIP/ARCA-correct even though it settled in USD. This is what makes a USD rail
// legal-to-report for an AR Sociedad. It is rail-NEUTRAL: OUSD, USDC, or any USD
// asset builds the same payload; and currency-neutral: the local currency is a
// parameter (defaulting ARS), honoring the jurisdiction/currency decoupling.
//
// Pure: no chain deps, no I/O of its own. The FX feed is injected (FxOracle); a
// deterministic mock is provided for tests + pre-launch dev.

import type { CurrencyCode } from "../jurisdiction";

export interface FxRate {
  /** Units of `to` per 1 unit of `from` (e.g. ARS per USD). */
  rate: number;
  from: CurrencyCode;
  to: CurrencyCode;
  /** ISO-8601 of the quote. */
  at: string;
  /** Where the rate came from, e.g. "mock", "bcra", "criptoya". */
  source: string;
}

/** Pluggable FX oracle. The host injects a real feed; {@link mockFxOracle} is for tests. */
export interface FxOracle {
  rate(from: CurrencyCode, to: CurrencyCode, at?: string): Promise<FxRate>;
}

/**
 * The secondary valuation attached to a USD-denominated movement. `local` is the
 * local-currency equivalent at `at` (== execution time), for invoicing, tax, and
 * registry scoring.
 */
export interface AccountingPayload {
  /** The USD-denominated amount that moved (for OUSD/USDC, 1 unit == 1 USD). */
  usd: number;
  /** Local-currency equivalent at execution time. */
  local: number;
  /** Local currency code (e.g. "ARS"). */
  localCurrency: CurrencyCode;
  /** FX rate used: local per USD. */
  fxRate: number;
  /** Provenance of the rate (never "mock" in production valuation). */
  fxSource: string;
  /** ISO-8601 of the valuation, equal to the execution timestamp. */
  at: string;
  /** Asset ticker, e.g. "OUSD", "USDC". */
  asset: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the accounting payload for a USD-denominated movement. `at` is REQUIRED and
 * MUST be the execution timestamp (the valuation is point-in-time, per the rule).
 * Pure: the only external call is the injected FxOracle.
 */
export async function buildAccountingPayload(input: {
  usd: number;
  asset: string;
  fx: FxOracle;
  at: string;
  /** Defaults to "ARS". */
  localCurrency?: CurrencyCode;
}): Promise<AccountingPayload> {
  if (!Number.isFinite(input.usd) || input.usd < 0) {
    throw new TypeError(`buildAccountingPayload: invalid usd amount ${input.usd}`);
  }
  const localCurrency = input.localCurrency ?? "ARS";
  const q = await input.fx.rate("USD", localCurrency, input.at);
  if (!Number.isFinite(q.rate) || q.rate <= 0) {
    throw new TypeError(`buildAccountingPayload: FX oracle returned an invalid rate ${q.rate}`);
  }
  return {
    usd: input.usd,
    local: round2(input.usd * q.rate),
    localCurrency,
    fxRate: q.rate,
    fxSource: q.source,
    at: input.at,
    asset: input.asset,
  };
}

/**
 * A deterministic mock FX oracle for tests + pre-launch dev. `source: "mock"` so a
 * downstream tax/invoicing module can REFUSE a mock-sourced valuation in production.
 */
export function mockFxOracle(rate = 1000): FxOracle {
  return {
    async rate(from, to, at) {
      return { rate, from, to, at: at ?? "1970-01-01T00:00:00.000Z", source: "mock" };
    },
  };
}
