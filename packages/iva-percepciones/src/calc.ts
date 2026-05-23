/**
 * Pure calculation primitives for IVA perceptions.
 *
 * The math is straightforward — a percepción doesn't have the
 * monthly accumulator nuance that Ganancias does. Per invoice:
 *
 *   if buyer has non-perception certificate → 0
 *   if buyer is exempt / monotributista / consumidor final → 0
 *   if net < mínimo → 0
 *   else: perception = net × rate
 *
 * Returns 0 with `waiverReason` populated when not perceiving (so the
 * caller can tell apart "we collected 0" from "we didn't apply").
 */
import type {
  PerceptionInput,
  PerceptionResult,
  IvaPerceptionRateEntry,
  IvaPerceptionRegime,
  BuyerIvaCondition,
  PerceptionDdjjArgs,
  PerceptionDdjjResult,
  PerceptionEntry,
} from "./types";
import { DEFAULT_RATE_TABLE } from "./tables";
import {
  IvaPerceptionRateNotFoundError,
  IvaPerceptionValidationError,
} from "./errors";

const CUIT_RE = /^\d{11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

function normalizeCuit(cuit: string): string {
  const clean = cuit.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new IvaPerceptionValidationError(
      "buyerCuit",
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

function findEntry(
  table: ReadonlyArray<IvaPerceptionRateEntry>,
  regime: IvaPerceptionRegime,
  buyerCondition: BuyerIvaCondition,
): IvaPerceptionRateEntry {
  const e = table.find(
    (entry) =>
      entry.regime === regime && entry.buyerCondition === buyerCondition,
  );
  if (!e) throw new IvaPerceptionRateNotFoundError(regime, buyerCondition);
  return e;
}

export function calculatePerception(input: PerceptionInput): PerceptionResult {
  if (input.netCentavos < 0) {
    throw new IvaPerceptionValidationError(
      "netCentavos",
      "must be non-negative",
    );
  }
  if (!DATE_RE.test(input.operationDate)) {
    throw new IvaPerceptionValidationError(
      "operationDate",
      "must be YYYY-MM-DD",
    );
  }
  const buyerCuit = normalizeCuit(input.buyerCuit);
  const table = input.rateTable ?? DEFAULT_RATE_TABLE;
  const entry = findEntry(table, input.regime, input.buyerCondition);

  // Certificate of non-perception trumps everything else.
  if (input.buyerHasNonPerceptionCertificate) {
    return {
      regime: input.regime,
      buyerCondition: input.buyerCondition,
      buyerCuit,
      operationDate: input.operationDate,
      netCentavos: input.netCentavos,
      minimumNetCentavos: entry.minimumNetCentavos,
      rate: 0,
      perceptionCentavos: 0,
      waiverReason: "non_perception_certificate",
    };
  }

  // Specific buyer conditions that always result in 0 perception.
  if (input.buyerCondition === "exento") {
    return {
      regime: input.regime,
      buyerCondition: input.buyerCondition,
      buyerCuit,
      operationDate: input.operationDate,
      netCentavos: input.netCentavos,
      minimumNetCentavos: entry.minimumNetCentavos,
      rate: 0,
      perceptionCentavos: 0,
      waiverReason: "exempt_buyer",
    };
  }
  if (input.buyerCondition === "consumidor_final") {
    return {
      regime: input.regime,
      buyerCondition: input.buyerCondition,
      buyerCuit,
      operationDate: input.operationDate,
      netCentavos: input.netCentavos,
      minimumNetCentavos: entry.minimumNetCentavos,
      rate: 0,
      perceptionCentavos: 0,
      waiverReason: "consumidor_final",
    };
  }

  // Below mínimo → no perception.
  if (input.netCentavos < entry.minimumNetCentavos) {
    return {
      regime: input.regime,
      buyerCondition: input.buyerCondition,
      buyerCuit,
      operationDate: input.operationDate,
      netCentavos: input.netCentavos,
      minimumNetCentavos: entry.minimumNetCentavos,
      rate: entry.rate,
      perceptionCentavos: 0,
      waiverReason: "below_minimum",
    };
  }

  // Apply rate.
  const perception = Math.round(input.netCentavos * entry.rate);
  return {
    regime: input.regime,
    buyerCondition: input.buyerCondition,
    buyerCuit,
    operationDate: input.operationDate,
    netCentavos: input.netCentavos,
    minimumNetCentavos: entry.minimumNetCentavos,
    rate: entry.rate,
    perceptionCentavos: perception,
  };
}

/** Quick-shot helper that returns just the perception amount. */
export function quickPerception(
  regime: IvaPerceptionRegime,
  buyerCondition: BuyerIvaCondition,
  netCentavos: number,
  options: {
    buyerCuit?: string;
    operationDate?: string;
    buyerHasNonPerceptionCertificate?: boolean;
  } = {},
): number {
  const r = calculatePerception({
    regime,
    buyerCondition,
    buyerCuit: options.buyerCuit ?? "20000000000",
    netCentavos,
    operationDate: options.operationDate ?? "2026-01-15",
    ...(options.buyerHasNonPerceptionCertificate !== undefined
      ? {
          buyerHasNonPerceptionCertificate:
            options.buyerHasNonPerceptionCertificate,
        }
      : {}),
  });
  return r.perceptionCentavos;
}

export function asEntry(
  comprobanteRef: string,
  perception: PerceptionResult,
): PerceptionEntry {
  return { comprobanteRef, perception };
}

export function buildPerceptionDdjj(
  args: PerceptionDdjjArgs,
): PerceptionDdjjResult {
  if (!PERIOD_RE.test(args.period)) {
    throw new IvaPerceptionValidationError("period", "must be YYYY-MM");
  }
  normalizeCuit(args.agentCuit);
  const byRegime = new Map<
    IvaPerceptionRegime,
    { netCentavos: number; perceptionCentavos: number; entryCount: number }
  >();
  const byBuyer = new Map<
    string,
    { netCentavos: number; perceptionCentavos: number; entryCount: number }
  >();
  let totalNet = 0;
  let totalPerc = 0;
  for (const e of args.entries) {
    totalNet += e.perception.netCentavos;
    totalPerc += e.perception.perceptionCentavos;
    const reg = e.perception.regime;
    const regRow = byRegime.get(reg) ?? {
      netCentavos: 0,
      perceptionCentavos: 0,
      entryCount: 0,
    };
    regRow.netCentavos += e.perception.netCentavos;
    regRow.perceptionCentavos += e.perception.perceptionCentavos;
    regRow.entryCount += 1;
    byRegime.set(reg, regRow);
    const buy = e.perception.buyerCuit;
    const buyRow = byBuyer.get(buy) ?? {
      netCentavos: 0,
      perceptionCentavos: 0,
      entryCount: 0,
    };
    buyRow.netCentavos += e.perception.netCentavos;
    buyRow.perceptionCentavos += e.perception.perceptionCentavos;
    buyRow.entryCount += 1;
    byBuyer.set(buy, buyRow);
  }
  return {
    period: args.period,
    agentCuit: args.agentCuit.replace(/-/g, ""),
    totals: {
      netCentavos: totalNet,
      perceptionCentavos: totalPerc,
      entryCount: args.entries.length,
    },
    byRegime: Array.from(byRegime.entries()).map(([regime, v]) => ({
      regime,
      ...v,
    })),
    byBuyer: Array.from(byBuyer.entries())
      .map(([buyerCuit, v]) => ({ buyerCuit, ...v }))
      .sort((a, b) => b.perceptionCentavos - a.perceptionCentavos),
    entries: args.entries,
  };
}
