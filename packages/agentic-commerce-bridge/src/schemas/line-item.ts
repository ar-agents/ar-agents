import { z } from "zod";
import { Amount, ISODateTime } from "./common.js";
import { Disclosure } from "./messages.js";
import { Total } from "./totals.js";

// ACP `Item` — minimal product reference. The merchant resolves this against
// its catalog. `unit_amount` is the canonical price-at-the-time-of-quote.
export const Item = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  unit_amount: Amount.optional(),
});
export type Item = z.infer<typeof Item>;

// LineItem.weight + LineItem.dimensions for shipping calculations (and for
// MercadoEnvíos lookup).
export const Weight = z.object({
  value: z.number().nonnegative(),
  unit: z.enum(["g", "kg", "oz", "lb"]),
});
export type Weight = z.infer<typeof Weight>;

export const Dimensions = z.object({
  length: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  unit: z.enum(["cm", "in"]),
});
export type Dimensions = z.infer<typeof Dimensions>;

export const AvailabilityStatus = z.enum([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "backorder",
  "pre_order",
]);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

export const VariantOption = z.object({
  name: z.string(),
  value: z.string(),
});
export type VariantOption = z.infer<typeof VariantOption>;

export const CustomAttribute = z.object({
  display_name: z.string(),
  value: z.string(),
});
export type CustomAttribute = z.infer<typeof CustomAttribute>;

export const DiscountDetail = z.object({
  amount: Amount,
  display_text: z.string().optional(),
  type: z.string().optional(),
});
export type DiscountDetail = z.infer<typeof DiscountDetail>;

export const MarketplaceSellerDetails = z.object({
  name: z.string(),
});
export type MarketplaceSellerDetails = z.infer<typeof MarketplaceSellerDetails>;

// ACP `LineItem`. `quantity` became `number` (decimal) for B2B in 2026-04-17.
export const LineItem = z.object({
  id: z.string().min(1),
  item: Item,
  quantity: z.number().positive(),
  name: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  unit_amount: Amount.optional(),
  disclosures: z.array(Disclosure).optional(),
  custom_attributes: z.array(CustomAttribute).optional(),
  marketplace_seller_details: MarketplaceSellerDetails.optional(),
  product_id: z.string().optional(),
  sku: z.string().optional(),
  variant_id: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  weight: Weight.optional(),
  dimensions: Dimensions.optional(),
  availability_status: AvailabilityStatus.optional(),
  available_quantity: z.number().nonnegative().optional(),
  max_quantity_per_order: z.number().positive().optional(),
  fulfillable_on: ISODateTime.optional(),
  variant_options: z.array(VariantOption).optional(),
  discount_details: z.array(DiscountDetail).optional(),
  tax_exempt: z.boolean().optional(),
  tax_exemption_reason: z.string().optional(),
  parent_id: z.string().optional(),
  totals: z.array(Total),
});
export type LineItem = z.infer<typeof LineItem>;

// On the create-session request, line items are minimal — just id + quantity.
// The merchant fills in the rest before responding.
export const LineItemCreateInput = z.object({
  id: z.string().min(1),
  quantity: z.number().positive(),
  // Optional pre-resolved seller hint — useful for marketplaces with split
  // sellers. The facilitator may use this to avoid an extra catalog lookup.
  seller_id: z.string().optional(),
});
export type LineItemCreateInput = z.infer<typeof LineItemCreateInput>;
