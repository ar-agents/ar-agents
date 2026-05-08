import { z } from "zod";

// ---------------------------------------------------------------------------
// MELI webhook envelope — `POST <your callback URL>`
// MELI POSTs `application/json` with this shape across all 20+ topics.
// ---------------------------------------------------------------------------

export const MeliWebhookTopic = z.enum([
  "orders_v2",
  "orders", // legacy
  "marketplace_orders", // CBT
  "items",
  "items_prices",
  "questions",
  "messages",
  "claims",
  "shipments",
  "payments",
  "fbm_stock_operations",
  "stock_locations",
  "public_offers",
  "public_candidates",
  "item_competition_status",
  "catalog_suggestions",
  "orders_feedback",
  "leads_credits",
  "vis_leads",
  "post_purchase",
  "marketplace_questions",
  "marketplace_messages",
  "marketplace_claims",
  "marketplace_items",
]);
export type MeliWebhookTopic = z.infer<typeof MeliWebhookTopic>;

export const MeliWebhookEvent = z.object({
  /** Notification id from MELI. */
  _id: z.string().optional(),
  /** Equivalent to `topic` for some legacy payloads. */
  resource: z.string(),
  user_id: z.number().int(),
  topic: z.union([MeliWebhookTopic, z.string()]),
  application_id: z.number().int().optional(),
  attempts: z.number().int().nonnegative().optional(),
  /** ISO 8601. */
  sent: z.string().optional(),
  received: z.string().optional(),
  /** Free-form additional fields some topics carry. */
  actions: z.array(z.string()).optional(),
});
export type MeliWebhookEvent = z.infer<typeof MeliWebhookEvent>;

// ---------------------------------------------------------------------------
// `/myfeeds?app_id=...&topic=...` — recover dropped events within MELI's
// 2-day retention window.
// ---------------------------------------------------------------------------

export const MissedFeed = z.object({
  /** Same shape as the original webhook envelope. */
  resource: z.string(),
  user_id: z.number().int(),
  topic: z.union([MeliWebhookTopic, z.string()]),
  application_id: z.number().int().optional(),
  sent: z.string().optional(),
  attempts: z.number().int().nonnegative().optional(),
});
export type MissedFeed = z.infer<typeof MissedFeed>;

export const MissedFeedsResponse = z.array(MissedFeed);
export type MissedFeedsResponse = z.infer<typeof MissedFeedsResponse>;
