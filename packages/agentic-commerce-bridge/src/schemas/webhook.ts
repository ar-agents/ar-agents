import { z } from "zod";
import { ISODateTime } from "./common";
import { Order } from "./order";

// ACP webhook events — merchant emits these to the agent's subscribed URL.
// `type` is currently `order_create` | `order_update`; the spec hints more
// types are coming (e.g. `order_refunded`, `dispute_opened`). We accept
// unknown types via passthrough.
export const WebhookEventType = z.enum([
  "order_create",
  "order_update",
  // Forward-looking; not all facilitators will emit these in 2026:
  "order_canceled",
  "order_refunded",
  "order_disputed",
  "fulfillment_updated",
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

// Discriminated by `type`. `data.type` MUST equal "order" for order_*
// events.
export const WebhookEvent = z.object({
  type: z.union([WebhookEventType, z.string()]),
  data: Order,
  // Optional event id for idempotent receipt by the agent.
  id: z.string().optional(),
  // Wall-clock at which the merchant emitted this event.
  occurred_at: ISODateTime.optional(),
});
export type WebhookEvent = z.infer<typeof WebhookEvent>;
