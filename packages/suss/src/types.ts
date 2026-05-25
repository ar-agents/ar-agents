/**
 * Types for SUSS / SICOSS payroll math.
 *
 * Each month an employer files Form F.931 (SICOSS) listing every
 * employee + their remuneraciones + the employer/employee
 * contributions. The submission file is a fixed-width text (`txt`
 * format) AFIP ingests through the SICOSS application.
 *
 * v0.1 ships the per-employee MATH + the monthly DDJJ assembly.
 * SICOSS upload (the actual XML/txt file generation + WSAA-signed
 * submission) lives in a future v0.2 — that's the adapter contract
 * already in place.
 *
 * # Concept map
 *
 *   remuneración bruta → la base imponible para todos los aportes y
 *                       contribuciones
 *   aportes           → lo que el EMPLEADO paga (descuento de su
 *                       remuneración)
 *   contribuciones    → lo que el EMPLEADOR paga (encima de la
 *                       remuneración)
 *
 * The package focuses on EMPLOYER contributions (what Vultur
 * customers actually file — they're the agente). Employee aportes
 * are computed for the payslip math but the file-level totals are
 * driven by contributions.
 *
 * Todos los montos en ARS centavos (integers).
 */

/** Modalidad de contratación. Drives ART + obra-social rates. */
export type EmploymentMode =
  /** Relación de dependencia con jornada completa. */
  | "full_time"
  /** Relación de dependencia con jornada parcial. */
  | "part_time"
  /** Personal de casas particulares (régimen propio). */
  | "casas_particulares"
  /** Personal rural temporario. */
  | "rural";

/** Tipo de modalidad de contribución del empleador. */
export type EmployerContributionRegime =
  /** Régimen general (Decreto 814/01) — la mayoría de PyMEs en
   *  comercio + servicios entran acá. Tasa general 18%. */
  | "general"
  /** Empleadores grandes (Industria + comercio mayorista de cierto
   *  porte). Tasa 20.4%. */
  | "grandes_empleadores"
  /** Reducción por contratación neta (ley actual de promoción de
   *  empleo). El package no implementa los topes acá; el caller
   *  pasa un override. */
  | "promocion_empleo";

/** Per-employee monthly remuneration line. The math input. */
export interface EmployeeMonthInput {
  /** CUIL (11 digits, with or without hyphens). */
  cuil: string;
  /** Free-form display name (audit only, never on the wire). */
  nombre?: string;
  /** YYYY-MM. */
  period: string;
  /** Remuneración bruta en centavos. Includes sueldo + plus +
   * adicionales remunerativos. NOT bonus (extraordinary) or
   * non-remunerativos. */
  remuneracionBrutaCentavos: number;
  /** Optional non-remunerativos en centavos. Reported but NOT subject
   * to aportes/contribuciones. */
  noRemunerativosCentavos?: number;
  /** Cantidad de hijos a cargo (para asignaciones familiares;
   * informativo en v0.1, el cálculo de AAFF AFIP lo hace por
   * ANSES en separado). */
  hijos?: number;
  /** Modalidad de contratación. Default "full_time". */
  mode?: EmploymentMode;
}

/** Per-employee monthly contribution breakdown. */
export interface EmployeeMonthResult {
  cuil: string;
  period: string;
  remuneracionBrutaCentavos: number;
  noRemunerativosCentavos: number;
  /** EMPLEADO — lo que se descuenta de la remuneración del empleado. */
  aportes: {
    jubilacion: number; // 11%
    inssjp: number; // 3%
    obraSocial: number; // 3%
    total: number;
  };
  /** EMPLEADOR — lo que el empleador paga sobre la remuneración. */
  contribuciones: {
    jubilacion: number; // 10.17% / 12.71%
    inssjp: number; // 1.5% / 1.62%
    asignacionesFamiliares: number; // 4.7% / 5.4%
    fondoNacionalEmpleo: number; // 0.94% / 1.07%
    obraSocial: number; // 6% (5% obra + 0.6% ANSSAL + 0.4%)
    art: number; // override per-employee or default 5%
    total: number;
  };
  /** Total CFT/SIPA + AAFF + FNE + INSSJP — the "vector A" del SICOSS. */
  contribucionesSeguridadSocialCentavos: number;
  /** "Vector B" — Obra Social. */
  contribucionesObraSocialCentavos: number;
  /** "Vector C" — ART. */
  contribucionesArtCentavos: number;
  /** Sum of all contribuciones — what the employer remits. */
  totalContribucionesCentavos: number;
}

/** Inputs for the per-employee calc. */
export interface CalcEmployeeArgs {
  employee: EmployeeMonthInput;
  /** Régimen del empleador. Default "general". */
  employerRegime?: EmployerContributionRegime;
  /** Override the ART rate (fraction, e.g. 0.05 = 5%). ART rates
   * vary by activity + employer + ART provider; pass the rate from
   * your ART contract. Default 0.05. */
  artRate?: number;
  /** Override de la tabla de rates (e.g. para histórico). */
  rateTable?: ContributionRateTable;
}

/** Per-regime rate table. */
export interface ContributionRateTable {
  jubilacionEmpleado: number;
  inssjpEmpleado: number;
  obraSocialEmpleado: number;
  jubilacionEmpleadorGeneral: number;
  jubilacionEmpleadorGrandes: number;
  inssjpEmpleadorGeneral: number;
  inssjpEmpleadorGrandes: number;
  asignacionesFamiliaresGeneral: number;
  asignacionesFamiliaresGrandes: number;
  fneGeneral: number;
  fneGrandes: number;
  obraSocialEmpleadorGeneral: number;
  obraSocialEmpleadorGrandes: number;
  artDefault: number;
}

// ── Monthly DDJJ (SICOSS) ──────────────────────────────────────

export interface SicossDdjjArgs {
  /** YYYY-MM. */
  period: string;
  /** Employer CUIT. */
  employerCuit: string;
  /** Per-employee computed lines (or just-the-inputs + we calc inline). */
  employees: ReadonlyArray<EmployeeMonthInput | EmployeeMonthResult>;
  /** Régimen del empleador (default "general"). */
  employerRegime?: EmployerContributionRegime;
  /** Default ART rate to apply when an employee doesn't carry one. */
  defaultArtRate?: number;
}

export interface SicossDdjjResult {
  period: string;
  employerCuit: string;
  employerRegime: EmployerContributionRegime;
  totals: {
    employees: number;
    remuneracionBrutaCentavos: number;
    aportesCentavos: number;
    contribucionesCentavos: number;
    /** What the employer remits to AFIP — sum of contribuciones. */
    remitirCentavos: number;
  };
  byVector: {
    seguridadSocial: number; // SIPA + INSSJP + AAFF + FNE
    obraSocial: number;
    art: number;
  };
  employees: ReadonlyArray<EmployeeMonthResult>;
}
