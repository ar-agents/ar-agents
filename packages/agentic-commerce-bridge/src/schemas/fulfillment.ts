import { z } from "zod";
import { ISODateTime } from "./common.js";
import { Address } from "./address.js";
import { Total } from "./totals.js";

// ACP `FulfillmentDetails` — buyer-side delivery / contact. Used to compute
// fulfillment options. Note `address` is optional because digital goods don't
// need one.
export const FulfillmentDetails = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone_number: z.string().optional(),
  address: Address.optional(),
  notes: z.string().optional(),
});
export type FulfillmentDetails = z.infer<typeof FulfillmentDetails>;

// 4 fulfillment-option variants, type-discriminated per ACP §B.5.
const fulfillmentOptionBase = {
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  totals: z.array(Total),
};

export const FulfillmentOptionShipping = z.object({
  type: z.literal("shipping"),
  ...fulfillmentOptionBase,
  carrier: z.string().optional(),
  service_level: z.string().optional(),
  earliest_delivery_time: ISODateTime.optional(),
  latest_delivery_time: ISODateTime.optional(),
  tracking_supported: z.boolean().optional(),
});
export type FulfillmentOptionShipping = z.infer<typeof FulfillmentOptionShipping>;

export const FulfillmentOptionDigital = z.object({
  type: z.literal("digital"),
  ...fulfillmentOptionBase,
  delivery_method: z
    .enum(["email", "instant_download", "license_key", "api_provisioned"])
    .optional(),
});
export type FulfillmentOptionDigital = z.infer<typeof FulfillmentOptionDigital>;

export const FulfillmentOptionPickup = z.object({
  type: z.literal("pickup"),
  ...fulfillmentOptionBase,
  location: z.object({
    name: z.string(),
    address: Address,
    phone: z.string().optional(),
    instructions: z.string().optional(),
  }),
  pickup_type: z.enum(["in_store", "curbside", "locker"]).optional(),
  ready_by: ISODateTime.optional(),
  pickup_by: ISODateTime.optional(),
});
export type FulfillmentOptionPickup = z.infer<typeof FulfillmentOptionPickup>;

export const FulfillmentOptionLocalDelivery = z.object({
  type: z.literal("local_delivery"),
  ...fulfillmentOptionBase,
  delivery_window: z
    .object({
      start: ISODateTime,
      end: ISODateTime,
    })
    .optional(),
});
export type FulfillmentOptionLocalDelivery = z.infer<
  typeof FulfillmentOptionLocalDelivery
>;

export const FulfillmentOption = z.discriminatedUnion("type", [
  FulfillmentOptionShipping,
  FulfillmentOptionDigital,
  FulfillmentOptionPickup,
  FulfillmentOptionLocalDelivery,
]);
export type FulfillmentOption = z.infer<typeof FulfillmentOption>;

// Selected option scoped to a subset of line items.
export const SelectedFulfillmentOption = z.object({
  type: z.enum(["shipping", "digital", "pickup", "local_delivery"]),
  option_id: z.string().min(1),
  item_ids: z.array(z.string().min(1)),
});
export type SelectedFulfillmentOption = z.infer<typeof SelectedFulfillmentOption>;

// FulfillmentGroup — for orders split across senders/origins.
export const FulfillmentGroup = z.object({
  id: z.string().min(1),
  item_ids: z.array(z.string().min(1)),
  origin: z
    .object({
      name: z.string().optional(),
      address: Address.optional(),
    })
    .optional(),
  selected_option_id: z.string().optional(),
});
export type FulfillmentGroup = z.infer<typeof FulfillmentGroup>;
