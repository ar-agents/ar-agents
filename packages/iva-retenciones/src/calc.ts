/**
 * Pure calculation primitives for IVA retentions.
 *
 * The math is direct (no monthly accumulator like SICORE):
 *
 *   if supplier has non-retention certificate → 0
 *   if supplierStatus is exento / monotributista → 0
 *   if ivaCentavos < mínimo → 0
 *   else: retention = ivaCentavos × rate (rounded)
 *
 * Returns 0 with `waiverReason` populated when not retaining, so the
 * caller can tell apart "we collected 0" from "we didn't apply".
 */
import type {
  RetentionInput,
  RetentionResult,
  IvaRetentionRateEntry,
  IvaRetentionRegime,
  IvaOperationType,
  SupplierStatus,
  RetentionDdjjArgs,
  RetentionDdjjResult,
  RetentionEntry,
} from "./types";
import { DEFAULT_RATE_TABLE } from "./tables";
import {
  IvaRetentionRateNotFoundError,
  IvaRetentionValidationError,
} from "./errors";

const CUIT_RE = /^\d{11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

function normalizeCuit(cuit: string): string {
  const clean = cuit.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new IvaRetentionValidationError(
      "supplierCuit",
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

function findEntry(
  table: ReadonlyArray<IvaRetentionRateEntry>,
  regime: IvaRetentionRegime,
  operationType: IvaOperationType,
  supplierStatus: SupplierStatus,
): IvaRetentionRateEntry {
  const e = table.find(
    (entry) =>
      entry.regime === regime &&
      entry.operationType === operationType &&
      entry.supplierStatus === supplierStatus,
  );
  if (!e) {
    throw new IvaRetentionRateNotFoundError(
      regime,
      operationType,
      supplierStatus,
    );
  }
  return e;
}

export function calculateRetention(input: RetentionInput): RetentionResult {
  if (input.ivaCentavos < 0) {
    throw new IvaRetentionValidationError(
      "ivaCentavos",
      "must be non-negative",
    );
  }
  if (!DATE_RE.test(input.paymentDate)) {
    throw new IvaRetentionValidationError("paymentDate", "must be YYYY-MM-DD");
  }
  const supplierCuit = normalizeCuit(input.supplierCuit);
  const table = input.rateTable ?? DEFAULT_RATE_TABLE;
  const entry = findEntry(
    table,
    input.regime,
    input.operationType,
    input.supplierStatus,
  );

  // Certificate trumps everything.
  if (input.supplierHasNonRetentionCertificate) {
    return {
      regime: input.regime,
      operationType: input.operationType,
      supplierStatus: input.supplierStatus,
      supplierCuit,
      paymentDate: input.paymentDate,
      ivaCentavos: input.ivaCentavos,
      minimumIvaCentavos: entry.minimumIvaCentavos,
      rate: 0,
      retentionCentavos: 0,
      waiverReason: "non_retention_certificate",
    };
  }

  if (input.supplierStatus === "exento") {
    return {
      regime: input.regime,
      operationType: input.operationType,
      supplierStatus: input.supplierStatus,
      supplierCuit,
      paymentDate: input.paymentDate,
      ivaCentavos: input.ivaCentavos,
      minimumIvaCentavos: entry.minimumIvaCentavos,
      rate: 0,
      retentionCentavos: 0,
      waiverReason: "exempt_supplier",
    };
  }
  if (input.supplierStatus === "monotributista") {
    return {
      regime: input.regime,
      operationType: input.operationType,
      supplierStatus: input.supplierStatus,
      supplierCuit,
      paymentDate: input.paymentDate,
      ivaCentavos: input.ivaCentavos,
      minimumIvaCentavos: entry.minimumIvaCentavos,
      rate: 0,
      retentionCentavos: 0,
      waiverReason: "monotributista",
    };
  }

  if (input.ivaCentavos < entry.minimumIvaCentavos) {
    return {
      regime: input.regime,
      operationType: input.operationType,
      supplierStatus: input.supplierStatus,
      supplierCuit,
      paymentDate: input.paymentDate,
      ivaCentavos: input.ivaCentavos,
      minimumIvaCentavos: entry.minimumIvaCentavos,
      rate: entry.rate,
      retentionCentavos: 0,
      waiverReason: "below_minimum",
    };
  }

  const retention = Math.round(input.ivaCentavos * entry.rate);
  return {
    regime: input.regime,
    operationType: input.operationType,
    supplierStatus: input.supplierStatus,
    supplierCuit,
    paymentDate: input.paymentDate,
    ivaCentavos: input.ivaCentavos,
    minimumIvaCentavos: entry.minimumIvaCentavos,
    rate: entry.rate,
    retentionCentavos: retention,
  };
}

export function quickRetention(
  regime: IvaRetentionRegime,
  operationType: IvaOperationType,
  supplierStatus: SupplierStatus,
  ivaCentavos: number,
  options: {
    supplierCuit?: string;
    paymentDate?: string;
    supplierHasNonRetentionCertificate?: boolean;
  } = {},
): number {
  const r = calculateRetention({
    regime,
    operationType,
    supplierStatus,
    supplierCuit: options.supplierCuit ?? "20000000000",
    ivaCentavos,
    paymentDate: options.paymentDate ?? "2026-01-15",
    ...(options.supplierHasNonRetentionCertificate !== undefined
      ? {
          supplierHasNonRetentionCertificate:
            options.supplierHasNonRetentionCertificate,
        }
      : {}),
  });
  return r.retentionCentavos;
}

export function asEntry(
  comprobanteRef: string,
  retention: RetentionResult,
): RetentionEntry {
  return { comprobanteRef, retention };
}

export function buildRetentionDdjj(
  args: RetentionDdjjArgs,
): RetentionDdjjResult {
  if (!PERIOD_RE.test(args.period)) {
    throw new IvaRetentionValidationError("period", "must be YYYY-MM");
  }
  normalizeCuit(args.agentCuit);
  const byRegime = new Map<
    IvaRetentionRegime,
    { ivaCentavos: number; retentionCentavos: number; entryCount: number }
  >();
  const bySupplier = new Map<
    string,
    { ivaCentavos: number; retentionCentavos: number; entryCount: number }
  >();
  let totalIva = 0;
  let totalRet = 0;
  for (const e of args.entries) {
    totalIva += e.retention.ivaCentavos;
    totalRet += e.retention.retentionCentavos;
    const reg = e.retention.regime;
    const regRow = byRegime.get(reg) ?? {
      ivaCentavos: 0,
      retentionCentavos: 0,
      entryCount: 0,
    };
    regRow.ivaCentavos += e.retention.ivaCentavos;
    regRow.retentionCentavos += e.retention.retentionCentavos;
    regRow.entryCount += 1;
    byRegime.set(reg, regRow);
    const sup = e.retention.supplierCuit;
    const supRow = bySupplier.get(sup) ?? {
      ivaCentavos: 0,
      retentionCentavos: 0,
      entryCount: 0,
    };
    supRow.ivaCentavos += e.retention.ivaCentavos;
    supRow.retentionCentavos += e.retention.retentionCentavos;
    supRow.entryCount += 1;
    bySupplier.set(sup, supRow);
  }
  return {
    period: args.period,
    agentCuit: args.agentCuit.replace(/-/g, ""),
    totals: {
      ivaCentavos: totalIva,
      retentionCentavos: totalRet,
      entryCount: args.entries.length,
    },
    byRegime: Array.from(byRegime.entries()).map(([regime, v]) => ({
      regime,
      ...v,
    })),
    bySupplier: Array.from(bySupplier.entries())
      .map(([supplierCuit, v]) => ({ supplierCuit, ...v }))
      .sort((a, b) => b.retentionCentavos - a.retentionCentavos),
    entries: args.entries,
  };
}
