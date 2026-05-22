/**
 * Pure calculation primitives for IIBB.
 *
 * Nothing here touches the network or a database. Given a rate-book and
 * a list of income lines, you can compute a complete monthly DDJJ with
 * deterministic, unit-testable math.
 *
 * All amounts are in ARS centavos (integers). Rates are fractions
 * (0.035 = 3.5%), NEVER percentages, to avoid silent off-by-100 bugs.
 */
import type {
  Alicuota,
  IngresoLine,
  JurisdictionCode,
  DdjjResult,
  DdjjJurisdictionSummary,
  RetentionInput,
  RetentionResult,
  PerceptionInput,
  PerceptionResult,
} from "./types";
import { AUTHORITY_BY_JURISDICTION } from "./types";
import { IibbRateNotFoundError, IibbValidationError } from "./errors";

// ── Rate book ────────────────────────────────────────────────────

/**
 * In-memory rate book. Real adapters load this from each jurisdiction's
 * regulation. The package ships with NO baked-in rates because they
 * change with every annual regulation; the caller is responsible for
 * loading the current rate book for the period being filed.
 */
export class RateBook {
  private readonly rates: ReadonlyArray<Alicuota>;

  constructor(rates: ReadonlyArray<Alicuota>) {
    this.rates = rates;
  }

  lookup(
    jurisdiction: JurisdictionCode,
    activityCode: string,
    dateIso?: string,
  ): Alicuota | null {
    const candidates = this.rates.filter(
      (r) =>
        r.jurisdiction === jurisdiction && r.activityCode === activityCode,
    );
    if (candidates.length === 0) return null;
    if (!dateIso) return candidates[0] ?? null;
    // Pick the rate that is valid at `dateIso`.
    const onDate = candidates.find(
      (r) => !r.validUntil || r.validUntil > dateIso,
    );
    return onDate ?? candidates[0] ?? null;
  }

  size(): number {
    return this.rates.length;
  }
}

// ── DDJJ ─────────────────────────────────────────────────────────

export interface ComputeDdjjArgs {
  /** Period being filed, YYYY-MM. */
  period: string;
  /** Filer regime — single jurisdiction OR Convenio Multilateral. */
  regime: "local" | "cm";
  /** For local: the jurisdiction. For CM: "CM". */
  filerCode: JurisdictionCode;
  /** All income lines realized during `period`. */
  lines: ReadonlyArray<IngresoLine>;
  /** Rate book providing the alicuota per (jurisdiction, activity). */
  rateBook: RateBook;
  /** CM-only: pre-computed coeficiente unificado per jurisdiction
   * (sums to 1.0). Required for Article 2 (general regime). */
  cmCoefficients?: Record<string, number> | undefined;
}

/**
 * Compute a monthly DDJJ from raw income lines.
 *
 *   Local regime: each line is taxed at its jurisdiction's alicuota.
 *                 All lines should belong to the same jurisdiction; lines
 *                 in OTHER jurisdictions trigger an IibbValidationError.
 *
 *   CM (Article 2, general): each line is taxed at the alicuota of its
 *                 jurisdiction, BUT the base is first distributed across
 *                 jurisdictions per `cmCoefficients`. Lines retain
 *                 their original activity code for rate lookup.
 *
 * This is the v0.1 surface — special CM regimes (art_6..art_13) are
 * not yet handled (they require different distribution rules per
 * article). Pass `cmRegime: "art_2_general"` upstream; passing any
 * other CM article throws.
 */
export function computeDdjj(args: ComputeDdjjArgs): DdjjResult {
  if (!/^\d{4}-\d{2}$/.test(args.period)) {
    throw new IibbValidationError("period", "must be YYYY-MM");
  }
  if (args.lines.length === 0) {
    return {
      period: args.period,
      regime: args.regime,
      filerCode: args.filerCode,
      totals: { baseCentavos: 0, taxDueCentavos: 0, lineCount: 0 },
      byJurisdiction: [],
      cmCoefficients: args.cmCoefficients,
    };
  }

  if (args.regime === "local") {
    return computeLocalDdjj(args);
  }
  return computeCmDdjj(args);
}

function computeLocalDdjj(args: ComputeDdjjArgs): DdjjResult {
  const jur = args.filerCode;
  for (const line of args.lines) {
    if (line.jurisdiction !== jur) {
      throw new IibbValidationError(
        "lines",
        `Local regime DDJJ for "${jur}" contains line in "${line.jurisdiction}". Switch to CM or remove cross-jurisdiction lines.`,
      );
    }
  }
  let totalBase = 0;
  let totalTax = 0;
  let weightedRateNumerator = 0;
  for (const line of args.lines) {
    const rate = args.rateBook.lookup(
      line.jurisdiction,
      line.activityCode,
      line.dateIso,
    );
    if (!rate) {
      throw new IibbRateNotFoundError(line.jurisdiction, line.activityCode);
    }
    totalBase += line.baseImponibleCentavos;
    totalTax += Math.round(line.baseImponibleCentavos * rate.rate);
    weightedRateNumerator += line.baseImponibleCentavos * rate.rate;
  }
  const weightedAlicuota = totalBase > 0 ? weightedRateNumerator / totalBase : 0;
  const summary: DdjjJurisdictionSummary = {
    jurisdiction: jur,
    authority: AUTHORITY_BY_JURISDICTION[jur],
    totalBaseCentavos: totalBase,
    weightedAlicuota,
    taxDueCentavos: totalTax,
    lineCount: args.lines.length,
  };
  return {
    period: args.period,
    regime: "local",
    filerCode: jur,
    totals: {
      baseCentavos: totalBase,
      taxDueCentavos: totalTax,
      lineCount: args.lines.length,
    },
    byJurisdiction: [summary],
  };
}

function computeCmDdjj(args: ComputeDdjjArgs): DdjjResult {
  if (!args.cmCoefficients) {
    throw new IibbValidationError(
      "cmCoefficients",
      "CM regime requires cmCoefficients (coeficiente unificado per jurisdiction)",
    );
  }
  const sumCoeff = Object.values(args.cmCoefficients).reduce(
    (a, b) => a + b,
    0,
  );
  if (Math.abs(sumCoeff - 1.0) > 0.001) {
    throw new IibbValidationError(
      "cmCoefficients",
      `must sum to 1.0; got ${sumCoeff.toFixed(4)}`,
    );
  }

  const totalBase = args.lines.reduce(
    (a, l) => a + l.baseImponibleCentavos,
    0,
  );
  const byJur = new Map<JurisdictionCode, DdjjJurisdictionSummary>();
  let totalTax = 0;
  let lineCount = 0;

  for (const [jurCode, coeff] of Object.entries(args.cmCoefficients)) {
    const jur = jurCode as JurisdictionCode;
    const apportionedBase = Math.round(totalBase * coeff);
    // For the alicuota we pick the rate of a representative activity in
    // this jurisdiction. v0.1 simplification: average rate across all
    // lines weighted by their base, capped to this jurisdiction's
    // rate-book entries.
    const linesForJur = args.lines.filter((l) => l.jurisdiction === jur);
    const linesAny = linesForJur.length > 0 ? linesForJur : args.lines;
    let rateNumerator = 0;
    let rateDenominator = 0;
    for (const line of linesAny) {
      const rate = args.rateBook.lookup(jur, line.activityCode, line.dateIso);
      if (!rate) {
        throw new IibbRateNotFoundError(jur, line.activityCode);
      }
      rateNumerator += line.baseImponibleCentavos * rate.rate;
      rateDenominator += line.baseImponibleCentavos;
    }
    const weightedAlicuota =
      rateDenominator > 0 ? rateNumerator / rateDenominator : 0;
    const taxDue = Math.round(apportionedBase * weightedAlicuota);
    totalTax += taxDue;
    lineCount += linesForJur.length;
    byJur.set(jur, {
      jurisdiction: jur,
      authority: AUTHORITY_BY_JURISDICTION[jur],
      totalBaseCentavos: apportionedBase,
      weightedAlicuota,
      taxDueCentavos: taxDue,
      lineCount: linesForJur.length,
    });
  }

  return {
    period: args.period,
    regime: "cm",
    filerCode: "CM",
    totals: {
      baseCentavos: totalBase,
      taxDueCentavos: totalTax,
      lineCount,
    },
    byJurisdiction: Array.from(byJur.values()),
    cmCoefficients: args.cmCoefficients,
  };
}

// ── Retention / perception ───────────────────────────────────────

export function calculateRetention(input: RetentionInput): RetentionResult {
  if (input.baseCentavos < 0) {
    throw new IibbValidationError("baseCentavos", "must be non-negative");
  }
  const threshold = input.minimumThresholdCentavos ?? 0;
  if (input.baseCentavos < threshold) {
    return {
      jurisdiction: input.jurisdiction,
      baseCentavos: input.baseCentavos,
      rate: input.overrideRate ?? 0,
      amountCentavos: 0,
      belowThreshold: true,
    };
  }
  const rate = input.overrideRate;
  if (rate === undefined) {
    throw new IibbValidationError(
      "overrideRate",
      "calculateRetention requires overrideRate in v0.1; load a rate-book and call via computeDdjj for activity-driven lookups",
    );
  }
  if (rate < 0 || rate > 1) {
    throw new IibbValidationError("overrideRate", "must be a fraction between 0 and 1");
  }
  return {
    jurisdiction: input.jurisdiction,
    baseCentavos: input.baseCentavos,
    rate,
    amountCentavos: Math.round(input.baseCentavos * rate),
    belowThreshold: false,
  };
}

export function calculatePerception(input: PerceptionInput): PerceptionResult {
  // v0.1 — symmetrical to retention. Some jurisdictions add a fixed
  // amount on top of the percentage; refine per jurisdiction as rate
  // books grow.
  return calculateRetention(input);
}
