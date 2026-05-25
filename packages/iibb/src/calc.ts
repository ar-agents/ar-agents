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
  CmRegime,
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
  /** CM-only: which article governs the apportionment. Defaults to
   * `art_2_general`. Articles 6 (construction), 8 (transport), and 9
   * (professional services) are supported as of v0.3; the others are
   * stubbed with explanatory errors. */
  cmArticle?: CmRegime | undefined;
  /** CM-only: jurisdiction of the corporate seat (administración
   * principal). Required for Articles 6 and 9, where a fraction of the
   * tax base is attributed to the seat regardless of where revenue was
   * realized. */
  seatJurisdiction?: JurisdictionCode | undefined;
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
  const article = args.cmArticle ?? "art_2_general";
  switch (article) {
    case "art_2_general":
      return computeCmDdjj(args);
    case "art_6_construction":
      return computeCmArticle6Construction(args);
    case "art_8_transport":
      return computeCmArticle8Transport(args);
    case "art_9_professional_services":
      return computeCmArticle9ProfessionalServices(args);
    case "art_7_insurance":
    case "art_10_intermediaries":
    case "art_11_grain":
    case "art_12_finance":
    case "art_13_agro_industrial":
      throw new IibbValidationError(
        "cmArticle",
        `CM Article ${article.split("_")[1] ?? "?"} is recognized but not implemented in v0.3. The general framework (lines + cmCoefficients) does not cleanly model this regime — it needs per-article inputs (premium amounts for insurance, origin/destination for intermediaries, storage volumes for grain, etc.). Compute the apportionment off-package and feed a synthetic local DDJJ per jurisdiction.`,
      );
    default:
      throw new IibbValidationError("cmArticle", `Unknown CM article: ${article}`);
  }
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

// ── CM Article 6 — Construction ──────────────────────────────────
//
// Distribution: 10% to the seat jurisdiction, 90% prorated across the
// jurisdictions where construction work was performed (line.workJurisdiction,
// falling back to line.jurisdiction). Rate for each jurisdiction is the
// weighted average of the lines actually realized in it, computed against
// that jurisdiction's rate-book entries.

function computeCmArticle6Construction(args: ComputeDdjjArgs): DdjjResult {
  if (!args.seatJurisdiction) {
    throw new IibbValidationError(
      "seatJurisdiction",
      "CM Article 6 (construction) requires seatJurisdiction (10% of base goes to the corporate seat).",
    );
  }
  return apportionFixedSplit(args, {
    seatShare: 0.1,
    perJurisdiction: lineToWorkJurisdiction,
    label: "art_6_construction",
  });
}

// ── CM Article 8 — Transport ─────────────────────────────────────
//
// Distribution: 100% to the trip's origin jurisdiction
// (line.originJurisdiction, falling back to line.jurisdiction). No seat
// component. Coefficients are not used.

function computeCmArticle8Transport(args: ComputeDdjjArgs): DdjjResult {
  const totalBase = args.lines.reduce(
    (a, l) => a + l.baseImponibleCentavos,
    0,
  );
  const grouped = new Map<JurisdictionCode, IngresoLine[]>();
  for (const line of args.lines) {
    const origin = line.originJurisdiction ?? line.jurisdiction;
    const arr = grouped.get(origin) ?? [];
    arr.push(line);
    grouped.set(origin, arr);
  }

  const byJur: DdjjJurisdictionSummary[] = [];
  let totalTax = 0;
  for (const [jur, lines] of grouped) {
    let base = 0;
    let rateNum = 0;
    for (const line of lines) {
      const rate = args.rateBook.lookup(jur, line.activityCode, line.dateIso);
      if (!rate) throw new IibbRateNotFoundError(jur, line.activityCode);
      base += line.baseImponibleCentavos;
      rateNum += line.baseImponibleCentavos * rate.rate;
    }
    const weightedAlicuota = base > 0 ? rateNum / base : 0;
    const taxDue = Math.round(base * weightedAlicuota);
    totalTax += taxDue;
    byJur.push({
      jurisdiction: jur,
      authority: AUTHORITY_BY_JURISDICTION[jur],
      totalBaseCentavos: base,
      weightedAlicuota,
      taxDueCentavos: taxDue,
      lineCount: lines.length,
    });
  }

  return {
    period: args.period,
    regime: "cm",
    filerCode: "CM",
    totals: { baseCentavos: totalBase, taxDueCentavos: totalTax, lineCount: args.lines.length },
    byJurisdiction: byJur,
  };
}

// ── CM Article 9 — Professional services ─────────────────────────
//
// Distribution: 20% to the seat jurisdiction, 80% prorated across the
// jurisdictions where the service was rendered (line.jurisdiction).
// Per Comisión Arbitral resolutions, the 80% pool is split by the gross
// income realized in each jurisdiction (i.e. the line base, not a
// pre-computed coefficient).

function computeCmArticle9ProfessionalServices(args: ComputeDdjjArgs): DdjjResult {
  if (!args.seatJurisdiction) {
    throw new IibbValidationError(
      "seatJurisdiction",
      "CM Article 9 (professional services) requires seatJurisdiction (20% of base goes to the corporate seat).",
    );
  }
  return apportionFixedSplit(args, {
    seatShare: 0.2,
    perJurisdiction: (line) => line.jurisdiction,
    label: "art_9_professional_services",
  });
}

// ── Shared helper: split base into (seatShare → seat, 1-seatShare → prorated)

interface FixedSplitArgs {
  seatShare: number;
  perJurisdiction: (line: IngresoLine) => JurisdictionCode;
  label: string;
}

function lineToWorkJurisdiction(line: IngresoLine): JurisdictionCode {
  return line.workJurisdiction ?? line.jurisdiction;
}

function apportionFixedSplit(
  args: ComputeDdjjArgs,
  split: FixedSplitArgs,
): DdjjResult {
  const seat = args.seatJurisdiction!;
  const totalBase = args.lines.reduce(
    (a, l) => a + l.baseImponibleCentavos,
    0,
  );
  // Seat slice (deterministic floor for the seat; the remainder
  // becomes the pool to prorate so total is conserved).
  const seatBase = Math.round(totalBase * split.seatShare);
  const poolBase = totalBase - seatBase;

  // Pool: prorate by per-jurisdiction line totals.
  const lineBaseByJur = new Map<JurisdictionCode, { base: number; lines: IngresoLine[] }>();
  for (const line of args.lines) {
    const jur = split.perJurisdiction(line);
    const entry = lineBaseByJur.get(jur) ?? { base: 0, lines: [] };
    entry.base += line.baseImponibleCentavos;
    entry.lines.push(line);
    lineBaseByJur.set(jur, entry);
  }

  // Build per-jurisdiction summaries. The seat jurisdiction sums its
  // poolBase share (if it also realized income) AND its seat allocation.
  const summaries = new Map<JurisdictionCode, DdjjJurisdictionSummary>();
  let totalTax = 0;
  let totalLines = 0;

  const poolDenominator = totalBase > 0 ? totalBase : 1;
  for (const [jur, info] of lineBaseByJur) {
    const apportionedFromPool = Math.round(
      (poolBase * info.base) / poolDenominator,
    );
    let rateNum = 0;
    let rateDen = 0;
    for (const line of info.lines) {
      const rate = args.rateBook.lookup(jur, line.activityCode, line.dateIso);
      if (!rate) throw new IibbRateNotFoundError(jur, line.activityCode);
      rateNum += line.baseImponibleCentavos * rate.rate;
      rateDen += line.baseImponibleCentavos;
    }
    const weightedAlicuota = rateDen > 0 ? rateNum / rateDen : 0;
    const taxDue = Math.round(apportionedFromPool * weightedAlicuota);
    totalTax += taxDue;
    totalLines += info.lines.length;
    summaries.set(jur, {
      jurisdiction: jur,
      authority: AUTHORITY_BY_JURISDICTION[jur],
      totalBaseCentavos: apportionedFromPool,
      weightedAlicuota,
      taxDueCentavos: taxDue,
      lineCount: info.lines.length,
    });
  }

  // Now add the seat slice. The seat rate uses the seat's representative
  // rate, which we compute via the seat-jurisdiction rate-book entries
  // for the most-common activity code in `lines`. If no rate-book entry
  // exists in the seat for the line's activity, this throws.
  const repActivity =
    [...args.lines]
      .sort(
        (a, b) =>
          b.baseImponibleCentavos - a.baseImponibleCentavos,
      )[0]?.activityCode ?? args.lines[0]?.activityCode;
  if (!repActivity) {
    throw new IibbValidationError(
      "lines",
      `CM ${split.label} requires at least one income line.`,
    );
  }
  const seatRate = args.rateBook.lookup(seat, repActivity);
  if (!seatRate) {
    throw new IibbRateNotFoundError(seat, repActivity);
  }
  const seatTax = Math.round(seatBase * seatRate.rate);
  totalTax += seatTax;
  const existingSeat = summaries.get(seat);
  if (existingSeat) {
    summaries.set(seat, {
      ...existingSeat,
      totalBaseCentavos: existingSeat.totalBaseCentavos + seatBase,
      // Weighted alicuota stays the income-weighted average across the
      // seat's lines; the seat slice itself was taxed at seatRate.rate.
      // For an informational field this is acceptable; the taxDueCentavos
      // is correctly summed.
      taxDueCentavos: existingSeat.taxDueCentavos + seatTax,
    });
  } else {
    summaries.set(seat, {
      jurisdiction: seat,
      authority: AUTHORITY_BY_JURISDICTION[seat],
      totalBaseCentavos: seatBase,
      weightedAlicuota: seatRate.rate,
      taxDueCentavos: seatTax,
      lineCount: 0,
    });
  }

  return {
    period: args.period,
    regime: "cm",
    filerCode: "CM",
    totals: {
      baseCentavos: totalBase,
      taxDueCentavos: totalTax,
      lineCount: totalLines,
    },
    byJurisdiction: Array.from(summaries.values()),
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
