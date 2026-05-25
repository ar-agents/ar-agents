/**
 * Default contribution rate table — snapshot of Argentine social
 * security rates as of 2024-Q4.
 *
 * IMPORTANT: these are SNAPSHOTS. The exact percentages depend on:
 *   - Decreto 814/01 + posteriores (régimen general)
 *   - Decreto 1009/01 (grandes empleadores)
 *   - Ley 27.541 + Ley 27.430 (modificaciones recientes)
 *   - Cualquier modificación 2025-2026
 *
 * Override via `RetentionInput.rateTable` when the period being
 * filed is outside this snapshot.
 *
 * EMPLEADO (aportes que descontás de la remuneración):
 *   - Jubilación SIPA:  11%
 *   - INSSJP (PAMI):     3%
 *   - Obra social:       3%
 *
 * EMPLEADOR (contribuciones sobre la remuneración, vector A SICOSS):
 *   - Régimen General (Decreto 814/01 → 18% total):
 *       Jubilación SIPA:          10.17%
 *       INSSJP:                    1.50%
 *       Asignaciones Familiares:   4.70%
 *       Fondo Nacional Empleo:     0.94%
 *       Subtotal SS:              17.31%  ←  AFIP suele decir "18%" redondeando
 *   - Grandes Empleadores (industria + comercio mayorista del listado
 *     del Decreto 1009/01 → 20.4% total):
 *       Jubilación SIPA:          12.71%
 *       INSSJP:                    1.62%
 *       Asignaciones Familiares:   5.40%
 *       Fondo Nacional Empleo:     1.07%
 *       Subtotal SS:              20.80%  ←  AFIP suele decir "20.4%" redondeando
 *
 * Obra Social (vector B), aportes empleador:  6%  (mismo en ambos regímenes)
 *
 * ART (vector C): no hay un % fijo — depende del contrato con la ART
 * provider, normalmente 4-8% sobre la masa salarial. Default acá: 5%.
 */
import type { ContributionRateTable } from "./types";

export const DEFAULT_RATE_TABLE: ContributionRateTable = {
  jubilacionEmpleado: 0.11,
  inssjpEmpleado: 0.03,
  obraSocialEmpleado: 0.03,

  jubilacionEmpleadorGeneral: 0.1017,
  jubilacionEmpleadorGrandes: 0.1271,

  inssjpEmpleadorGeneral: 0.015,
  inssjpEmpleadorGrandes: 0.0162,

  asignacionesFamiliaresGeneral: 0.047,
  asignacionesFamiliaresGrandes: 0.054,

  fneGeneral: 0.0094,
  fneGrandes: 0.0107,

  obraSocialEmpleadorGeneral: 0.06,
  obraSocialEmpleadorGrandes: 0.06,

  artDefault: 0.05,
};
