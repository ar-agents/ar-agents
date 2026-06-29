// Argentina — jurisdiction #1.
//
// The AR first implementation of the jurisdiction seam. This file proves the
// seam closes over a real jurisdiction without dragging AFIP/Manteca runtime
// deps into core: the tax rules are PURE calculators (the math is reproduced
// faithfully from @ar-agents/treasury, NOT imported, so core stays dep-free),
// and the Registry + FiatRails are INJECTED by the host via createArJurisdiction.
//
// status: "proposal" — the Sociedad Automatizada regime (art.102) is an
// anteproyecto, not enacted law (CAPTURE-TRANSFORMATION.md). When it is enacted,
// flip to "operational" (the LAW_STATUS pre/live switch).

import type {
  FiatRail,
  Jurisdiction,
  Registry,
  TaxableEvent,
  TaxOwed,
  TaxRule,
} from "../jurisdiction";
import type { RiskLevel } from "../risk-manifest";

/**
 * An AR tax rule: a neutral {@link TaxRule} plus the art.102 risk tier the AR
 * regime assigns to acting on it (a pure calculator is "read"; a filing/payment
 * is "fiscal"). This refinement is what keeps RiskLevel OUT of the
 * jurisdiction-neutral core contract — a non-AR jurisdiction is never forced
 * into Argentina's risk vocabulary.
 */
export interface ArTaxRule extends TaxRule {
  readonly riskLevel: RiskLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// AR cedular (Ganancias) on a crypto disposal.
//
// Reproduces @ar-agents/treasury cedularTax (treasury/src/index.ts:41-62)
// FAITHFULLY as a pure TaxRule — core must not depend on treasury:
//   proceeds = amount * fxRate
//   cost     = amount * costBasisPerUsd * fxRate
//   gain     = max(0, proceeds - cost)
//   owed     = gain * rate     where rate = 5% (ARS-denominated) / 15% (foreign)
// Taxed on the GAIN only; 0 if no gain. Pure: clock/fx are passed in via the
// taxable event's `meta`, never read.
// ─────────────────────────────────────────────────────────────────────────────

/** Cedular rate by denomination of the disposed asset. Mirrors treasury CEDULAR_RATE. */
const AR_CEDULAR_RATE: { readonly ARS: number; readonly FOREIGN: number } = {
  ARS: 0.05,
  FOREIGN: 0.15,
};

/**
 * AR cedular tax on a crypto disposal, as a pure {@link TaxRule}.
 *
 * The {@link TaxableEvent}:
 *   - `kind`: "crypto-disposal"
 *   - `amount`: units of crypto disposed (the USD/USDC amount, like treasury's `amountUsd`)
 *   - `currency`: "ARS" (the tax is denominated/paid in pesos)
 *   - `meta.fxRate`: ARS per USD (required)
 *   - `meta.costBasisPerUsd`: average USD cost basis per unit (default 1, like USDC)
 *   - `meta.denomination`: "ARS" (5%) | "FOREIGN" (15%) — default "ARS"
 *
 * riskLevel "read": this is a pure calculator with NO side effect (the actual
 * filing is a separate fiscal act). Mirrors how risk-manifest classifies tax
 * CALCULATORS as read and tax ACTS as fiscal.
 */
export const AR_CEDULAR: ArTaxRule = {
  id: "ar-cedular",
  country: "AR",
  riskLevel: "read",
  label: "Ganancias cedular sobre disposición de cripto (5% ARS / 15% extranjera)",
  computeOwed(event: TaxableEvent): TaxOwed {
    const meta = event.meta ?? {};
    const fxRate = typeof meta["fxRate"] === "number" ? meta["fxRate"] : 1;
    const costBasisPerUsd =
      typeof meta["costBasisPerUsd"] === "number" ? meta["costBasisPerUsd"] : 1;
    const denom = meta["denomination"] === "FOREIGN" ? "FOREIGN" : "ARS";
    const amount = event.amount;
    const proceeds = amount * fxRate;
    const cost = amount * costBasisPerUsd * fxRate;
    const gain = Math.max(0, proceeds - cost);
    const owed = gain * AR_CEDULAR_RATE[denom];
    return { amount: owed, currency: "ARS", ruleId: "ar-cedular" };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AR monotributo — the fixed monthly cuota as a TaxRule.
//
// Reproduces @ar-agents/treasury MONOTRIBUTO_2026 + monotributoCuota
// (treasury/src/afip.ts:65-92) FAITHFULLY. Values per ARCA "Valores de
// aplicación desde el 1/02/2026". The cuota is a FIXED monthly amount for a
// category + activity, not a function of the event's amount.
//
// The {@link TaxableEvent}:
//   - `kind`: "monotributo-cuota"
//   - `amount`: ignored (the cuota is fixed by category, not by the event)
//   - `currency`: "ARS"
//   - `meta.category`: "A".."K" (default "A")
//   - `meta.activity`: "servicios" | "bienes" (default "servicios")
//
// riskLevel "fiscal": paying/declaring monotributo is a fiscal ACT (mirrors
// risk-manifest classifying fiscal acts as needing the art.102 gate).
// ─────────────────────────────────────────────────────────────────────────────

interface MonotributoRow {
  readonly category: string;
  readonly cuotaServicios: number;
  readonly cuotaBienes: number;
  /** I/J/K are only available when selling goods. */
  readonly bienesOnly: boolean;
}

// Faithful copy of treasury MONOTRIBUTO_2026 (cuota columns; the annual cap is
// not needed to compute the cuota owed). MONOTRIBUTO_TABLE_EFFECTIVE 2026-02-01.
const AR_MONOTRIBUTO_2026: readonly MonotributoRow[] = [
  { category: "A", cuotaServicios: 42_386.74, cuotaBienes: 42_386.74, bienesOnly: false },
  { category: "B", cuotaServicios: 48_250.78, cuotaBienes: 48_250.78, bienesOnly: false },
  { category: "C", cuotaServicios: 56_501.85, cuotaBienes: 55_227.06, bienesOnly: false },
  { category: "D", cuotaServicios: 72_414.10, cuotaBienes: 70_661.26, bienesOnly: false },
  { category: "E", cuotaServicios: 102_537.97, cuotaBienes: 92_658.35, bienesOnly: false },
  { category: "F", cuotaServicios: 129_045.32, cuotaBienes: 111_198.27, bienesOnly: false },
  { category: "G", cuotaServicios: 197_108.23, cuotaBienes: 135_918.34, bienesOnly: false },
  { category: "H", cuotaServicios: 447_346.93, cuotaBienes: 272_063.40, bienesOnly: false },
  { category: "I", cuotaServicios: 824_802.26, cuotaBienes: 406_512.05, bienesOnly: true },
  { category: "J", cuotaServicios: 999_007.65, cuotaBienes: 497_059.41, bienesOnly: true },
  { category: "K", cuotaServicios: 1_381_687.90, cuotaBienes: 600_879.51, bienesOnly: true },
];

/**
 * AR monotributo monthly cuota, as a fiscal {@link TaxRule}. Reproduces
 * treasury monotributoCuota: throws on an unknown category and on a
 * services taxpayer requesting a bienes-only (I/J/K) category.
 */
export const AR_MONOTRIBUTO: ArTaxRule = {
  id: "ar-monotributo",
  country: "AR",
  riskLevel: "fiscal",
  label: "Monotributo — cuota mensual (ARCA, vigente 2026-02-01)",
  computeOwed(event: TaxableEvent): TaxOwed {
    const meta = event.meta ?? {};
    const category = typeof meta["category"] === "string" ? meta["category"] : "A";
    const activity = meta["activity"] === "bienes" ? "bienes" : "servicios";
    const row = AR_MONOTRIBUTO_2026.find((r) => r.category === category);
    if (!row) throw new Error(`unknown monotributo category: ${category}`);
    if (row.bienesOnly && activity === "servicios") {
      throw new Error(
        `category ${category} is only available for venta de bienes (servicios caps at H)`,
      );
    }
    const owed = activity === "servicios" ? row.cuotaServicios : row.cuotaBienes;
    return { amount: owed, currency: "ARS", ruleId: "ar-monotributo" };
  },
};

/** All AR tax rules wired into the AR Jurisdiction. */
export const AR_TAX_RULES: ReadonlyArray<TaxRule> = [AR_CEDULAR, AR_MONOTRIBUTO];

/**
 * Build the AR {@link Jurisdiction}. `registry` and `fiatRails` are INJECTED —
 * the host wires the real IGJ good-standing lookup and the treasury off-ramp
 * (as a FiatRail) — so core carries no AFIP/Manteca runtime dependency.
 */
export function createArJurisdiction(opts: {
  registry: Registry;
  fiatRails?: ReadonlyArray<FiatRail>;
}): Jurisdiction {
  return {
    country: "AR",
    name: "Argentina",
    defaultCurrency: "ARS",
    status: "proposal",
    taxRules: AR_TAX_RULES,
    registry: opts.registry,
    fiatRails: opts.fiatRails ?? [],
  };
}
