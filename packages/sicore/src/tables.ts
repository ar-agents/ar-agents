/**
 * SICORE rate tables — snapshot 2024-Q4.
 *
 * IMPORTANT: these are SNAPSHOTS. Mínimos no imponibles and rate
 * scales are updated regularly (RG 5531/2024 was the last major
 * adjustment). Verify against the current AFIP/ARCA regulation before
 * filing. Override the table via `RetentionInput.rateTable` whenever
 * the period being calculated falls outside this snapshot.
 *
 * Source documents:
 *   - RG 830/00 (régimen general)
 *   - RG 5531/2024 (última actualización de mínimos no-imponibles)
 *   - Anexo II tipos 28, 36, 49, 78
 *
 * All amounts in ARS centavos (integers). Rates as fractions.
 */
import type { SicoreRateEntry } from "./types";

/**
 * Servicios — Locaciones de obra y/o servicios sin relación de
 * dependencia (Anexo II tipo 36).
 *
 *   Inscripto:      Rate 2% sobre el excedente de $67.170 mensual.
 *   No-inscripto:   Rate 28% sobre el TOTAL pagado (sin mínimo).
 *   Exento:         Rate 0% (con cert de no-retención RG 830 art 38).
 */
const SERVICIOS_TABLE: ReadonlyArray<SicoreRateEntry> = [
  {
    category: "servicios",
    status: "inscripto",
    minimumMonthlyCentavos: 6_717_000, // $67.170
    flatRate: 0.02,
  },
  {
    category: "servicios",
    status: "no_inscripto",
    minimumMonthlyCentavos: 0,
    flatRate: 0.28,
  },
  {
    category: "servicios",
    status: "exento",
    minimumMonthlyCentavos: 0,
    flatRate: 0,
  },
];

/**
 * Honorarios — Honorarios profesionales (Anexo II tipo 28).
 *
 *   Inscripto:      Escala progresiva 0% / 5% / 9% / 12% / 15% / 19% /
 *                   22% más un importe fijo por tramo. Mínimo $67.170.
 *   No-inscripto:   Rate 28% sobre el total.
 *   Exento:         Rate 0%.
 *
 * Escala honorarios inscripto (RG 5531/2024, sobre excedente del mínimo):
 *
 *   excedente hasta       rate    fijo
 *   ─────────────────     ────    ─────
 *   $    24.000           0%      $     0
 *   $    48.000           5%      $     0
 *   $    96.000           9%      $ 1.200
 *   $   192.000          12%      $ 5.520
 *   $   384.000          15%      $ 17.040
 *   $   768.000          19%      $ 45.840
 *   $ 1.000.000+         22%      $ 118.800
 */
const HONORARIOS_TABLE: ReadonlyArray<SicoreRateEntry> = [
  {
    category: "honorarios",
    status: "inscripto",
    minimumMonthlyCentavos: 6_717_000, // $67.170
    scale: [
      { upToCentavos: 2_400_000, rate: 0, fixedCentavos: 0 },
      { upToCentavos: 4_800_000, rate: 0.05, fixedCentavos: 0 },
      { upToCentavos: 9_600_000, rate: 0.09, fixedCentavos: 120_000 },
      { upToCentavos: 19_200_000, rate: 0.12, fixedCentavos: 552_000 },
      { upToCentavos: 38_400_000, rate: 0.15, fixedCentavos: 1_704_000 },
      { upToCentavos: 76_800_000, rate: 0.19, fixedCentavos: 4_584_000 },
      { upToCentavos: Infinity, rate: 0.22, fixedCentavos: 11_880_000 },
    ],
  },
  {
    category: "honorarios",
    status: "no_inscripto",
    minimumMonthlyCentavos: 0,
    flatRate: 0.28,
  },
  {
    category: "honorarios",
    status: "exento",
    minimumMonthlyCentavos: 0,
    flatRate: 0,
  },
];

/**
 * Bienes — Compraventa de cosas muebles (Anexo II tipo 78).
 *
 *   Inscripto:      Rate 2% sobre el excedente de $224.000 mensual.
 *   No-inscripto:   Rate 10% sobre el total.
 *   Exento:         Rate 0%.
 */
const BIENES_TABLE: ReadonlyArray<SicoreRateEntry> = [
  {
    category: "bienes",
    status: "inscripto",
    minimumMonthlyCentavos: 22_400_000, // $224.000
    flatRate: 0.02,
  },
  {
    category: "bienes",
    status: "no_inscripto",
    minimumMonthlyCentavos: 0,
    flatRate: 0.1,
  },
  {
    category: "bienes",
    status: "exento",
    minimumMonthlyCentavos: 0,
    flatRate: 0,
  },
];

/**
 * Alquileres — Locaciones de inmuebles urbanos (Anexo II tipo 49).
 *
 *   Inscripto:      Rate 6% sobre el excedente de $30.000 mensual.
 *   No-inscripto:   Rate 28% sobre el total.
 *   Exento:         Rate 0%.
 */
const ALQUILERES_TABLE: ReadonlyArray<SicoreRateEntry> = [
  {
    category: "alquileres",
    status: "inscripto",
    minimumMonthlyCentavos: 3_000_000, // $30.000
    flatRate: 0.06,
  },
  {
    category: "alquileres",
    status: "no_inscripto",
    minimumMonthlyCentavos: 0,
    flatRate: 0.28,
  },
  {
    category: "alquileres",
    status: "exento",
    minimumMonthlyCentavos: 0,
    flatRate: 0,
  },
];

/**
 * Default rate-table shipping with the package (2024-Q4 snapshot).
 * Combines all four categories. Override per-call when the period
 * falls outside this snapshot.
 */
export const DEFAULT_RATE_TABLE: ReadonlyArray<SicoreRateEntry> = [
  ...SERVICIOS_TABLE,
  ...HONORARIOS_TABLE,
  ...BIENES_TABLE,
  ...ALQUILERES_TABLE,
];

/** Re-exported for callers that want to compose subsets. */
export const SICORE_TABLES = {
  servicios: SERVICIOS_TABLE,
  honorarios: HONORARIOS_TABLE,
  bienes: BIENES_TABLE,
  alquileres: ALQUILERES_TABLE,
} as const;
