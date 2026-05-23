/**
 * Default rate tables — snapshot of RG 2408/08 (régimen general).
 *
 * RG 2408 designates agentes de percepción who collect a perception
 * on top of every sale to certain buyer categories. The most common
 * setup:
 *
 *   - Responsable inscripto (RI) → tasa 1.5% (la "tasa general")
 *   - No categorizado / sin CUIT válido → tasa 3% (tasa agravada)
 *   - Monotributista → 0% (exento de percepción salvo caso especial)
 *   - Exento (con cert) → 0%
 *   - Consumidor final → 0% (no es contribuyente)
 *
 * El mínimo no imponible suele ser bajo en RG 2408 (de hecho, el
 * régimen general histórico no tiene mínimo — toda venta a RI
 * percibe). Otros regímenes específicos sí tienen mínimo.
 *
 * IMPORTANT: las tasas y mínimos son snapshot 2024-Q4. Verificá la
 * normativa vigente para el período al que estés facturando antes de
 * usar estas tablas en producción.
 *
 * RG 3337 (combustibles) y RG 2126 (servicios) tienen tablas propias
 * pero NO las baked-in en v0.1 — el caller las pasa por `rateTable`.
 */
import type { IvaPerceptionRateEntry } from "./types";

/** RG 2408/08 — régimen general. */
const RG_2408_GENERAL: ReadonlyArray<IvaPerceptionRateEntry> = [
  {
    regime: "rg_2408_general",
    buyerCondition: "responsable_inscripto",
    rate: 0.015, // 1,5%
    minimumNetCentavos: 0,
  },
  {
    regime: "rg_2408_general",
    buyerCondition: "no_categorizado",
    rate: 0.03, // 3% (agravada)
    minimumNetCentavos: 0,
  },
  {
    regime: "rg_2408_general",
    buyerCondition: "monotributista",
    rate: 0, // exento
    minimumNetCentavos: 0,
  },
  {
    regime: "rg_2408_general",
    buyerCondition: "exento",
    rate: 0,
    minimumNetCentavos: 0,
  },
  {
    regime: "rg_2408_general",
    buyerCondition: "consumidor_final",
    rate: 0,
    minimumNetCentavos: 0,
  },
];

/**
 * Default rate-table shipping with the package (RG 2408/08 régimen
 * general, 2024-Q4 snapshot). Other regimes (RG 3337, RG 2126) need
 * custom tables — pass them via `PerceptionInput.rateTable`.
 */
export const DEFAULT_RATE_TABLE: ReadonlyArray<IvaPerceptionRateEntry> = [
  ...RG_2408_GENERAL,
];

export const IVA_PERCEPTION_TABLES = {
  rg_2408_general: RG_2408_GENERAL,
} as const;
