import { z } from "zod";
import { Currency, MeliItemId } from "./common";

// ---------------------------------------------------------------------------
// Order — `/orders/search` + `/orders/{id}`
// ---------------------------------------------------------------------------

export const OrderStatus = z.enum([
  "confirmed",
  "payment_required",
  "payment_in_process",
  "partially_paid",
  "paid",
  "cancelled",
  "invalid",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderItem = z.object({
  item: z.object({
    id: MeliItemId,
    title: z.string(),
    category_id: z.string().optional(),
    variation_id: z.union([z.string(), z.number()]).nullable().optional(),
    seller_custom_field: z.string().nullable().optional(),
    variation_attributes: z
      .array(z.object({ name: z.string(), id: z.string(), value_name: z.string().optional() }))
      .optional(),
    warranty: z.string().nullable().optional(),
    condition: z.enum(["new", "used", "not_specified"]).optional(),
  }),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  full_unit_price: z.number().nonnegative().optional(),
  currency_id: Currency,
  manufacturing_days: z.number().int().nullable().optional(),
  sale_fee: z.number().nullable().optional(),
  listing_type_id: z.string().optional(),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const OrderPayment = z.object({
  id: z.union([z.string(), z.number()]),
  status: z
    .enum([
      "pending",
      "approved",
      "authorized",
      "in_process",
      "in_mediation",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
    ])
    .optional(),
  status_detail: z.string().nullable().optional(),
  transaction_amount: z.number().optional(),
  total_paid_amount: z.number().optional(),
  currency_id: Currency.optional(),
  payer_id: z.number().int().optional(),
  installments: z.number().int().optional(),
  payment_method_id: z.string().optional(),
  payment_type: z.string().optional(),
  date_approved: z.string().nullable().optional(),
  date_created: z.string().optional(),
});
export type OrderPayment = z.infer<typeof OrderPayment>;

export const OrderBuyer = z.object({
  id: z.number().int(),
  nickname: z.string().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  billing_info: z
    .object({
      doc_type: z.string().nullable().optional(),
      doc_number: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type OrderBuyer = z.infer<typeof OrderBuyer>;

export const Order = z.object({
  id: z.number().int(),
  date_created: z.string(),
  date_closed: z.string().optional(),
  last_updated: z.string().optional(),
  expiration_date: z.string().nullable().optional(),
  status: OrderStatus,
  status_detail: z.unknown().nullable().optional(),
  total_amount: z.number().nonnegative(),
  paid_amount: z.number().nullable().optional(),
  currency_id: Currency,
  pack_id: z.number().int().nullable().optional(),
  pickup_id: z.number().int().nullable().optional(),
  fulfilled: z.boolean().optional(),
  shipping: z
    .object({
      id: z.number().int().nullable().optional(),
    })
    .optional(),
  order_items: z.array(OrderItem),
  payments: z.array(OrderPayment).optional(),
  buyer: OrderBuyer,
  seller: z
    .object({
      id: z.number().int(),
      nickname: z.string().optional(),
    })
    .optional(),
  feedback: z.unknown().nullable().optional(),
  tags: z.array(z.string()).optional(),
  manufacturing_ending_date: z.string().nullable().optional(),
  application_id: z.string().optional(),
  context: z
    .object({
      channel: z.string().optional(),
      site: z.string().optional(),
      flows: z.array(z.string()).optional(),
    })
    .optional(),
});
export type Order = z.infer<typeof Order>;

export const OrdersSearchResponse = z.object({
  results: z.array(Order),
  paging: z.object({
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  }),
});
export type OrdersSearchResponse = z.infer<typeof OrdersSearchResponse>;

// ---------------------------------------------------------------------------
// Pack — `/marketplace/orders/pack/{pack_id}`
// ---------------------------------------------------------------------------

export const Pack = z.object({
  id: z.number().int(),
  status: z.string(),
  /** Each entry corresponds to one Order id within the pack. */
  orders: z.array(
    z.object({
      id: z.number().int(),
      buyer: z.object({ id: z.number().int() }).optional(),
    }),
  ),
  shipment: z
    .object({
      id: z.number().int(),
    })
    .optional(),
});
export type Pack = z.infer<typeof Pack>;
