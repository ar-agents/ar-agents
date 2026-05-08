import { z } from "zod";

// ---------------------------------------------------------------------------
// Shipment — `/shipments/{id}` + `/shipments/{id}/history`
// ---------------------------------------------------------------------------

export const ShipmentStatus = z.enum([
  "pending",
  "handling",
  "ready_to_ship",
  "shipped",
  "delivered",
  "not_delivered",
  "cancelled",
  "returned",
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatus>;

export const ShipmentMode = z.enum(["me1", "me2", "custom", "not_specified"]);
export type ShipmentMode = z.infer<typeof ShipmentMode>;

export const ShipmentLogisticType = z.enum([
  "self_service", // Flex
  "cross_docking", // Colecta
  "xd_drop_off", // Drop-off
  "fulfillment", // Full
  "drop_off",
  "default",
]);
export type ShipmentLogisticType = z.infer<typeof ShipmentLogisticType>;

export const ShipmentItem = z.object({
  id: z.string(),
  description: z.string().optional(),
  quantity: z.number().int().positive().optional(),
});
export type ShipmentItem = z.infer<typeof ShipmentItem>;

export const ShipmentReceiverAddress = z.object({
  id: z.number().int().optional(),
  address_line: z.string().optional(),
  street_name: z.string().optional(),
  street_number: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  zip_code: z.string().optional(),
  city: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  state: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  country: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  receiver_name: z.string().nullable().optional(),
  receiver_phone: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});
export type ShipmentReceiverAddress = z.infer<typeof ShipmentReceiverAddress>;

export const Shipment = z.object({
  id: z.number().int(),
  status: ShipmentStatus,
  substatus: z.string().nullable().optional(),
  mode: ShipmentMode.optional(),
  logistic_type: ShipmentLogisticType.optional(),
  date_created: z.string(),
  last_updated: z.string().optional(),
  tracking_number: z.string().nullable().optional(),
  tracking_method: z.string().nullable().optional(),
  service_id: z.number().int().nullable().optional(),
  base_cost: z.number().nullable().optional(),
  /** USD-denominated insurance value. */
  declared_value: z.number().nullable().optional(),
  origin: z
    .object({
      type: z.string().optional(),
      sender_id: z.number().int().optional(),
      shipping_address: ShipmentReceiverAddress.optional(),
    })
    .optional(),
  destination: z
    .object({
      receiver_address: ShipmentReceiverAddress.optional(),
      type: z.string().optional(),
      receiver_id: z.number().int().optional(),
    })
    .optional(),
  shipping_items: z.array(ShipmentItem).optional(),
  /** Free-shipping or paid? */
  cost: z.number().nullable().optional(),
  estimated_delivery_time: z
    .object({
      date: z.string().nullable().optional(),
      time_from: z.string().nullable().optional(),
      time_to: z.string().nullable().optional(),
    })
    .optional(),
  /** Window required to dispatch (Flex SLA). */
  estimated_handling_limit: z
    .object({
      date: z.string().nullable().optional(),
    })
    .optional(),
});
export type Shipment = z.infer<typeof Shipment>;

export const ShipmentHistoryEntry = z.object({
  status: ShipmentStatus.optional(),
  substatus: z.string().nullable().optional(),
  date: z.string(),
  comment: z.string().nullable().optional(),
});
export type ShipmentHistoryEntry = z.infer<typeof ShipmentHistoryEntry>;

// ---------------------------------------------------------------------------
// Labels — `/shipment_labels?shipment_ids=...&response_type=pdf|zpl`
// ---------------------------------------------------------------------------

export const LabelFormat = z.enum(["pdf", "zpl"]);
export type LabelFormat = z.infer<typeof LabelFormat>;

// ---------------------------------------------------------------------------
// Shipping options — `/items/{id}/shipping_options`
// ---------------------------------------------------------------------------

export const ShippingOption = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  cost: z.number(),
  currency_id: z.string(),
  estimated_delivery_time: z
    .object({
      date: z.string().nullable().optional(),
      handling_time: z
        .object({
          date: z.string().optional(),
          time_from: z.string().optional(),
          time_to: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  display: z.string().optional(),
});
export type ShippingOption = z.infer<typeof ShippingOption>;
