/**
 * Pure calculation primitives for SICORE / Ganancias retentions.
 *
 * The math is deterministic and offline. Given an input + a rate table,
 * `calculateRetention` returns exactly what AFIP expects on the
 * comprobante de retención.
 *
 * Two important nuances of RG 830/00:
 *
 *   1. ACUMULADO. The retention applies to the MONTHLY ACCUMULATED
 *      amount paid to the same supplier — not to a single invoice.
 *      The first payment of the month often retains $0 (under the
 *      mínimo), and later payments retain the catch-up.
 *
 *   2. NETO YA RETENIDO. The retention amount for this payment equals
 *      the theoretical retention on the accumulated minus retentions
 *      already practiced this month. This way the cumulative retained
 *      always matches the cumulative theoretical, even when monthly
 *      payments straddle the threshold.
 *
 * If you skip these two rules, you'll over-retain on big single
 * payments and under-retain when payments straddle the threshold.
 */
import type {
  RetentionInput,
  RetentionResult,
  SicoreRateEntry,
  SupplierStatus,
  SicoreCategory,
  SicoreDdjjArgs,
  SicoreDdjjResult,
  SicoreEntry,
} from "./types";
import { DEFAULT_RATE_TABLE } from "./tables";
import { SicoreRateNotFoundError, SicoreValidationError } from "./errors";

const CUIT_RE = /^\d{11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

function normalizeCuit(cuit: string): string {
  const clean = cuit.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new SicoreValidationError(
      "supplierCuit",
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

function findEntry(
  table: ReadonlyArray<SicoreRateEntry>,
  category: SicoreCategory,
  status: SupplierStatus,
): SicoreRateEntry {
  const e = table.find(
    (entry) => entry.category === category && entry.status === status,
  );
  if (!e) throw new SicoreRateNotFoundError(category, status);
  return e;
}

/**
 * Apply a progressive scale to an excedente (amount above the
 * mínimo). Each scale step adds `fixed + rate × (overlap with that
 * step)`. The result is the total theoretical retention on the
 * excedente.
 */
function applyScale(
  excedente: number,
  scale: ReadonlyArray<{ upToCentavos: number; rate: number; fixedCentavos: number }>,
): number {
  // Find the step the excedente falls into.
  let prevUpper = 0;
  for (const step of scale) {
    if (excedente <= step.upToCentavos) {
      const overlap = excedente - prevUpper;
      return step.fixedCentavos + Math.round(overlap * step.rate);
    }
    prevUpper = step.upToCentavos;
  }
  // Fell off the end of the scale (shouldn't happen if the table ends
  // with Infinity, but guard anyway).
  const top = scale[scale.length - 1]!;
  const overlap = excedente - prevUpper;
  return top.fixedCentavos + Math.round(overlap * top.rate);
}

/**
 * Calculate the SICORE retention for a single payment.
 *
 * The math:
 *   accumulated_after = accumulated_before_today + payment
 *   excedente = max(accumulated_after - mínimo, 0)
 *   theoretical_retention = scale ? applyScale(excedente) : excedente × rate
 *   retention_today = theoretical_retention - already_retained_this_month
 *
 * If `status` is "exento", retention is always 0.
 * If `accumulated_after < mínimo`, retention is 0 (below threshold).
 */
export function calculateRetention(input: RetentionInput): RetentionResult {
  if (input.paymentCentavos < 0) {
    throw new SicoreValidationError("paymentCentavos", "must be non-negative");
  }
  if ((input.accumulatedMonthCentavos ?? 0) < 0) {
    throw new SicoreValidationError(
      "accumulatedMonthCentavos",
      "must be non-negative",
    );
  }
  if ((input.alreadyRetainedThisMonthCentavos ?? 0) < 0) {
    throw new SicoreValidationError(
      "alreadyRetainedThisMonthCentavos",
      "must be non-negative",
    );
  }
  if (!DATE_RE.test(input.paymentDate)) {
    throw new SicoreValidationError("paymentDate", "must be YYYY-MM-DD");
  }

  const supplierCuit = normalizeCuit(input.supplierCuit);
  const table = input.rateTable ?? DEFAULT_RATE_TABLE;
  const entry = findEntry(table, input.category, input.status);

  const accumulatedBefore = input.accumulatedMonthCentavos ?? 0;
  const alreadyRetained = input.alreadyRetainedThisMonthCentavos ?? 0;
  const accumulatedAfter = accumulatedBefore + input.paymentCentavos;

  // Exento: zero retention regardless of amounts.
  if (input.status === "exento") {
    return {
      category: input.category,
      status: input.status,
      supplierCuit,
      paymentDate: input.paymentDate,
      paymentCentavos: input.paymentCentavos,
      accumulatedAfterPaymentCentavos: accumulatedAfter,
      minimumMonthlyCentavos: entry.minimumMonthlyCentavos,
      effectiveRate: 0,
      theoreticalRetentionCentavos: 0,
      alreadyRetainedThisMonthCentavos: alreadyRetained,
      retentionAmountCentavos: 0,
      waiverReason: "exento_certificate",
    };
  }

  // Below mínimo: zero retention.
  if (accumulatedAfter <= entry.minimumMonthlyCentavos) {
    return {
      category: input.category,
      status: input.status,
      supplierCuit,
      paymentDate: input.paymentDate,
      paymentCentavos: input.paymentCentavos,
      accumulatedAfterPaymentCentavos: accumulatedAfter,
      minimumMonthlyCentavos: entry.minimumMonthlyCentavos,
      effectiveRate: 0,
      theoreticalRetentionCentavos: 0,
      alreadyRetainedThisMonthCentavos: alreadyRetained,
      retentionAmountCentavos: 0,
      waiverReason: "below_minimum",
    };
  }

  const excedente = accumulatedAfter - entry.minimumMonthlyCentavos;
  let theoretical: number;
  let effectiveRate: number;
  if (entry.scale && entry.scale.length > 0) {
    theoretical = applyScale(excedente, entry.scale);
    effectiveRate = excedente > 0 ? theoretical / excedente : 0;
  } else if (entry.flatRate !== undefined) {
    theoretical = Math.round(excedente * entry.flatRate);
    effectiveRate = entry.flatRate;
  } else {
    throw new SicoreValidationError(
      "rateTable",
      `entry for ${input.category}/${input.status} has neither flatRate nor scale`,
    );
  }

  const retentionToday = Math.max(0, theoretical - alreadyRetained);

  return {
    category: input.category,
    status: input.status,
    supplierCuit,
    paymentDate: input.paymentDate,
    paymentCentavos: input.paymentCentavos,
    accumulatedAfterPaymentCentavos: accumulatedAfter,
    minimumMonthlyCentavos: entry.minimumMonthlyCentavos,
    effectiveRate,
    theoreticalRetentionCentavos: theoretical,
    alreadyRetainedThisMonthCentavos: alreadyRetained,
    retentionAmountCentavos: retentionToday,
    ...(retentionToday === 0 && theoretical > 0
      ? { waiverReason: "already_satisfied" as const }
      : {}),
  };
}

/**
 * Walk through a chronological stream of payments to the SAME supplier
 * and return one RetentionResult per payment, with the accumulator
 * advancing automatically. Use this when you have a flat list of
 * payments and don't want to bookkeep the running totals yourself.
 */
export function calculateRetentionStream(
  payments: ReadonlyArray<{
    category: SicoreCategory;
    status: SupplierStatus;
    supplierCuit: string;
    paymentCentavos: number;
    paymentDate: string;
  }>,
  rateTable?: ReadonlyArray<SicoreRateEntry>,
): RetentionResult[] {
  if (payments.length === 0) return [];
  const supplier = normalizeCuit(payments[0]!.supplierCuit);
  const month = payments[0]!.paymentDate.slice(0, 7);
  for (const p of payments) {
    if (normalizeCuit(p.supplierCuit) !== supplier) {
      throw new SicoreValidationError(
        "payments",
        "calculateRetentionStream expects a stream for ONE supplier; got multiple CUITs. Group by supplier first.",
      );
    }
    if (p.paymentDate.slice(0, 7) !== month) {
      throw new SicoreValidationError(
        "payments",
        "calculateRetentionStream expects a stream within ONE calendar month; got multiple periods.",
      );
    }
  }
  let accumulated = 0;
  let retained = 0;
  const out: RetentionResult[] = [];
  // Process in date order to make the result deterministic.
  const sorted = [...payments].sort((a, b) =>
    a.paymentDate.localeCompare(b.paymentDate),
  );
  for (const p of sorted) {
    const r = calculateRetention({
      category: p.category,
      status: p.status,
      supplierCuit: p.supplierCuit,
      paymentCentavos: p.paymentCentavos,
      paymentDate: p.paymentDate,
      accumulatedMonthCentavos: accumulated,
      alreadyRetainedThisMonthCentavos: retained,
      ...(rateTable ? { rateTable } : {}),
    });
    accumulated += p.paymentCentavos;
    retained += r.retentionAmountCentavos;
    out.push(r);
  }
  return out;
}

// ── Monthly DDJJ aggregation ────────────────────────────────────

export function buildSicoreDdjj(args: SicoreDdjjArgs): SicoreDdjjResult {
  if (!PERIOD_RE.test(args.period)) {
    throw new SicoreValidationError("period", "must be YYYY-MM");
  }
  normalizeCuit(args.agentCuit);
  const byCat = new Map<
    SicoreCategory,
    { paymentCentavos: number; retentionCentavos: number; entryCount: number }
  >();
  const bySupplier = new Map<
    string,
    { paymentCentavos: number; retentionCentavos: number; entryCount: number }
  >();
  let totalPayment = 0;
  let totalRet = 0;
  for (const e of args.entries) {
    totalPayment += e.retention.paymentCentavos;
    totalRet += e.retention.retentionAmountCentavos;
    const cat = e.retention.category;
    const catRow = byCat.get(cat) ?? {
      paymentCentavos: 0,
      retentionCentavos: 0,
      entryCount: 0,
    };
    catRow.paymentCentavos += e.retention.paymentCentavos;
    catRow.retentionCentavos += e.retention.retentionAmountCentavos;
    catRow.entryCount += 1;
    byCat.set(cat, catRow);
    const sup = e.retention.supplierCuit;
    const supRow = bySupplier.get(sup) ?? {
      paymentCentavos: 0,
      retentionCentavos: 0,
      entryCount: 0,
    };
    supRow.paymentCentavos += e.retention.paymentCentavos;
    supRow.retentionCentavos += e.retention.retentionAmountCentavos;
    supRow.entryCount += 1;
    bySupplier.set(sup, supRow);
  }
  return {
    period: args.period,
    agentCuit: args.agentCuit.replace(/-/g, ""),
    totals: {
      paymentCentavos: totalPayment,
      retentionCentavos: totalRet,
      entryCount: args.entries.length,
    },
    byCategory: Array.from(byCat.entries()).map(([category, v]) => ({
      category,
      ...v,
    })),
    bySupplier: Array.from(bySupplier.entries())
      .map(([supplierCuit, v]) => ({ supplierCuit, ...v }))
      .sort((a, b) => b.retentionCentavos - a.retentionCentavos),
    entries: args.entries,
  };
}

/** Convenience: pure helper to skip the typed input boilerplate. */
export function quickRetention(
  category: SicoreCategory,
  status: SupplierStatus,
  paymentCentavos: number,
  options: {
    supplierCuit?: string;
    paymentDate?: string;
    accumulatedMonthCentavos?: number;
    alreadyRetainedThisMonthCentavos?: number;
  } = {},
): number {
  const r = calculateRetention({
    category,
    status,
    supplierCuit: options.supplierCuit ?? "20000000000",
    paymentCentavos,
    paymentDate: options.paymentDate ?? "2026-01-15",
    ...(options.accumulatedMonthCentavos !== undefined
      ? { accumulatedMonthCentavos: options.accumulatedMonthCentavos }
      : {}),
    ...(options.alreadyRetainedThisMonthCentavos !== undefined
      ? { alreadyRetainedThisMonthCentavos: options.alreadyRetainedThisMonthCentavos }
      : {}),
  });
  return r.retentionAmountCentavos;
}

// Export a helper to assemble a SicoreEntry from a calc result.
export function asEntry(
  comprobanteRef: string,
  retention: RetentionResult,
): SicoreEntry {
  return { comprobanteRef, retention };
}
