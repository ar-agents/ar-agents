import { z } from "zod";
import {
  CategoryId,
  Currency,
  ItemAttribute,
  ItemStatus,
  ListingType,
  MeliItemId,
  Picture,
  SiteId,
} from "./common";

// ---------------------------------------------------------------------------
// Variations
// ---------------------------------------------------------------------------

export const ItemVariation = z.object({
  id: z.union([z.string(), z.number()]),
  price: z.number().nonnegative().optional(),
  available_quantity: z.number().int().nonnegative().optional(),
  sold_quantity: z.number().int().nonnegative().optional(),
  attribute_combinations: z.array(ItemAttribute).optional(),
  picture_ids: z.array(z.string()).optional(),
  seller_custom_field: z.string().nullable().optional(),
});
export type ItemVariation = z.infer<typeof ItemVariation>;

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export const ItemShipping = z.object({
  mode: z
    .enum(["me1", "me2", "custom", "not_specified"])
    .optional(),
  free_shipping: z.boolean().optional(),
  logistic_type: z
    .enum([
      "default",
      "self_service",
      "cross_docking",
      "xd_drop_off",
      "fulfillment",
      "drop_off",
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  dimensions: z.string().nullable().optional(),
  local_pick_up: z.boolean().optional(),
  free_methods: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        rule: z
          .object({
            free_mode: z.string().optional(),
            value: z.number().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
export type ItemShipping = z.infer<typeof ItemShipping>;

// ---------------------------------------------------------------------------
// Item (full shape)
// ---------------------------------------------------------------------------

export const Item = z.object({
  id: MeliItemId,
  site_id: SiteId,
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  seller_id: z.number().int(),
  category_id: CategoryId,
  official_store_id: z.number().int().nullable().optional(),
  price: z.number().nonnegative(),
  base_price: z.number().nonnegative().optional(),
  original_price: z.number().nonnegative().nullable().optional(),
  currency_id: Currency,
  initial_quantity: z.number().int().nonnegative().optional(),
  available_quantity: z.number().int().nonnegative(),
  sold_quantity: z.number().int().nonnegative().optional(),
  buying_mode: z.enum(["buy_it_now", "auction", "classified"]).optional(),
  listing_type_id: ListingType,
  start_time: z.string().optional(),
  stop_time: z.string().optional(),
  end_time: z.string().optional(),
  expiration_time: z.string().optional(),
  condition: z.enum(["new", "used", "not_specified"]).optional(),
  permalink: z.string().url().optional(),
  thumbnail: z.string().url().optional(),
  secure_thumbnail: z.string().url().optional(),
  pictures: z.array(Picture).optional(),
  video_id: z.string().nullable().optional(),
  descriptions: z
    .array(z.object({ id: z.string() }))
    .optional(),
  accepts_mercadopago: z.boolean().optional(),
  shipping: ItemShipping.optional(),
  international_delivery_mode: z.string().optional(),
  seller_address: z
    .object({
      city: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
      state: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
      country: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
      zip_code: z.string().optional(),
    })
    .optional(),
  seller_contact: z.unknown().nullable().optional(),
  location: z.unknown().optional(),
  geolocation: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  coverage_areas: z.array(z.unknown()).optional(),
  attributes: z.array(ItemAttribute).optional(),
  warnings: z.array(z.unknown()).optional(),
  listing_source: z.string().optional(),
  variations: z.array(ItemVariation).optional(),
  status: ItemStatus,
  sub_status: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  warranty: z.string().nullable().optional(),
  catalog_product_id: z.string().nullable().optional(),
  domain_id: z.string().nullable().optional(),
  parent_item_id: MeliItemId.nullable().optional(),
  differential_pricing: z.unknown().nullable().optional(),
  deal_ids: z.array(z.string()).optional(),
  automatic_relist: z.boolean().optional(),
  date_created: z.string().optional(),
  last_updated: z.string().optional(),
  health: z.number().nullable().optional(),
  catalog_listing: z.boolean().optional(),
  channels: z.array(z.string()).optional(),
});
export type Item = z.infer<typeof Item>;

// ---------------------------------------------------------------------------
// Create/update payloads
// ---------------------------------------------------------------------------

export const ItemCreateRequest = z.object({
  title: z.string().min(1),
  category_id: CategoryId,
  price: z.number().nonnegative(),
  currency_id: Currency,
  available_quantity: z.number().int().nonnegative(),
  buying_mode: z.enum(["buy_it_now", "classified"]).default("buy_it_now"),
  listing_type_id: ListingType.default("gold_special"),
  condition: z.enum(["new", "used", "not_specified"]).default("new"),
  description: z
    .object({ plain_text: z.string() })
    .or(z.string())
    .optional(),
  pictures: z
    .array(z.object({ source: z.string().url() }))
    .min(1)
    .optional(),
  attributes: z.array(ItemAttribute).optional(),
  variations: z.array(ItemVariation).optional(),
  warranty: z.string().optional(),
  shipping: ItemShipping.optional(),
  catalog_listing: z.boolean().optional(),
  catalog_product_id: z.string().optional(),
});
export type ItemCreateRequest = z.infer<typeof ItemCreateRequest>;

export const ItemUpdateRequest = z
  .object({
    title: z.string().optional(),
    price: z.number().nonnegative().optional(),
    available_quantity: z.number().int().nonnegative().optional(),
    status: z.enum(["active", "paused", "closed"]).optional(),
    pictures: z.array(z.object({ source: z.string().url() })).optional(),
    attributes: z.array(ItemAttribute).optional(),
    variations: z.array(ItemVariation).optional(),
  })
  .partial();
export type ItemUpdateRequest = z.infer<typeof ItemUpdateRequest>;
