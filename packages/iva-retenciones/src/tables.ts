/**
 * Default rate tables — snapshot of RG 2854/10 (régimen general).
 *
 * Rates apply to the IVA component of the comprobante (NOT to the
 * net or total). Per RG 2854 Anexo IV:
 *
 *   Operación                          Tasa s/IVA   Mínimo IVA (centavos, 2024-Q4)
 *   ────────────────────────────────   ──────────   ──────────────────────────────
 *   Locaciones cosas muebles (RI)      80%          500_000  ($5.000)
 *   Locaciones cosas muebles (NC)      100%         0
 *   Servicios / locaciones obra (RI)   50%          500_000  ($5.000)
 *   Servicios (NC)                     100%         0
 *   Locaciones de inmuebles (RI)       50%          500_000
 *   Monotributista                     0%           — (exento)
 *   Exento (con cert)                  0%           — (exento)
 *
 * IMPORTANT: las tasas y mínimos son snapshot 2024-Q4. RG 5057
 * (servicios digitales) NO trae rates baked-in en v0.1 — pasalas via
 * `RetentionInput.rateTable` cuando corresponda.
 */
import type { IvaRetentionRateEntry } from "./types";

const RG_2854_GENERAL: ReadonlyArray<IvaRetentionRateEntry> = [
  // Cosas muebles — 80% / 100% no-cat
  {
    regime: "rg_2854_general",
    operationType: "cosas_muebles",
    supplierStatus: "responsable_inscripto",
    rate: 0.8,
    minimumIvaCentavos: 500_000,
  },
  {
    regime: "rg_2854_general",
    operationType: "cosas_muebles",
    supplierStatus: "no_categorizado",
    rate: 1.0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "cosas_muebles",
    supplierStatus: "monotributista",
    rate: 0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "cosas_muebles",
    supplierStatus: "exento",
    rate: 0,
    minimumIvaCentavos: 0,
  },
  // Servicios — 50% / 100% no-cat
  {
    regime: "rg_2854_general",
    operationType: "servicios",
    supplierStatus: "responsable_inscripto",
    rate: 0.5,
    minimumIvaCentavos: 500_000,
  },
  {
    regime: "rg_2854_general",
    operationType: "servicios",
    supplierStatus: "no_categorizado",
    rate: 1.0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "servicios",
    supplierStatus: "monotributista",
    rate: 0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "servicios",
    supplierStatus: "exento",
    rate: 0,
    minimumIvaCentavos: 0,
  },
  // Locaciones de inmuebles — 50% RI
  {
    regime: "rg_2854_general",
    operationType: "locaciones_inmuebles",
    supplierStatus: "responsable_inscripto",
    rate: 0.5,
    minimumIvaCentavos: 500_000,
  },
  {
    regime: "rg_2854_general",
    operationType: "locaciones_inmuebles",
    supplierStatus: "no_categorizado",
    rate: 1.0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "locaciones_inmuebles",
    supplierStatus: "monotributista",
    rate: 0,
    minimumIvaCentavos: 0,
  },
  {
    regime: "rg_2854_general",
    operationType: "locaciones_inmuebles",
    supplierStatus: "exento",
    rate: 0,
    minimumIvaCentavos: 0,
  },
];

export const DEFAULT_RATE_TABLE: ReadonlyArray<IvaRetentionRateEntry> = [
  ...RG_2854_GENERAL,
];

export const IVA_RETENTION_TABLES = {
  rg_2854_general: RG_2854_GENERAL,
} as const;
