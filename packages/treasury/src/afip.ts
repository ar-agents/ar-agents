/**
 * The AFIP/ARCA fiscal layer of the treasury rail.
 *
 * (ARCA = Agencia de Recaudación y Control Aduanero, the continuator of AFIP per
 * Decreto 953/2024, eff. 5-nov-2024. afip.gob.ar URLs still resolve.)
 *
 * THE HONEST FINDING (verified jun-2026): there is NO fully-autonomous, official
 * channel for a private entity to pay its taxes at pay-time. So this module does
 * NOT pretend to "pay AFIP." It does the parts that are real:
 *   1. Compute the obligation (monotributo cuota here; cedular lives in index.ts).
 *   2. Describe the settlement honestly — what is automatable vs. human-required.
 * The treasury brain (index.ts) sizes + funds the ARS buffer so that whatever
 * settlement rail the society configured can succeed on time.
 *
 * Why no autonomy (all verified against ARCA + MercadoPago official docs):
 *   - WSCREATEVEP (create a VEP via web service) is enabled ONLY for public
 *     organisms, not private taxpayers. Do not build on it.
 *   - Monotributo débito automático CANNOT be enrolled via API — it is a one-time
 *     portal/bank step. Once enrolled it runs PASSIVELY (the monthly cuota debits
 *     itself). The agent cannot trigger it; it can only ensure the CVU is funded.
 *   - There is NO MercadoPago API to pay a VEP — it is a manual in-app flow
 *     (scan QR, or enter CUIT + VEP number).
 * Full sourcing: ../../TREASURY-FISCAL-RAIL.md §3.
 */

import type { Ars, Obligation } from "./index";

/**
 * Guard constant: documents (so nobody re-adds it) why WSCREATEVEP is unusable.
 */
export const WSCREATEVEP_IS_GOV_ONLY =
  "AFIP/ARCA WSCREATEVEP is enabled only for public organisms (organismos " +
  "recaudadores), not private taxpayers. Do not build VEP creation on it. " +
  "See TREASURY-FISCAL-RAIL.md §3.";

// ─────────────────────────────────────────────────────────────────────────────
// Monotributo — the cleanest automatable (passive) path for a small operator.
// Values per ARCA "Valores de aplicación desde el 1/02/2026". IPC-indexed ~every
// 6 months: re-verify against https://www.afip.gob.ar/monotributo/categorias.asp.
// Categories I/J/K require venta de bienes; a servicios taxpayer caps at H.
// NOTE: monotributo is for personas humanas. A SAS/SRL/SA is in the general
// regime (Ganancias + IVA + IIBB) — compute those via @ar-agents/facturacion +
// sicore; this table is for a monotributista operator.
// ─────────────────────────────────────────────────────────────────────────────

export const MONOTRIBUTO_TABLE_EFFECTIVE = "2026-02-01";

export type MonotributoCategory =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export type MonotributoActivity = "servicios" | "bienes";

export interface MonotributoRow {
  category: MonotributoCategory;
  /** Annual gross-income ceiling for the category, ARS. */
  annualCapArs: Ars;
  /** Monthly total cuota for a services taxpayer, ARS. */
  cuotaServicios: Ars;
  /** Monthly total cuota for a goods taxpayer, ARS. */
  cuotaBienes: Ars;
  /** I/J/K are only available when selling goods. */
  bienesOnly: boolean;
}

export const MONOTRIBUTO_2026: readonly MonotributoRow[] = [
  { category: "A", annualCapArs: 10_277_988.13, cuotaServicios: 42_386.74, cuotaBienes: 42_386.74, bienesOnly: false },
  { category: "B", annualCapArs: 15_058_447.71, cuotaServicios: 48_250.78, cuotaBienes: 48_250.78, bienesOnly: false },
  { category: "C", annualCapArs: 21_113_696.52, cuotaServicios: 56_501.85, cuotaBienes: 55_227.06, bienesOnly: false },
  { category: "D", annualCapArs: 26_212_853.42, cuotaServicios: 72_414.10, cuotaBienes: 70_661.26, bienesOnly: false },
  { category: "E", annualCapArs: 30_833_964.37, cuotaServicios: 102_537.97, cuotaBienes: 92_658.35, bienesOnly: false },
  { category: "F", annualCapArs: 38_642_048.36, cuotaServicios: 129_045.32, cuotaBienes: 111_198.27, bienesOnly: false },
  { category: "G", annualCapArs: 46_211_109.37, cuotaServicios: 197_108.23, cuotaBienes: 135_918.34, bienesOnly: false },
  { category: "H", annualCapArs: 70_113_407.33, cuotaServicios: 447_346.93, cuotaBienes: 272_063.40, bienesOnly: false },
  { category: "I", annualCapArs: 78_479_211.62, cuotaServicios: 824_802.26, cuotaBienes: 406_512.05, bienesOnly: true },
  { category: "J", annualCapArs: 89_872_640.30, cuotaServicios: 999_007.65, cuotaBienes: 497_059.41, bienesOnly: true },
  { category: "K", annualCapArs: 108_357_084.05, cuotaServicios: 1_381_687.90, cuotaBienes: 600_879.51, bienesOnly: true },
];

/** Monthly monotributo cuota for a category + activity, ARS. */
export function monotributoCuota(
  category: MonotributoCategory,
  activity: MonotributoActivity,
): Ars {
  const row = MONOTRIBUTO_2026.find((r) => r.category === category);
  if (!row) throw new Error(`unknown monotributo category: ${category}`);
  if (row.bienesOnly && activity === "servicios") {
    throw new Error(
      `category ${category} is only available for venta de bienes (servicios caps at H)`,
    );
  }
  return activity === "servicios" ? row.cuotaServicios : row.cuotaBienes;
}

/**
 * The category an annual gross income falls into, for the given activity. A
 * services taxpayer caps at H; returns null if income exceeds the regime ceiling
 * (the taxpayer must move to the general regime).
 */
export function categoryForAnnualIncome(
  annualArs: Ars,
  activity: MonotributoActivity,
): MonotributoCategory | null {
  const rows = MONOTRIBUTO_2026.filter(
    (r) => activity === "bienes" || !r.bienesOnly,
  );
  for (const r of rows) {
    if (annualArs <= r.annualCapArs) return r.category;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settlement model — HOW an obligation actually gets paid. The honest core:
// NO method lets the agent settle autonomously at pay-time (canAutoExecute is
// the literal type `false`). They differ in whether a one-time human setup makes
// payment PASSIVE thereafter, or whether a human is needed every time.
// ─────────────────────────────────────────────────────────────────────────────

export type SettlementMethod = "debito_automatico" | "vep_manual" | "mp_manual";

/**
 * - `passive`: a one-time human enrolment makes future payments run themselves;
 *   the agent only has to keep the CVU funded (débito automático).
 * - `human-required`: a human must act for THIS payment (generate + pay a VEP).
 */
export type SettlementAutonomy = "passive" | "human-required";

export interface SettlementPlan {
  method: SettlementMethod;
  autonomy: SettlementAutonomy;
  /**
   * Whether the agent can settle with zero human action at pay-time. Typed as the
   * literal `false`: in jun-2026 NO official channel allows fully-autonomous tax
   * payment by a private entity. The rail funds + instructs; it does not pay.
   */
  canAutoExecute: false;
  amountArs: Ars;
  /** Epoch ms the obligation is due. */
  dueAtMs: number;
  /** What must happen for this obligation to actually be paid. */
  instruction: string;
  /** One-time human setup this method needs (empty string if none). */
  oneTimeSetup: string;
}

/**
 * Describe how a given obligation gets settled under the chosen method. Pure +
 * honest: the agent's autonomous part is funding the CVU (see index.ts
 * fundTaxBuffer); the settlement itself is passive (débito) or human (VEP/MP).
 */
export function settlementPlan(
  obligation: Obligation,
  method: SettlementMethod,
): SettlementPlan {
  const base = {
    amountArs: obligation.amountArs,
    dueAtMs: obligation.dueAtMs,
    canAutoExecute: false as const,
  };
  switch (method) {
    case "debito_automatico":
      return {
        ...base,
        method,
        autonomy: "passive",
        instruction:
          "Mantené al menos ARS " +
          obligation.amountArs.toFixed(2) +
          " en el CVU antes del vencimiento; el débito automático cobra la cuota solo.",
        oneTimeSetup:
          "Adherí el CBU/CVU al débito automático en el Portal Monotributo de ARCA (paso único, no hay API; el alta debe estar antes del día 20 para el débito del día 7 siguiente).",
      };
    case "vep_manual":
      return {
        ...base,
        method,
        autonomy: "human-required",
        instruction:
          "Generá el VEP/QR en ARCA (Mis Aplicaciones) y pagalo escaneando el QR o ingresando CUIT + número de VEP en tu billetera. El agente no puede pagar el VEP por API.",
        oneTimeSetup: "",
      };
    case "mp_manual":
      return {
        ...base,
        method,
        autonomy: "human-required",
        instruction:
          "Generá el VEP en ARCA y pagalo en Mercado Pago (Cuentas y servicios → AFIP VEP, o escaneá el QR). No existe API de Mercado Pago para pagar un VEP.",
        oneTimeSetup: "",
      };
  }
}
