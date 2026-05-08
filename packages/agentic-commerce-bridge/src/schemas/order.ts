import { z } from "zod";
import { Amount, Currency, ISODateTime, Metadata } from "./common";
import { Address } from "./address";
import { Total } from "./totals";

// ACP `Order` — returned on `complete`, also wire format for the
// order-events webhook. The `status` enum is OPEN — implementations MUST
// accept unknown values. We model the well-known set as a literal union.
export const OrderStatus = z.enum([
  "created",
  "confirmed",
  "manual_review",
  "processing",
  "shipped",
  "completed",
  "canceled",
  "refunded",
  "partially_refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderLineItem = z.object({
  id: z.string().min(1),
  title: z.string(),
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.object({
    ordered: z.number().nonnegative(),
    current: z.number().nonnegative(),
    fulfilled: z.number().nonnegative(),
  }),
  unit_price: Amount,
  subtotal: Amount,
  status: z.enum(["ordered", "processing", "fulfilled", "canceled", "returned"])
    .optional(),
  metadata: Metadata.optional(),
});
export type OrderLineItem = z.infer<typeof OrderLineItem>;

export const FulfillmentEvent = z.object({
  id: z.string().min(1),
  type: z.enum([
    "created",
    "confirmed",
    "picked",
    "packed",
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "exception",
    "returned",
    "canceled",
  ]),
  occurred_at: ISODateTime,
  description: z.string().optional(),
  location: z.string().optional(),
});
export type FulfillmentEvent = z.infer<typeof FulfillmentEvent>;

const orderFulfillmentBase = {
  id: z.string().min(1),
  status: z.enum([
    "pending",
    "confirmed",
    "shipped",
    "in_transit",
    "delivered",
    "canceled",
    "returned",
  ]),
  line_items: z.array(
    z.object({
      id: z.string(),
      quantity: z.number().nonnegative(),
    }),
  ),
  events: z.array(FulfillmentEvent).optional(),
};

export const OrderFulfillmentShipping = z.object({
  type: z.literal("shipping"),
  ...orderFulfillmentBase,
  carrier: z.string().optional(),
  tracking_number: z.string().optional(),
  tracking_url: z.string().url().optional(),
  shipped_at: ISODateTime.optional(),
  delivered_at: ISODateTime.optional(),
  shipping_address: Address.optional(),
});
export type OrderFulfillmentShipping = z.infer<typeof OrderFulfillmentShipping>;

export const OrderFulfillmentDigital = z.object({
  type: z.literal("digital"),
  ...orderFulfillmentBase,
  delivered_at: ISODateTime.optional(),
  delivery_method: z
    .enum(["email", "instant_download", "license_key", "api_provisioned"])
    .optional(),
});
export type OrderFulfillmentDigital = z.infer<typeof OrderFulfillmentDigital>;

export const OrderFulfillmentPickup = z.object({
  type: z.literal("pickup"),
  ...orderFulfillmentBase,
  ready_at: ISODateTime.optional(),
  picked_up_at: ISODateTime.optional(),
});
export type OrderFulfillmentPickup = z.infer<typeof OrderFulfillmentPickup>;

export const OrderFulfillment = z.discriminatedUnion("type", [
  OrderFulfillmentShipping,
  OrderFulfillmentDigital,
  OrderFulfillmentPickup,
]);
export type OrderFulfillment = z.infer<typeof OrderFulfillment>;

// `adjustments[]` REPLACES the legacy `refunds[]` field as of 2026-04-17.
export const Adjustment = z.object({
  id: z.string().min(1),
  type: z.enum([
    "refund",
    "credit",
    "return",
    "exchange",
    "price_adjustment",
    "cancellation",
    "dispute",
  ]),
  amount: Amount.optional(),
  currency: Currency.optional(),
  reason: z.string().optional(),
  description: z.string().optional(),
  created_at: ISODateTime,
  line_item_ids: z.array(z.string()).optional(),
  metadata: Metadata.optional(),
});
export type Adjustment = z.infer<typeof Adjustment>;

export const OrderConfirmation = z.object({
  confirmation_number: z.string(),
  confirmation_email_sent: z.boolean().optional(),
  order_notes: z.string().optional(),
});
export type OrderConfirmation = z.infer<typeof OrderConfirmation>;

export const SupportInfo = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  help_center_url: z.string().url().optional(),
});
export type SupportInfo = z.infer<typeof SupportInfo>;

export const Order = z.object({
  type: z.literal("order").default("order"),
  id: z.string().min(1),
  checkout_session_id: z.string().min(1),
  order_number: z.string().optional(),
  client_reference_id: z.string().optional(),
  permalink_url: z.string().url(),
  status: z.union([OrderStatus, z.string()]).optional(),
  estimated_delivery: z
    .object({
      earliest: ISODateTime,
      latest: ISODateTime,
    })
    .optional(),
  confirmation: OrderConfirmation.optional(),
  support: SupportInfo.optional(),
  line_items: z.array(OrderLineItem).optional(),
  fulfillments: z.array(OrderFulfillment).optional(),
  adjustments: z.array(Adjustment).optional(),
  totals: z.array(Total).optional(),
  metadata: Metadata.optional(),
});
export type Order = z.infer<typeof Order>;
