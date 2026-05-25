/**
 * Pure calculation primitives for SUSS / SICOSS.
 *
 * Per-employee math (`calculateEmployeeMonth`) + monthly DDJJ
 * aggregation (`buildSicossDdjj`). No I/O, no network.
 */

import type {
  CalcEmployeeArgs,
  ContributionRateTable,
  EmployeeMonthInput,
  EmployeeMonthResult,
  EmployerContributionRegime,
  SicossDdjjArgs,
  SicossDdjjResult,
} from "./types";
import { DEFAULT_RATE_TABLE } from "./rates";
import { SussValidationError } from "./errors";

const CUIL_RE = /^\d{11}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const CUIT_RE = /^\d{11}$/;

function normalizeCuil(value: string, field: string): string {
  const clean = value.replace(/-/g, "");
  if (!CUIL_RE.test(clean)) {
    throw new SussValidationError(
      field,
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

function normalizeCuit(value: string, field = "employerCuit"): string {
  const clean = value.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new SussValidationError(
      field,
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

/**
 * Per-employee monthly calc. Returns the breakdown of EMPLEADO
 * aportes + EMPLEADOR contribuciones in centavos.
 *
 * Rounding: each line is rounded individually (`Math.round`) so the
 * sum matches what AFIP expects on the SICOSS submission. We do NOT
 * round-then-sum vs sum-then-round inconsistencies; per AFIP each
 * line is rounded separately.
 */
export function calculateEmployeeMonth(
  args: CalcEmployeeArgs,
): EmployeeMonthResult {
  const emp = args.employee;
  if (emp.remuneracionBrutaCentavos < 0) {
    throw new SussValidationError(
      "remuneracionBrutaCentavos",
      "must be non-negative",
    );
  }
  if ((emp.noRemunerativosCentavos ?? 0) < 0) {
    throw new SussValidationError(
      "noRemunerativosCentavos",
      "must be non-negative",
    );
  }
  if (!PERIOD_RE.test(emp.period)) {
    throw new SussValidationError("period", "must be YYYY-MM");
  }
  const cuil = normalizeCuil(emp.cuil, "cuil");

  const regime: EmployerContributionRegime = args.employerRegime ?? "general";
  const isLarge = regime === "grandes_empleadores";
  const isPromocion = regime === "promocion_empleo";
  const table: ContributionRateTable = args.rateTable ?? DEFAULT_RATE_TABLE;
  const artRate = args.artRate ?? table.artDefault;
  if (artRate < 0 || artRate > 1) {
    throw new SussValidationError("artRate", "must be a fraction between 0 and 1");
  }

  const remBruta = emp.remuneracionBrutaCentavos;
  const noRem = emp.noRemunerativosCentavos ?? 0;

  // EMPLEADO
  const aporteJub = Math.round(remBruta * table.jubilacionEmpleado);
  const aporteInssjp = Math.round(remBruta * table.inssjpEmpleado);
  const aporteOs = Math.round(remBruta * table.obraSocialEmpleado);
  const aporteTotal = aporteJub + aporteInssjp + aporteOs;

  // EMPLEADOR — pick rates by regime. "promocion_empleo" inherits
  // from "general" but the caller is expected to apply external
  // reductions/exemptions on top (the v0.1 surface doesn't model the
  // full Ley 27.430 reduction matrix).
  const jubE = isLarge
    ? table.jubilacionEmpleadorGrandes
    : table.jubilacionEmpleadorGeneral;
  const inssjpE = isLarge
    ? table.inssjpEmpleadorGrandes
    : table.inssjpEmpleadorGeneral;
  const aaffE = isLarge
    ? table.asignacionesFamiliaresGrandes
    : table.asignacionesFamiliaresGeneral;
  const fneE = isLarge ? table.fneGrandes : table.fneGeneral;
  const osE = isLarge
    ? table.obraSocialEmpleadorGrandes
    : table.obraSocialEmpleadorGeneral;

  const contribJub = Math.round(remBruta * jubE);
  const contribInssjp = Math.round(remBruta * inssjpE);
  const contribAaff = Math.round(remBruta * aaffE);
  const contribFne = Math.round(remBruta * fneE);
  const contribOs = Math.round(remBruta * osE);
  const contribArt = Math.round(remBruta * artRate);
  const contribTotal =
    contribJub + contribInssjp + contribAaff + contribFne + contribOs + contribArt;

  const seguridadSocial = contribJub + contribInssjp + contribAaff + contribFne;

  // `promocion_empleo` is an indicator only at v0.1; we keep all
  // contributions as-is and let the caller apply external bonificación
  // post-hoc. Documented in AGENTS.md.
  void isPromocion;
  void noRem;

  return {
    cuil,
    period: emp.period,
    remuneracionBrutaCentavos: remBruta,
    noRemunerativosCentavos: noRem,
    aportes: {
      jubilacion: aporteJub,
      inssjp: aporteInssjp,
      obraSocial: aporteOs,
      total: aporteTotal,
    },
    contribuciones: {
      jubilacion: contribJub,
      inssjp: contribInssjp,
      asignacionesFamiliares: contribAaff,
      fondoNacionalEmpleo: contribFne,
      obraSocial: contribOs,
      art: contribArt,
      total: contribTotal,
    },
    contribucionesSeguridadSocialCentavos: seguridadSocial,
    contribucionesObraSocialCentavos: contribOs,
    contribucionesArtCentavos: contribArt,
    totalContribucionesCentavos: contribTotal,
  };
}

/**
 * Helper: ARS centavos sum + grand-total assembly.
 *
 * Accepts either pre-computed `EmployeeMonthResult`s or raw inputs
 * (it calc'd them) — flexible for callers building a DDJJ
 * incrementally during the month.
 */
export function buildSicossDdjj(args: SicossDdjjArgs): SicossDdjjResult {
  if (!PERIOD_RE.test(args.period)) {
    throw new SussValidationError("period", "must be YYYY-MM");
  }
  normalizeCuit(args.employerCuit);
  const regime: EmployerContributionRegime = args.employerRegime ?? "general";

  const computed: EmployeeMonthResult[] = [];
  let remBrutaTotal = 0;
  let aportesTotal = 0;
  let contribTotal = 0;
  let segSocTotal = 0;
  let osTotal = 0;
  let artTotal = 0;

  for (const e of args.employees) {
    let r: EmployeeMonthResult;
    if (isResult(e)) {
      r = e;
    } else {
      r = calculateEmployeeMonth({
        employee: e,
        employerRegime: regime,
        ...(args.defaultArtRate !== undefined ? { artRate: args.defaultArtRate } : {}),
      });
    }
    computed.push(r);
    remBrutaTotal += r.remuneracionBrutaCentavos;
    aportesTotal += r.aportes.total;
    contribTotal += r.contribuciones.total;
    segSocTotal += r.contribucionesSeguridadSocialCentavos;
    osTotal += r.contribucionesObraSocialCentavos;
    artTotal += r.contribucionesArtCentavos;
  }

  return {
    period: args.period,
    employerCuit: args.employerCuit.replace(/-/g, ""),
    employerRegime: regime,
    totals: {
      employees: computed.length,
      remuneracionBrutaCentavos: remBrutaTotal,
      aportesCentavos: aportesTotal,
      contribucionesCentavos: contribTotal,
      remitirCentavos: contribTotal,
    },
    byVector: {
      seguridadSocial: segSocTotal,
      obraSocial: osTotal,
      art: artTotal,
    },
    employees: computed,
  };
}

function isResult(
  e: EmployeeMonthInput | EmployeeMonthResult,
): e is EmployeeMonthResult {
  return "aportes" in e;
}

/** Convenience: one-shot total contribuciones for a single employee
 *  paid `remuneracion` in centavos. Skips the structured breakdown. */
export function quickContribuciones(
  remBrutaCentavos: number,
  options: {
    employerRegime?: EmployerContributionRegime;
    artRate?: number;
  } = {},
): number {
  const r = calculateEmployeeMonth({
    employee: {
      cuil: "20000000000",
      period: "2026-01",
      remuneracionBrutaCentavos: remBrutaCentavos,
    },
    ...(options.employerRegime ? { employerRegime: options.employerRegime } : {}),
    ...(options.artRate !== undefined ? { artRate: options.artRate } : {}),
  });
  return r.contribuciones.total;
}
