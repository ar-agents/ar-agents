import { z } from "zod";

// ---------------------------------------------------------------------------
// Seller reputation — `/users/{id}/seller_reputation`
// ---------------------------------------------------------------------------

export const ReputationLevel = z.enum([
  "5_green",
  "4_light_green",
  "3_yellow",
  "2_orange",
  "1_red",
  "newbie",
]);
export type ReputationLevel = z.infer<typeof ReputationLevel>;

export const PowerSellerStatus = z.enum(["platinum", "gold", "silver"]).nullable();
export type PowerSellerStatus = z.infer<typeof PowerSellerStatus>;

export const ReputationMetric = z.object({
  rate: z.number().min(0).max(1).optional(),
  value: z.number().nonnegative().optional(),
});
export type ReputationMetric = z.infer<typeof ReputationMetric>;

export const ReputationMetrics = z.object({
  claims: z
    .object({
      rate: z.number().min(0).max(1).optional(),
      value: z.number().nonnegative().optional(),
      period: z.string().optional(),
      excluded: z.unknown().optional(),
    })
    .optional(),
  delayed_handling_time: z
    .object({
      rate: z.number().min(0).max(1).optional(),
      value: z.number().nonnegative().optional(),
      period: z.string().optional(),
    })
    .optional(),
  cancellations: z
    .object({
      rate: z.number().min(0).max(1).optional(),
      value: z.number().nonnegative().optional(),
      period: z.string().optional(),
    })
    .optional(),
  sales: z
    .object({
      period: z.string().optional(),
      completed: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ReputationMetrics = z.infer<typeof ReputationMetrics>;

export const SellerReputation = z.object({
  level_id: ReputationLevel.nullable().optional(),
  power_seller_status: PowerSellerStatus.optional(),
  protection_end_date: z.string().nullable().optional(),
  status: z
    .object({
      list: z
        .object({
          allow: z.boolean().optional(),
          codes: z.array(z.string()).optional(),
        })
        .optional(),
      buy: z
        .object({
          allow: z.boolean().optional(),
          codes: z.array(z.string()).optional(),
        })
        .optional(),
      sell: z
        .object({
          allow: z.boolean().optional(),
          codes: z.array(z.string()).optional(),
        })
        .optional(),
      billing: z
        .object({
          allow: z.boolean().optional(),
          codes: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  transactions: z
    .object({
      canceled: z.number().int().nonnegative().optional(),
      completed: z.number().int().nonnegative().optional(),
      period: z.string().optional(),
      ratings: z
        .object({
          negative: z.number().min(0).max(1).optional(),
          neutral: z.number().min(0).max(1).optional(),
          positive: z.number().min(0).max(1).optional(),
        })
        .optional(),
      total: z.number().int().nonnegative().optional(),
    })
    .optional(),
  metrics: ReputationMetrics.optional(),
});
export type SellerReputation = z.infer<typeof SellerReputation>;

// ---------------------------------------------------------------------------
// Reputation alert (synthesized by the monitor — not part of MELI's API).
// ---------------------------------------------------------------------------

export const ReputationAlertSeverity = z.enum(["info", "warning", "critical"]);
export type ReputationAlertSeverity = z.infer<typeof ReputationAlertSeverity>;

export const ReputationAlert = z.object({
  severity: ReputationAlertSeverity,
  title: z.string(),
  detail: z.string(),
  metric: z.string().optional(),
  current_value: z.number().optional(),
  threshold: z.number().optional(),
});
export type ReputationAlert = z.infer<typeof ReputationAlert>;
