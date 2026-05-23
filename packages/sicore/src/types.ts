/**
 * SICORE types — federal income tax (Ganancias) retentions per RG 830/00.
 *
 * SICORE is the AFIP/ARCA system that agentes de retención use to file
 * monthly DDJJ of every retention they performed during the period. The
 * REAL retention happens at the moment of payment to a supplier; SICORE
 * is the reconciliation surface AFIP ingests.
 *
 * This package focuses on the per-payment math (what to retain on each
 * invoice) plus the monthly DDJJ assembly. The actual SICORE upload is
 * adapter territory because it requires AFIP-cert authenticated XML
 * submission, which lives outside the package boundary.
 *
 * Categorías cubiertas en v0.1 (las 4 más comunes para SaaS B2B):
 *
 *   - "servicios"      Locaciones de obra y/o servicios sin relación de
 *                       dependencia. Anexo II tipo de operación 36. Rate:
 *                       2% inscripto / 28% no-inscripto (sobre excedente).
 *   - "honorarios"     Honorarios profesionales. Anexo II tipo 28. Tabla
 *                       escalonada para inscripto (0%-22%) y 28% no-insc.
 *   - "bienes"         Compraventa de cosas muebles. Anexo II tipo 78.
 *                       Rate: 2% inscripto / 10% no-inscripto.
 *   - "alquileres"     Locaciones de inmuebles urbanos. Anexo II tipo
 *                       49. Rate: 6% inscripto / 28% no-inscripto.
 *
 * Categorías NO cubiertas en v0.1 (necesitan v0.2):
 *   - Intereses (Anexo II 25)
 *   - Honorarios directorio (Anexo II 22)
 *   - Locaciones de inmuebles rurales (Anexo II 50)
 *   - Honorarios sindicales (Anexo II 24)
 *   - Y el resto del catálogo de Anexo II (≈80 tipos)
 *
 * Todos los montos en ARS centavos (integers). Las tablas y mínimos son
 * snapshot 2024-Q4 — el caller pasa la tabla vigente para el período.
 */

/** Tipos de operación cubiertos en v0.1. */
export type SicoreCategory =
  | "servicios"
  | "honorarios"
  | "bienes"
  | "alquileres";

/** Régimen del proveedor frente al impuesto. Inscripto = con CUIT
 * registrado y constancia activa. No-inscripto = sin constancia o
 * con CUIT vencido. Exento = con certificado de no-retención vigente
 * (cf. RG 830 art 38). */
export type SupplierStatus = "inscripto" | "no_inscripto" | "exento";

/**
 * Una entrada de tabla de retención. Las tablas de Anexo II tienen una
 * estructura uniforme: un mínimo no imponible mensual + un rate (flat
 * para servicios/bienes/alquileres, escalonado para honorarios). Esta
 * shape cubre ambos casos: si `scale` está presente, el cálculo usa la
 * escala progresiva; si no, usa `flatRate`.
 */
export interface SicoreRateEntry {
  category: SicoreCategory;
  status: SupplierStatus;
  /** Mínimo no imponible MENSUAL en centavos (acumulado por proveedor). */
  minimumMonthlyCentavos: number;
  /** Rate plano (fracción) — usado cuando no hay `scale`. */
  flatRate?: number | undefined;
  /** Escala progresiva (honorarios). Cada tramo aplica al EXCEDENTE del
   * mínimo, no al total. Tramos contiguos y crecientes. */
  scale?: ReadonlyArray<SicoreScaleStep> | undefined;
  /** Importe fijo a sumar tras aplicar el rate del tramo (honorarios). */
  fixedAmountCentavos?: number | undefined;
}

export interface SicoreScaleStep {
  /** Límite SUPERIOR del tramo en centavos (excedente sobre mínimo). El
   * tramo más alto lleva `Infinity`. */
  upToCentavos: number;
  /** Rate del tramo, como fracción (0.06 = 6%). */
  rate: number;
  /** Importe fijo del tramo (centavos), sumado al rate × excedente. */
  fixedCentavos: number;
}

/**
 * Cálculo de retención individual. El llamador pasa el monto del pago
 * de HOY y, opcionalmente, lo ya pagado al mismo proveedor en el mes
 * (para la regla acumulativa).
 */
export interface RetentionInput {
  category: SicoreCategory;
  status: SupplierStatus;
  /** CUIT del proveedor (con o sin guiones, 11 dígitos). */
  supplierCuit: string;
  /** Monto del pago de hoy en centavos. */
  paymentCentavos: number;
  /** Pagos acumulados al MISMO proveedor en el mes (centavos). Default 0. */
  accumulatedMonthCentavos?: number | undefined;
  /** Retenciones ya practicadas al mismo proveedor en el mes (centavos). Default 0. */
  alreadyRetainedThisMonthCentavos?: number | undefined;
  /** Fecha del pago (YYYY-MM-DD). Para audit + tabla lookup. */
  paymentDate: string;
  /** Override de la tabla. Por defecto el package usa la tabla snapshot. */
  rateTable?: ReadonlyArray<SicoreRateEntry> | undefined;
}

export interface RetentionResult {
  category: SicoreCategory;
  status: SupplierStatus;
  supplierCuit: string;
  paymentDate: string;
  /** Monto del pago de hoy. */
  paymentCentavos: number;
  /** Monto acumulado en el mes (incluyendo hoy). */
  accumulatedAfterPaymentCentavos: number;
  /** Mínimo no imponible aplicado. */
  minimumMonthlyCentavos: number;
  /** Rate efectivo aplicado (weighted si hubo escala). */
  effectiveRate: number;
  /** Retención teórica sobre el ACUMULADO. */
  theoreticalRetentionCentavos: number;
  /** Retención ya practicada en el mes a este proveedor. */
  alreadyRetainedThisMonthCentavos: number;
  /** Retención que se practica en este pago (lo que paga AFIP en SICORE). */
  retentionAmountCentavos: number;
  /** Razón por la que no se retiene (si retentionAmountCentavos = 0). */
  waiverReason?:
    | "exento_certificate"
    | "below_minimum"
    | "already_satisfied"
    | undefined;
}

// ── Monthly SICORE DDJJ ─────────────────────────────────────────

export interface SicoreEntry {
  /** Ref id del comprobante / pago. */
  comprobanteRef: string;
  /** Resultado de la retención. */
  retention: RetentionResult;
}

export interface SicoreDdjjArgs {
  /** YYYY-MM. */
  period: string;
  /** CUIT del agente de retención. */
  agentCuit: string;
  /** Todas las retenciones practicadas en el período. */
  entries: ReadonlyArray<SicoreEntry>;
}

export interface SicoreDdjjResult {
  period: string;
  agentCuit: string;
  totals: {
    paymentCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  };
  byCategory: ReadonlyArray<{
    category: SicoreCategory;
    paymentCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  }>;
  bySupplier: ReadonlyArray<{
    supplierCuit: string;
    paymentCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  }>;
  entries: ReadonlyArray<SicoreEntry>;
}
