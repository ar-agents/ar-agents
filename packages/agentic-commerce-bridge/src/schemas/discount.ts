import { z } from "zod";
import { Amount, Currency } from "./common";

// ACP `Coupon` — `percent_off` and `amount_off` are mutually exclusive.
export const Coupon = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    percent_off: z.number().min(0).max(100).optional(),
    amount_off: Amount.optional(),
    currency: Currency.optional(),
    duration: z.enum(["once", "repeating", "forever"]).optional(),
    duration_in_months: z.number().int().positive().optional(),
    max_redemptions: z.number().int().positive().optional(),
    times_redeemed: z.number().int().nonnegative().optional(),
  })
  .refine(
    (c) =>
      (c.percent_off === undefined) !== (c.amount_off === undefined),
    {
      message:
        "Coupon must have exactly one of `percent_off` or `amount_off`.",
    },
  );
export type Coupon = z.infer<typeof Coupon>;

export const DiscountAllocation = z.object({
  path: z.string(),
  amount: Amount,
});
export type DiscountAllocation = z.infer<typeof DiscountAllocation>;

export const AppliedDiscount = z.object({
  id: z.string().min(1),
  code: z.string().optional(),
  coupon: Coupon,
  amount: Amount,
  automatic: z.boolean().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  method: z.enum(["each", "across"]).optional(),
  priority: z.number().int().optional(),
  allocations: z.array(DiscountAllocation).optional(),
});
export type AppliedDiscount = z.infer<typeof AppliedDiscount>;

export const DiscountErrorCode = z.enum([
  "code_not_found",
  "code_expired",
  "code_max_redemptions_reached",
  "code_minimum_not_met",
  "code_not_applicable_to_items",
  "code_currency_mismatch",
  "code_inactive",
]);
export type DiscountErrorCode = z.infer<typeof DiscountErrorCode>;

export const RejectedDiscount = z.object({
  code: z.string(),
  reason: z.union([DiscountErrorCode, z.string()]),
  message: z.string().optional(),
});
export type RejectedDiscount = z.infer<typeof RejectedDiscount>;

export const DiscountsResponse = z.object({
  codes: z.array(z.string()).optional(),
  applied: z.array(AppliedDiscount).optional(),
  rejected: z.array(RejectedDiscount).optional(),
});
export type DiscountsResponse = z.infer<typeof DiscountsResponse>;

// On create/update request, agents pass codes only. The legacy `coupons`
// field is deprecated as of 2026-04-17 — we accept but normalize.
export const DiscountsRequest = z.object({
  codes: z.array(z.string().min(1)),
});
export type DiscountsRequest = z.infer<typeof DiscountsRequest>;
