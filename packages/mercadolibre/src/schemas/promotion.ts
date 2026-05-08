import { z } from "zod";
import { Currency, MeliItemId } from "./common";

// ---------------------------------------------------------------------------
// Promotions — `/seller-promotions/promotions` + `/seller-promotions/candidates`
// ---------------------------------------------------------------------------

export const PromotionType = z.enum([
  "DEAL",
  "DOD", // Deal of the day
  "LIGHTNING",
  "SMART",
  "PRICE_DISCOUNT",
  "PRICE_MATCHING",
  "UNHEALTHY_STOCK",
  "SELLER_COUPON_CAMPAIGN",
  "MARKETPLACE_CAMPAIGN",
  "VOLUME",
  "PRE_NEGOTIATED",
]);
export type PromotionType = z.infer<typeof PromotionType>;

export const PromotionCandidate = z.object({
  promotion_id: z.string(),
  promotion_type: z.union([PromotionType, z.string()]),
  /** When the seller can opt in. */
  start_date: z.string().optional(),
  finish_date: z.string().optional(),
  /** Suggested discount percent (1..100). */
  suggested_discount_percentage: z.number().nonnegative().nullable().optional(),
  /** Maximum discount the platform will allow on this candidate. */
  max_discount_percentage: z.number().nonnegative().nullable().optional(),
  /** Minimum discount required to qualify. */
  min_discount_percentage: z.number().nonnegative().nullable().optional(),
  /** Items eligible to opt in to this candidate. */
  items: z
    .array(
      z.object({
        id: MeliItemId,
        original_price: z.number().nonnegative().optional(),
        suggested_price: z.number().nonnegative().nullable().optional(),
        max_price: z.number().nonnegative().nullable().optional(),
        min_price: z.number().nonnegative().nullable().optional(),
        currency_id: Currency.optional(),
      }),
    )
    .optional(),
});
export type PromotionCandidate = z.infer<typeof PromotionCandidate>;

export const PromotionOptInRequest = z.object({
  promotion_id: z.string(),
  promotion_type: z.union([PromotionType, z.string()]).optional(),
  /** Discounted price the seller commits to. */
  deal_price: z.number().nonnegative(),
});
export type PromotionOptInRequest = z.infer<typeof PromotionOptInRequest>;

export const PromotionOptInResponse = z.object({
  id: MeliItemId,
  status: z.enum(["started", "finished", "candidate", "rejected"]).optional(),
  promotion_id: z.string().optional(),
  deal_price: z.number().nonnegative().optional(),
  original_price: z.number().nonnegative().optional(),
});
export type PromotionOptInResponse = z.infer<typeof PromotionOptInResponse>;
