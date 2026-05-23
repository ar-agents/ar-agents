/**
 * Types for IVA perceptions (federal RG 2408/08 and family).
 *
 * "Percepción" is when an agente designated by AFIP/ARCA collects an
 * EXTRA charge ON TOP of the IVA on a sale — anticipating part of the
 * buyer's future IVA tax obligation. It flows the opposite way from a
 * retention: retention reduces what the SELLER takes home; perception
 * increases what the BUYER pays.
 *
 * In Argentina the agente de percepción adds the perception to the
 * invoice total. The buyer treats it as a credit against their own
 * monthly IVA DDJJ.
 *
 * v0.1 covers the most common federal IVA perception regimes for B2B
 * SaaS / commerce:
 *
 *   - "rg_2408_general"   RG 2408/08 régimen general. Rate 1.5% sobre
 *                         neto si el comprador es responsable inscripto
 *                         (3% en otros casos). Mínimo no imponible
 *                         según convenio.
 *   - "rg_3337_combustibles"  RG 3337/12 combustibles líquidos.
 *                         Stub en v0.1 (no rates baked-in).
 *   - "rg_2126_servicios"  RG 2126/06 servicios de comunicación,
 *                         Internet, etc. Stub en v0.1.
 *
 * Out of scope for v0.1:
 *   - Provincial IVA-like perceptions (que en realidad son IIBB).
 *   - Régimen de pagos a cuenta de IVA en aduana.
 *
 * Todos los montos en ARS centavos (integers). Rates como fracciones.
 */

export type IvaPerceptionRegime =
  | "rg_2408_general"
  | "rg_3337_combustibles"
  | "rg_2126_servicios";

/** Condición fiscal del comprador frente al IVA. */
export type BuyerIvaCondition =
  /** Responsable inscripto en IVA — paga IVA discriminado. */
  | "responsable_inscripto"
  /** Monotributista — usualmente exento de percepción. */
  | "monotributista"
  /** Exento — con certificado de no-percepción. */
  | "exento"
  /** Consumidor final — usualmente no se percibe (no es contribuyente). */
  | "consumidor_final"
  /** Sujeto no categorizado (rate más alto). */
  | "no_categorizado";

export interface IvaPerceptionRateEntry {
  regime: IvaPerceptionRegime;
  buyerCondition: BuyerIvaCondition;
  /** Tasa como fracción (0.015 = 1,5%). */
  rate: number;
  /** Mínimo neto facturado sobre el cual aplica la percepción
   * (centavos). Por debajo del mínimo no se percibe. */
  minimumNetCentavos: number;
}

export interface PerceptionInput {
  regime: IvaPerceptionRegime;
  buyerCondition: BuyerIvaCondition;
  /** CUIT del comprador (con o sin guiones). */
  buyerCuit: string;
  /** Neto de la factura sobre el cual aplica la percepción (centavos). */
  netCentavos: number;
  /** Fecha de la operación (YYYY-MM-DD). */
  operationDate: string;
  /** Override de la tabla. */
  rateTable?: ReadonlyArray<IvaPerceptionRateEntry> | undefined;
  /** True si el agente de percepción tiene el certificado de
   * no-percepción del comprador en vigencia. Default false. */
  buyerHasNonPerceptionCertificate?: boolean | undefined;
}

export interface PerceptionResult {
  regime: IvaPerceptionRegime;
  buyerCondition: BuyerIvaCondition;
  buyerCuit: string;
  operationDate: string;
  netCentavos: number;
  minimumNetCentavos: number;
  rate: number;
  perceptionCentavos: number;
  /** Total a facturar (neto + IVA + percepción). El IVA se calcula
   * fuera (en @ar-agents/facturacion o equivalente). Acá devolvemos
   * sólo la percepción; el caller hace la suma. */
  waiverReason?:
    | "below_minimum"
    | "non_perception_certificate"
    | "exempt_buyer"
    | "consumidor_final"
    | undefined;
}

export interface PerceptionEntry {
  comprobanteRef: string;
  perception: PerceptionResult;
}

export interface PerceptionDdjjArgs {
  /** YYYY-MM. */
  period: string;
  /** CUIT del agente de percepción. */
  agentCuit: string;
  entries: ReadonlyArray<PerceptionEntry>;
}

export interface PerceptionDdjjResult {
  period: string;
  agentCuit: string;
  totals: {
    netCentavos: number;
    perceptionCentavos: number;
    entryCount: number;
  };
  byRegime: ReadonlyArray<{
    regime: IvaPerceptionRegime;
    netCentavos: number;
    perceptionCentavos: number;
    entryCount: number;
  }>;
  byBuyer: ReadonlyArray<{
    buyerCuit: string;
    netCentavos: number;
    perceptionCentavos: number;
    entryCount: number;
  }>;
  entries: ReadonlyArray<PerceptionEntry>;
}
