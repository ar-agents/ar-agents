/**
 * @ar-agents/treasury/tools — Vercel AI SDK 6 tool wrappers for the treasury rail.
 *
 * Drop into an `Experimental_Agent` so a Sociedad Automatizada can reason about
 * its crypto<->peso treasury and its AFIP obligations. Eight tools:
 *
 *   PURE (always available, no PSAV credentials needed):
 *     treasury_tax_estimate      cedular tax on a crypto disposal
 *     treasury_monotributo       monthly cuota + category for an income
 *     treasury_buffer_status     ARS buffer needed for upcoming obligations
 *     treasury_plan_conversion   how much USDC to convert to fund the buffer
 *     treasury_settlement_plan   HOW an obligation gets paid (honest autonomy)
 *
 *   PSAV-BACKED (need an OffRampAdapter; degrade to {available:false} without one):
 *     treasury_offramp_quote     live USDC->ARS quote
 *     treasury_offramp_convert   execute the off-ramp — IRREVERSIBLE
 *     treasury_offramp_status    poll a prior convert
 *
 * The convert tool is irreversible. In the generated society it is wrapped by
 * guardTools (kill-switch) and the agent's requireConfirmation (RFC-001); the
 * tool itself just performs the call and returns the receipt for the audit log.
 *
 * This entry point needs the `ai` + `zod` peers. The package's main entry
 * (@ar-agents/treasury) is pure and pulls in neither.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  cedularTax,
  nextObligation,
  planConversion,
  requiredArsBuffer,
  type Obligation,
  type OffRampAdapter,
} from "./index";
import {
  categoryForAnnualIncome,
  monotributoCuota,
  MONOTRIBUTO_TABLE_EFFECTIVE,
  settlementPlan,
  type MonotributoCategory,
} from "./afip";

export interface TreasuryToolsOptions {
  /**
   * The registered-PSAV off-ramp (e.g. MantecaOffRampAdapter). Omit to expose the
   * five pure tools only; the three off-ramp tools then return {available:false}.
   */
  offramp?: OffRampAdapter;
  /** Injectable clock for buffer math. Default Date.now. */
  now?: () => number;
}

const DAY_MS = 86_400_000;

const obligationSchema = z.object({
  id: z.string(),
  kind: z.enum(["monotributo", "vep", "iibb", "cedular"]),
  amountArs: z.number(),
  dueAtMs: z.number().describe("Epoch ms the obligation is due."),
});

export function treasuryTools(options: TreasuryToolsOptions = {}) {
  const now = options.now ?? Date.now;
  const offramp = options.offramp;
  const noOfframp = {
    available: false as const,
    reason:
      "No off-ramp configured. Set MANTECA_API_KEY (+ user/bank-account) to enable USDC->ARS conversion.",
  };

  return {
    treasury_tax_estimate: tool({
      description:
        "Estimate the Impuesto a las Ganancias cedular owed (in ARS) on disposing crypto. " +
        "Use before converting USDC->ARS so the society reserves the tax. Rate is 5% when sold " +
        "in pesos without adjustment clause, 15% in foreign currency, on the GAIN only (0 if no gain). " +
        "Crypto is IVA-exempt; holding + own-wallet transfers are not taxable. Pure, no side effects.",
      inputSchema: z.object({
        amountUsd: z.number().positive(),
        costBasisPerUsd: z
          .number()
          .default(1)
          .describe("Acquisition cost per USDC unit (≈1 for stablecoins)."),
        fxRate: z.number().positive().describe("ARS per USD at disposal."),
        denom: z
          .enum(["ARS", "FOREIGN"])
          .default("ARS")
          .describe("Sale denominated in pesos (5%) or foreign currency (15%)."),
      }),
      execute: async ({ amountUsd, costBasisPerUsd, fxRate, denom }) => {
        const taxArs = cedularTax(amountUsd, costBasisPerUsd, fxRate, denom);
        const proceeds = amountUsd * fxRate;
        const gainArs = Math.max(0, proceeds - amountUsd * costBasisPerUsd * fxRate);
        return {
          taxArs,
          gainArs,
          ratePct: denom === "ARS" ? 5 : 15,
          denom,
          note: "Cedular sobre la ganancia. Cripto exento de IVA.",
        };
      },
    }),

    treasury_monotributo: tool({
      description:
        "Look up the monthly monotributo cuota (ARS) and/or the category for an annual income. " +
        "Pass `category` to get its cuota, or `annualIncomeArs` to resolve the category. " +
        "Values eff. " +
        MONOTRIBUTO_TABLE_EFFECTIVE +
        " (IPC-indexed ~6mo). Monotributo is for a persona-humana operator; a SAS/SRL is in the " +
        "general regime. Pure.",
      inputSchema: z.object({
        activity: z.enum(["servicios", "bienes"]),
        category: z
          .enum(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"])
          .optional(),
        annualIncomeArs: z.number().nonnegative().optional(),
      }),
      execute: async ({ activity, category, annualIncomeArs }) => {
        let cat: MonotributoCategory | null = category ?? null;
        if (!cat && annualIncomeArs !== undefined) {
          cat = categoryForAnnualIncome(annualIncomeArs, activity);
        }
        if (!cat) {
          return {
            available: false as const,
            reason:
              annualIncomeArs !== undefined
                ? "Income exceeds the monotributo ceiling; move to the general regime."
                : "Provide `category` or `annualIncomeArs`.",
          };
        }
        return {
          category: cat,
          activity,
          cuotaArs: monotributoCuota(cat, activity),
          tableEffective: MONOTRIBUTO_TABLE_EFFECTIVE,
        };
      },
    }),

    treasury_buffer_status: tool({
      description:
        "Given the current ARS balance and upcoming AFIP obligations, compute the peso buffer " +
        "needed within a horizon (with a safety multiple) and any shortfall. Use to decide whether " +
        "to convert crypto. Pure (clock injected).",
      inputSchema: z.object({
        arsBalance: z.number().nonnegative(),
        obligations: z.array(obligationSchema),
        horizonDays: z.number().positive().default(30),
        safety: z.number().min(1).default(1.1),
      }),
      execute: async ({ arsBalance, obligations, horizonDays, safety }) => {
        const t = now();
        const obs = obligations as Obligation[];
        const requiredArs = requiredArsBuffer(obs, t, horizonDays * DAY_MS, safety);
        const next = nextObligation(obs, t);
        return {
          requiredArs,
          arsBalance,
          shortfallArs: Math.max(0, requiredArs - arsBalance),
          funded: arsBalance >= requiredArs,
          horizonDays,
          nextObligation: next
            ? { id: next.id, kind: next.kind, amountArs: next.amountArs, dueAtMs: next.dueAtMs }
            : null,
        };
      },
    }),

    treasury_plan_conversion: tool({
      description:
        "Plan a just-in-time USDC->ARS conversion: how much USDC to convert to top the ARS buffer " +
        "to `requiredArs`, net of spread, capped by available USDC. Never over-converts (minimizes " +
        "taxable disposals + fx exposure). Returns convertUsd=0 if the buffer is already met. Pure — " +
        "this PLANS, it does not execute (use treasury_offramp_convert for that).",
      inputSchema: z.object({
        usd: z.number().nonnegative().describe("USDC available."),
        ars: z.number().nonnegative().describe("Current ARS balance."),
        costBasisPerUsd: z.number().default(1),
        requiredArs: z.number().nonnegative(),
        fxRate: z.number().positive(),
        spread: z.number().min(0).max(1).default(0.01),
      }),
      execute: async ({ usd, ars, costBasisPerUsd, requiredArs, fxRate, spread }) => {
        return planConversion({ usd, ars, costBasisPerUsd }, requiredArs, fxRate, spread);
      },
    }),

    treasury_settlement_plan: tool({
      description:
        "Describe HOW a tax obligation actually gets paid under a chosen method, honestly. " +
        "IMPORTANT: no method lets the agent pay autonomously at pay-time (canAutoExecute is always " +
        "false). 'debito_automatico' is passive after a one-time human enrolment (the agent just keeps " +
        "the CVU funded); 'vep_manual'/'mp_manual' need a human each time. Use to tell the operator " +
        "exactly what to do. Pure.",
      inputSchema: z.object({
        amountArs: z.number().nonnegative(),
        dueAtMs: z.number(),
        kind: z.enum(["monotributo", "vep", "iibb", "cedular"]).default("monotributo"),
        method: z.enum(["debito_automatico", "vep_manual", "mp_manual"]),
      }),
      execute: async ({ amountArs, dueAtMs, kind, method }) => {
        return settlementPlan({ id: `${kind}-${dueAtMs}`, kind, amountArs, dueAtMs }, method);
      },
    }),

    treasury_offramp_quote: tool({
      description:
        "Get a live USDC->ARS quote from the configured registered-PSAV off-ramp (e.g. Manteca). " +
        "Read-only, no side effects. Returns {available:false} if no off-ramp is configured.",
      inputSchema: z.object({ amountUsd: z.number().positive() }),
      execute: async ({ amountUsd }) => {
        if (!offramp) return noOfframp;
        const q = await offramp.quote(amountUsd);
        return { available: true as const, ...q };
      },
    }),

    treasury_offramp_convert: tool({
      description:
        "EXECUTE an off-ramp: sell USDC and pay out ARS to the society's CVU via the registered PSAV. " +
        "IRREVERSIBLE — moves real money. Only call after a human approval (RFC-001); the call is also " +
        "hard-gated by the kill-switch. Settlement is asynchronous; confirm with treasury_offramp_status. " +
        "Returns {available:false} if no off-ramp is configured.",
      inputSchema: z.object({
        amountUsd: z.number().positive(),
        externalId: z
          .string()
          .optional()
          .describe("Idempotency key so a retry never double-spends."),
      }),
      execute: async ({ amountUsd, externalId }) => {
        if (!offramp) return noOfframp;
        const receipt = await offramp.convert(
          amountUsd,
          externalId ? { externalId } : undefined,
        );
        return { available: true as const, ...receipt };
      },
    }),

    treasury_offramp_status: tool({
      description:
        "Poll the settlement status of a prior treasury_offramp_convert by its txId. Use to confirm " +
        "the ARS actually landed in the CVU before marking an obligation funded. Returns " +
        "{available:false} if no off-ramp (or it does not support status polling).",
      inputSchema: z.object({ txId: z.string() }),
      execute: async ({ txId }) => {
        if (!offramp) return noOfframp;
        if (!offramp.getStatus)
          return { available: false as const, reason: "Off-ramp does not support status polling." };
        const report = await offramp.getStatus(txId);
        return { available: true as const, ...report };
      },
    }),
  };
}
