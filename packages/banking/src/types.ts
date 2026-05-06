/**
 * BCRA Central de Deudores result for a single CUIT.
 */
export interface BcraDeudaResult {
  /** The CUIT that was queried, normalized to 11 bare digits. */
  cuit: string;
  /**
   * `true` when BCRA returned a record. `false` when the CUIT isn't in the
   * registry, the service is down, or no adapter is configured. Always check
   * before reading `data`.
   */
  available: boolean;
  /**
   * Spanish-language explanation when `available: false`. ALWAYS surface
   * verbatim to end users — it's the actionable signal (e.g., "CUIT no
   * tiene antecedentes crediticios" vs "BCRA no responde").
   */
  error: string | null;
  /** Normalized BCRA data when `available: true`. `null` otherwise. */
  data: BcraDeudaData | null;
}

/**
 * BCRA situation codes (1–6). 0 means "no debt reported in the period".
 *
 * - **1 — Normal**: payments on time
 * - **2 — Riesgo bajo**: <90 days past due
 * - **3 — Riesgo medio**: 90-180 days past due
 * - **4 — Riesgo alto**: 180-365 days past due
 * - **5 — Irrecuperable**: 365+ days past due, written off
 * - **6 — Irrecuperable disposición técnica**: very rare admin write-off
 */
export type BcraSituation = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BcraDeudaData {
  /** Taxpayer name as registered with BCRA. */
  name: string;
  /** Reporting period in YYYYMM format (e.g., "202604"). */
  period: string;
  /**
   * Worst situation code across all reporting entities. The headline
   * risk score for this taxpayer. 0 means no entity reported debt.
   */
  worstSituation: BcraSituation;
  /** Sum of debt amounts across all entities, in ARS. */
  totalAmount: number;
  /**
   * Per-entity breakdown. An entity is a bank or PSP that has a credit
   * relationship with this taxpayer.
   */
  entities: BcraDebtEntity[];
}

export interface BcraDebtEntity {
  /** Entity name (bank or PSP). */
  entity: string;
  /** BCRA situation code for this entity's loan to this taxpayer. */
  situation: BcraSituation;
  /** Outstanding amount owed to this entity, in ARS. */
  amount: number;
  /** Days past due. 0 means current. */
  daysOverdue: number;
  /** True if the loan has been refinanced. */
  refinanced: boolean;
  /** True if the situation is currently under review. */
  inReview: boolean;
  /** True if the entity has initiated legal proceedings. */
  inLitigation: boolean;
}

/**
 * Spanish-language description of a BCRA situation code, suitable for
 * surfacing to end users.
 */
export function describeSituation(situation: BcraSituation): string {
  switch (situation) {
    case 0:
      return "Sin deuda reportada en el período.";
    case 1:
      return "Situación normal: pagos al día.";
    case 2:
      return "Riesgo bajo: hasta 90 días de mora.";
    case 3:
      return "Riesgo medio: entre 90 y 180 días de mora.";
    case 4:
      return "Riesgo alto: entre 180 y 365 días de mora.";
    case 5:
      return "Irrecuperable: más de 365 días de mora.";
    case 6:
      return "Irrecuperable por disposición técnica.";
  }
}
