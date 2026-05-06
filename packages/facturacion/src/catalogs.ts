/**
 * AFIP/ARCA WSFE catalogs — the canonical IDs you pass to `solicitarCAE` for
 * comprobante type, document type, IVA rate, concept, and currency.
 *
 * These are stable AFIP constants (some date back to RG 100/1998); they don't
 * change. Mirroring them here lets agents resolve a human-readable label
 * (e.g. "Factura C" or "21%") to its WSFE numeric code WITHOUT a network
 * round-trip to AFIP's `FEParamGetTipos*` endpoints.
 *
 * For the authoritative live list, use `getTiposCbte()`, `getTiposDoc()`,
 * `getTiposIva()`, `getTiposConcepto()` from `wsfe.ts` — they hit AFIP in
 * real time and pick up newly-added codes (e.g., FCE MiPyMEs 2018).
 */

/**
 * Tipo de comprobante (CbteTipo). The first thing you pick when emitting:
 * what kind of fiscal document is this?
 *
 * The choice depends on (a) your tax condition as the issuer and (b) the
 * receiver's tax condition. Common matrix:
 *
 * | Issuer ↓ / Receiver →   | RI       | Mono     | Cons. Final | Exento | Exterior |
 * | ----------------------- | -------- | -------- | ----------- | ------ | -------- |
 * | Responsable Inscripto   | A (1)    | A (1)    | B (6)       | B (6)  | E (19)   |
 * | Monotributista          | C (11)   | C (11)   | C (11)      | C (11) | E (19)   |
 * | Exento                  | C (11)   | C (11)   | C (11)      | C (11) | E (19)   |
 *
 * For credit/debit notes, the rule is: same letter as the original invoice.
 *
 * Common pitfall: you can't issue Factura M unless AFIP has flagged your CUIT
 * as "Sujeto No Categorizado" — for normal flows ignore tipo 51.
 */
export const CbteTipo = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  RECIBO_A: 4,
  NOTA_VENTA_AL_CONTADO_A: 5,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  RECIBO_B: 9,
  NOTA_VENTA_AL_CONTADO_B: 10,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
  RECIBO_C: 15,
  FACTURA_M: 51,
  NOTA_DEBITO_M: 52,
  NOTA_CREDITO_M: 53,
  RECIBO_M: 54,
  // FCE MiPyMEs (Factura de Crédito Electrónica) — RG 4367/2018
  FCE_FACTURA_A: 201,
  FCE_NOTA_DEBITO_A: 202,
  FCE_NOTA_CREDITO_A: 203,
  FCE_FACTURA_B: 206,
  FCE_NOTA_DEBITO_B: 207,
  FCE_NOTA_CREDITO_B: 208,
  FCE_FACTURA_C: 211,
  FCE_NOTA_DEBITO_C: 212,
  FCE_NOTA_CREDITO_C: 213,
  // Comprobantes E (exportación)
  FACTURA_E: 19,
  NOTA_DEBITO_E: 20,
  NOTA_CREDITO_E: 21,
} as const;

export type CbteTipoCode = (typeof CbteTipo)[keyof typeof CbteTipo];

/**
 * Tipo de documento (DocTipo) — what kind of identifier the receiver is
 * presenting. CUIT is the most common for B2B; DNI for consumer-facing flows.
 */
export const DocTipo = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  LE: 89,
  LC: 90,
  CI_EXTRANJERA: 91,
  EN_TRAMITE: 92,
  ACTA_NACIMIENTO: 93,
  PASAPORTE: 94,
  CI_BS_AS_RNP: 95,
  DNI: 96,
  /**
   * Special "no identification" code for consumer-facing sales below the AFIP
   * threshold (currently ~$417k as of 2026). Pair with `DocNro: 0`.
   */
  CONSUMIDOR_FINAL: 99,
} as const;

export type DocTipoCode = (typeof DocTipo)[keyof typeof DocTipo];

/**
 * Concepto del comprobante. Determines whether the `FchServDesde`,
 * `FchServHasta`, and `FchVtoPago` fields are required:
 *
 * - **Productos (1)**: dates not required.
 * - **Servicios (2)**: dates REQUIRED — represents the service period and
 *   the payment due date.
 * - **Productos y Servicios (3)**: dates required.
 *
 * For SaaS subscriptions, use `SERVICIOS` and pass the billing period.
 */
export const Concepto = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

export type ConceptoCode = (typeof Concepto)[keyof typeof Concepto];

/**
 * Alícuotas de IVA. The numeric code goes inside the `<Iva><AlicIva><Id>`
 * element of the request; the percentage is what your customer sees.
 *
 * For monotributistas (Factura C), do NOT include any `<Iva>` items — the
 * concept of IVA discrimination doesn't apply. `ImpIVA` must be 0.
 */
export const AlicuotaIva = {
  CERO: { id: 3, percent: 0 },
  DOS_CINCO: { id: 9, percent: 2.5 },
  CINCO: { id: 8, percent: 5 },
  DIEZ_CINCO: { id: 4, percent: 10.5 },
  VEINTIUNO: { id: 5, percent: 21 },
  VEINTISIETE: { id: 6, percent: 27 },
} as const;

export type AlicuotaIvaCode =
  (typeof AlicuotaIva)[keyof typeof AlicuotaIva]["id"];

/**
 * Result code from a `solicitarCAE` call.
 *
 * - **A — Aprobado**: CAE issued. Persist `cae` + `caeFchVto`.
 * - **R — Rechazado**: errors returned. Inspect `observaciones` and `errors`.
 * - **P — Parcial**: at least one detail rejected (rare with `CantReg=1`).
 */
export type WsfeResultado = "A" | "R" | "P";

/**
 * Currency code (MonId). PES = Pesos Argentinos, the default. Use other codes
 * for export invoices (Factura E) or multi-currency invoices.
 */
export const Moneda = {
  PESOS: "PES",
  DOLAR: "DOL",
  EURO: "060",
  REAL: "012",
} as const;

export type MonedaCode = (typeof Moneda)[keyof typeof Moneda];

/**
 * Human-readable label for a comprobante type code. Use to render UI or to
 * surface the result of `consultarUltimoAutorizado()` to end users.
 */
export function describeCbteTipo(code: number): string {
  const map: Record<number, string> = {
    1: "Factura A",
    2: "Nota de Débito A",
    3: "Nota de Crédito A",
    4: "Recibo A",
    5: "Nota de Venta al Contado A",
    6: "Factura B",
    7: "Nota de Débito B",
    8: "Nota de Crédito B",
    9: "Recibo B",
    10: "Nota de Venta al Contado B",
    11: "Factura C",
    12: "Nota de Débito C",
    13: "Nota de Crédito C",
    15: "Recibo C",
    19: "Factura E (exportación)",
    20: "Nota de Débito E",
    21: "Nota de Crédito E",
    51: "Factura M",
    52: "Nota de Débito M",
    53: "Nota de Crédito M",
    54: "Recibo M",
    201: "FCE Factura A",
    202: "FCE Nota de Débito A",
    203: "FCE Nota de Crédito A",
    206: "FCE Factura B",
    207: "FCE Nota de Débito B",
    208: "FCE Nota de Crédito B",
    211: "FCE Factura C",
    212: "FCE Nota de Débito C",
    213: "FCE Nota de Crédito C",
  };
  return map[code] ?? `Comprobante tipo ${code}`;
}
