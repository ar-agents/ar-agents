import { z } from "zod";
import { Currency, ISODateTime, Metadata } from "./common";
import { LineItem, LineItemCreateInput } from "./line-item";
import { Total } from "./totals";

// ACP `Cart` — the optional pre-checkout primitive (the "cart" surface,
// distinct from `CheckoutSession`). Carts have no payment, no buyer, no
// status lifecycle; they exist or 404. `PUT` does full replacement of
// `line_items`.
export const Cart = z.object({
  id: z.string().min(1),
  currency: Currency,
  line_items: z.array(LineItem),
  totals: z.array(Total),
  created_at: ISODateTime.optional(),
  updated_at: ISODateTime.optional(),
  metadata: Metadata.optional(),
});
export type Cart = z.infer<typeof Cart>;

// `POST /carts`
export const CartCreateRequest = z.object({
  currency: Currency,
  line_items: z.array(LineItemCreateInput).min(1),
  metadata: Metadata.optional(),
});
export type CartCreateRequest = z.infer<typeof CartCreateRequest>;

// `PUT /carts/{id}` — full replacement.
export const CartReplaceRequest = z.object({
  line_items: z.array(LineItemCreateInput).min(1),
  metadata: Metadata.optional(),
});
export type CartReplaceRequest = z.infer<typeof CartReplaceRequest>;
