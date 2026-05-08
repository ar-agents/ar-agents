import { z } from "zod";

// ---------------------------------------------------------------------------
// Site IDs (MLA / MLB / MLM / MLC / MCO / MLU / MPE)
// ---------------------------------------------------------------------------

export const SiteId = z.enum([
  "MLA", // Argentina
  "MLB", // Brazil
  "MLM", // Mexico
  "MLC", // Chile
  "MCO", // Colombia
  "MLU", // Uruguay
  "MPE", // Peru
]);
export type SiteId = z.infer<typeof SiteId>;

// MELI uses ISO 4217 alpha-3 codes. We accept upper or lower; canonical
// serialization is upper.
export const Currency = z.enum([
  "ARS", // MLA
  "BRL", // MLB
  "MXN", // MLM
  "CLP", // MLC
  "COP", // MCO
  "UYU", // MLU
  "PEN", // MPE
  "USD",
]);
export type Currency = z.infer<typeof Currency>;

// ---------------------------------------------------------------------------
// MELI item id pattern (e.g. MLA123456789, MLB987654321)
// ---------------------------------------------------------------------------

export const MeliItemId = z
  .string()
  .regex(/^(MLA|MLB|MLM|MLC|MCO|MLU|MPE)\d+$/, "must be a MELI item id like 'MLA123456789'");
export type MeliItemId = z.infer<typeof MeliItemId>;

// ---------------------------------------------------------------------------
// Category id (e.g. MLA1055)
// ---------------------------------------------------------------------------

export const CategoryId = z
  .string()
  .regex(/^(MLA|MLB|MLM|MLC|MCO|MLU|MPE)\d+$/, "must be a MELI category id like 'MLA1055'");
export type CategoryId = z.infer<typeof CategoryId>;

// ---------------------------------------------------------------------------
// Listing types and item statuses
// ---------------------------------------------------------------------------

export const ListingType = z.enum([
  "free",
  "bronze",
  "silver",
  "gold",
  "gold_premium",
  "gold_special",
  "gold_pro",
]);
export type ListingType = z.infer<typeof ListingType>;

export const ItemStatus = z.enum([
  "active",
  "paused",
  "closed",
  "under_review",
  "inactive",
  "payment_required",
  "not_yet_active",
]);
export type ItemStatus = z.infer<typeof ItemStatus>;

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

export const PagingResponse = z.object({
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});
export type PagingResponse = z.infer<typeof PagingResponse>;

export const ScrollPagingResponse = z.object({
  total: z.number().int().nonnegative(),
  scroll_id: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
export type ScrollPagingResponse = z.infer<typeof ScrollPagingResponse>;

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

export const Picture = z.object({
  id: z.string().optional(),
  url: z.string().url().optional(),
  secure_url: z.string().url().optional(),
  size: z.string().optional(),
  max_size: z.string().optional(),
  quality: z.string().optional(),
});
export type Picture = z.infer<typeof Picture>;

// ---------------------------------------------------------------------------
// Common attribute (used in items + categories)
// ---------------------------------------------------------------------------

export const ItemAttribute = z.object({
  id: z.string(),
  name: z.string().optional(),
  value_id: z.string().nullable().optional(),
  value_name: z.string().nullable().optional(),
  value_struct: z
    .object({
      number: z.number().optional(),
      unit: z.string().optional(),
    })
    .nullable()
    .optional(),
  attribute_group_id: z.string().optional(),
  attribute_group_name: z.string().optional(),
});
export type ItemAttribute = z.infer<typeof ItemAttribute>;
