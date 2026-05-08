/**
 * `@ar-agents/banking/testing` — fixtures + mock BCRA adapters for tests.
 *
 * What you get:
 *
 *   - **`MockBcraDeudaAdapter`** — drop-in for `BcraDeudaAdapter`. Seed CUIT
 *     → BcraDeudaResult mappings; `.calls` records every lookup.
 *
 *   - **`MockBcraVarsAdapter`** — drop-in for `BcraVarsAdapter`. Seed the
 *     variable catalog + per-variable time series.
 *
 *   - **Factories** for the result shapes: `mockBcraDeudaClean` (al día),
 *     `mockBcraDeudaRiesgo` (situation 2-6), `mockBcraDeudaUnavailable`,
 *     plus `mockBcraVariable`, `mockUsdOficialSeries`, `mockCerSeries`.
 *
 * The 4 algorithm-only banking tools (`validate_cbu`, `lookup_bank_by_code`,
 * `list_banks`, `list_psps`) don't need mocks — they're pure functions.
 */

import type { BcraDeudaAdapter } from "./bcra";
import type {
  BcraVarsAdapter,
  BcraVariable,
  BcraVariableDatapoint,
} from "./bcra-vars";
import type {
  BcraDeudaResult,
  BcraDeudaData,
  BcraDebtEntity,
  BcraSituation,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// BcraDeuda factories
// ─────────────────────────────────────────────────────────────────────────────

const ymPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Clean record — taxpayer al día, situation 1, low debt. */
export function mockBcraDeudaClean(
  overrides: { cuit?: string; name?: string; totalAmount?: number } = {},
): BcraDeudaResult {
  const cuit = (overrides.cuit ?? "20123456789").replace(/[^\d]/g, "");
  const total = overrides.totalAmount ?? 100_000;
  const data: BcraDeudaData = {
    name: overrides.name ?? "Test Persona Clean",
    period: ymPeriod(),
    worstSituation: 1,
    totalAmount: total,
    entities: [
      {
        entity: "BANCO DE GALICIA Y BUENOS AIRES S.A.U.",
        situation: 1,
        amount: total,
        daysOverdue: 0,
        refinanced: false,
        inReview: false,
        inLitigation: false,
      } as BcraDebtEntity,
    ],
  };
  return { cuit, available: true, error: null, data };
}

/** Risky record — situation N (default 3 — riesgo medio). */
export function mockBcraDeudaRiesgo(
  args: {
    cuit?: string;
    name?: string;
    situation?: BcraSituation;
    daysOverdue?: number;
    amount?: number;
  } = {},
): BcraDeudaResult {
  const cuit = (args.cuit ?? "20987654321").replace(/[^\d]/g, "");
  const situation = args.situation ?? 3;
  const amount = args.amount ?? 5_000_000;
  const data: BcraDeudaData = {
    name: args.name ?? "Test Persona Risky",
    period: ymPeriod(),
    worstSituation: situation,
    totalAmount: amount,
    entities: [
      {
        entity: "BANCO DE LA NACION ARGENTINA",
        situation,
        amount,
        daysOverdue: args.daysOverdue ?? 120,
        refinanced: false,
        inReview: false,
        inLitigation: false,
      } as BcraDebtEntity,
    ],
  };
  return { cuit, available: true, error: null, data };
}

/** No record / service down. */
export function mockBcraDeudaUnavailable(
  cuit = "20999999999",
  reason = "El CUIT consultado no tiene antecedentes crediticios en el sistema financiero.",
): BcraDeudaResult {
  return { cuit, available: false, error: reason, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MockBcraDeudaAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class MockBcraDeudaAdapter implements BcraDeudaAdapter {
  private readonly store = new Map<string, BcraDeudaResult>();
  /** Append-only log of every lookup call. */
  readonly calls: string[] = [];

  seed(cuit: string, result: BcraDeudaResult): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, { ...result, cuit: normalized });
    return this;
  }

  seedMany(entries: Record<string, BcraDeudaResult>): this {
    for (const [cuit, result] of Object.entries(entries)) {
      this.seed(cuit, result);
    }
    return this;
  }

  reset(): this {
    this.calls.length = 0;
    return this;
  }

  clear(): this {
    this.store.clear();
    this.calls.length = 0;
    return this;
  }

  async lookup(cuit: string): Promise<BcraDeudaResult> {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.calls.push(normalized);
    const seeded = this.store.get(normalized);
    if (seeded) return seeded;
    return {
      cuit: normalized,
      available: false,
      error: `MockBcraDeudaAdapter: no seeded result for CUIT ${normalized}.`,
      data: null,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BcraVars factories
// ─────────────────────────────────────────────────────────────────────────────

/** A single time-series datapoint. */
export function mockBcraDatapoint(date: string, value: number): BcraVariableDatapoint {
  return { fecha: date, valor: value };
}

/** A flat "USD oficial = N today" series. */
export function mockUsdOficialSeries(value = 1000): BcraVariableDatapoint[] {
  const today = new Date().toISOString().slice(0, 10);
  return [mockBcraDatapoint(today, value)];
}

/** A 30-day CER series with monthly inflation rate `growth` (default 5%). */
export function mockCerSeries(start = 100, growth = 0.05, days = 30): BcraVariableDatapoint[] {
  const out: BcraVariableDatapoint[] = [];
  const base = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const v = start * (1 + growth) ** ((days - 1 - i) / 30);
    out.push(mockBcraDatapoint(d.toISOString().slice(0, 10), Number(v.toFixed(4))));
  }
  return out;
}

const DEFAULT_VARIABLES: BcraVariable[] = [
  { idVariable: 4, descripcion: "Tipo de cambio oficial USD/ARS", valor: 1000, fecha: new Date().toISOString().slice(0, 10) },
  { idVariable: 30, descripcion: "CER (Coeficiente de Estabilización de Referencia)", valor: 200, fecha: new Date().toISOString().slice(0, 10) },
  { idVariable: 31, descripcion: "UVA (Unidad de Valor Adquisitivo)", valor: 1700, fecha: new Date().toISOString().slice(0, 10) },
  { idVariable: 1, descripcion: "Reservas internacionales del BCRA", valor: 26000, fecha: new Date().toISOString().slice(0, 10) },
];

// ─────────────────────────────────────────────────────────────────────────────
// MockBcraVarsAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class MockBcraVarsAdapter implements BcraVarsAdapter {
  private variables: BcraVariable[] = [...DEFAULT_VARIABLES];
  private series = new Map<number, BcraVariableDatapoint[]>();
  readonly calls: Array<{ method: "list" | "series"; idVariable?: number }> = [];

  setVariables(vs: BcraVariable[]): this {
    this.variables = vs;
    return this;
  }

  seedSeries(idVariable: number, points: BcraVariableDatapoint[]): this {
    this.series.set(idVariable, points);
    return this;
  }

  reset(): this {
    this.calls.length = 0;
    return this;
  }

  async listVariables(): Promise<BcraVariable[]> {
    this.calls.push({ method: "list" });
    return this.variables;
  }

  async getVariable(idVariable: number): Promise<BcraVariableDatapoint[]> {
    this.calls.push({ method: "series", idVariable });
    return this.series.get(idVariable) ?? [];
  }
}
