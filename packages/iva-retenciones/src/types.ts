/**
 * Types for IVA retentions (federal RG 2854/10 and family).
 *
 * "Retención de IVA" is the mirror operation of perception: instead
 * of an agente adding a charge to a sale, an agente designated by
 * AFIP RETAINS a portion of the IVA component of a PAYMENT to a
 * supplier. The retained amount is remitted to AFIP via SIRE; the
 * supplier credits it against their next IVA DDJJ.
 *
 * Direction:
 *   - Perception (RG 2408/08): buyer pays MORE on the sale
 *   - Retention   (RG 2854/10): seller takes home LESS on the payment
 *
 * Same agent CAN have both obligations on the same transaction, but
 * the regimes are separate. Use this package for retention; pair with
 * `@ar-agents/iva-percepciones` when both apply.
 *
 * v0.1 covers the most common federal IVA retention regimes:
 *
 *   - "rg_2854_general"   RG 2854/10 régimen general. Tasa 50%
 *                         (servicios) o 80% (locaciones cosas
 *                         muebles) sobre el IVA del comprobante.
 *                         Mínimo: $5.000 IVA por comprobante.
 *   - "rg_5057_servicios_digitales"  RG 5057/21 servicios digitales
 *                         intra-zona. Stub en v0.1 (no rates baked-in).
 *
 * Out of scope for v0.1:
 *   - RG 2616 retenciones de IVA de granos.
 *   - Régimen especial RG 3411 honorarios.
 *
 * Todos los montos en ARS centavos (integers). Rates como fracciones.
 */

export type IvaRetentionRegime =
  | "rg_2854_general"
  | "rg_5057_servicios_digitales";

/** Operation type — the rate depends on whether the underlying
 * comprobante is a service or a sale of cosas muebles. */
export type IvaOperationType =
  | "servicios"
  | "cosas_muebles"
  | "locaciones_inmuebles";

/** Régimen del supplier frente al impuesto. */
export type SupplierStatus =
  /** Responsable inscripto. Sujeto al régimen normal. */
  | "responsable_inscripto"
  /** Monotributista. Exento de retención por regla general. */
  | "monotributista"
  /** Exento. Con certificado de no-retención vigente. */
  | "exento"
  /** No categorizado. Tasa agravada. */
  | "no_categorizado";

export interface IvaRetentionRateEntry {
  regime: IvaRetentionRegime;
  operationType: IvaOperationType;
  supplierStatus: SupplierStatus;
  /** Tasa como fracción aplicada AL IVA del comprobante (0.5 = 50%
   * del IVA, no del total). */
  rate: number;
  /** Mínimo IVA del comprobante en centavos. Por debajo, no se
   * retiene. */
  minimumIvaCentavos: number;
}

export interface RetentionInput {
  regime: IvaRetentionRegime;
  operationType: IvaOperationType;
  supplierStatus: SupplierStatus;
  /** CUIT del proveedor (con o sin guiones). */
  supplierCuit: string;
  /** Fecha del pago (YYYY-MM-DD). */
  paymentDate: string;
  /** IVA del comprobante en centavos (lo que retenemos un % de
   * esto, no del neto). */
  ivaCentavos: number;
  /** Override de la tabla. */
  rateTable?: ReadonlyArray<IvaRetentionRateEntry> | undefined;
  /** True si el proveedor tiene certificado de no-retención vigente. */
  supplierHasNonRetentionCertificate?: boolean | undefined;
}

export interface RetentionResult {
  regime: IvaRetentionRegime;
  operationType: IvaOperationType;
  supplierStatus: SupplierStatus;
  supplierCuit: string;
  paymentDate: string;
  ivaCentavos: number;
  minimumIvaCentavos: number;
  rate: number;
  retentionCentavos: number;
  waiverReason?:
    | "below_minimum"
    | "non_retention_certificate"
    | "exempt_supplier"
    | "monotributista"
    | undefined;
}

export interface RetentionEntry {
  comprobanteRef: string;
  retention: RetentionResult;
}

export interface RetentionDdjjArgs {
  /** YYYY-MM. */
  period: string;
  /** CUIT del agente de retención. */
  agentCuit: string;
  entries: ReadonlyArray<RetentionEntry>;
}

export interface RetentionDdjjResult {
  period: string;
  agentCuit: string;
  totals: {
    ivaCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  };
  byRegime: ReadonlyArray<{
    regime: IvaRetentionRegime;
    ivaCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  }>;
  bySupplier: ReadonlyArray<{
    supplierCuit: string;
    ivaCentavos: number;
    retentionCentavos: number;
    entryCount: number;
  }>;
  entries: ReadonlyArray<RetentionEntry>;
}
