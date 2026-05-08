import { z } from "zod";
import { Amount } from "./common.js";

// ACP `Total` — appears on line items, fulfillment options, and order-level.
// Same shape everywhere.
export const TotalType = z.enum([
  "items_base_amount",
  "items_discount",
  "subtotal",
  "discount",
  "fulfillment",
  "tax",
  "fee",
  "gift_wrap",
  "tip",
  "store_credit",
  "total",
  "amount_refunded",
]);
export type TotalType = z.infer<typeof TotalType>;

export const TaxBreakdownItem = z.object({
  display_text: z.string(),
  amount: Amount,
  rate: z.number().nonnegative().optional(),
  jurisdiction: z.string().optional(),
  type: z.string().optional(),
});
export type TaxBreakdownItem = z.infer<typeof TaxBreakdownItem>;

export const Total = z.object({
  type: TotalType,
  display_text: z.string(),
  amount: Amount,
  presentment_amount: Amount.optional(),
  description: z.string().optional(),
  breakdown: z.array(TaxBreakdownItem).optional(),
});
export type Total = z.infer<typeof Total>;

export const Totals = z.array(Total);
export type Totals = z.infer<typeof Totals>;
