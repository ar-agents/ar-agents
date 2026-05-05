import { z } from "zod";

/**
 * Site IDs supported by Mercado Pago. The lib targets MLA (Argentina) primarily;
 * other LATAM sites may work for the read paths but the full Subscriptions flow
 * is only verified against MLA.
 */
export const SiteIdSchema = z.enum(["MLA", "MLB", "MLM", "MCO", "MLC", "MLU"]);
export type SiteId = z.infer<typeof SiteIdSchema>;

/**
 * Currency identifiers MP exposes. ARS is the supported case for v0.1.
 */
export const CurrencyIdSchema = z.enum(["ARS", "USD", "BRL", "MXN"]);
export type CurrencyId = z.infer<typeof CurrencyIdSchema>;

/**
 * Recurrence frequency unit for a subscription's auto_recurring config.
 */
export const FrequencyTypeSchema = z.enum(["months", "days"]);
export type FrequencyType = z.infer<typeof FrequencyTypeSchema>;

/**
 * Lifecycle states a Mercado Pago preapproval can be in. The string is the
 * canonical MP value; we widen to `string` for forward compatibility because
 * MP has historically introduced new states without notice.
 */
export const PreapprovalStatusSchema = z.union([
  z.literal("pending"),
  z.literal("authorized"),
  z.literal("paused"),
  z.literal("cancelled"),
  z.string(),
]);
export type PreapprovalStatus = z.infer<typeof PreapprovalStatusSchema>;

export const AutoRecurringSchema = z.object({
  frequency: z.number().int().positive(),
  frequency_type: FrequencyTypeSchema,
  transaction_amount: z.number().positive(),
  currency_id: CurrencyIdSchema,
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
export type AutoRecurring = z.infer<typeof AutoRecurringSchema>;

export const PreapprovalSchema = z.object({
  id: z.string(),
  status: PreapprovalStatusSchema,
  payer_email: z.string(),
  init_point: z.string().url(),
  external_reference: z.string().optional(),
  date_created: z.string(),
  last_modified: z.string(),
  next_payment_date: z.string().optional(),
  payer_id: z.union([z.string(), z.number()]).optional(),
  auto_recurring: AutoRecurringSchema,
});
export type Preapproval = z.infer<typeof PreapprovalSchema>;

/**
 * Input for creating a preapproval (subscription). Internal field names match
 * MP API semantics; the public client method maps from camelCase Naza-friendly
 * params to the snake_case payload MP expects.
 */
export interface CreatePreapprovalParams {
  /** Short customer-facing description shown at checkout. */
  reason: string;
  /** Email of the buyer. Cannot equal the seller account's email (MP rejects). */
  payerEmail: string;
  /** Recurring amount per cycle. */
  amount: number;
  /** ARS for Argentina. Other currencies depend on the seller account's site. */
  currency: CurrencyId;
  /** Recurrence frequency (e.g., 1 + months = monthly). */
  frequency: number;
  frequencyType: FrequencyType;
  /** HTTPS URL where MP redirects the buyer after first payment. localhost rejected. */
  backUrl: string;
  /** Optional client-side identifier for the subscription. */
  externalReference?: string;
}

/**
 * The shape of an MP webhook notification body for `topic=preapproval`. MP's
 * webhook payload varies by event type; this is the union of fields seen in
 * production.
 */
export const WebhookBodySchema = z
  .object({
    type: z.string().optional(),
    topic: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
    resource: z.string().optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    api_version: z.string().optional(),
    date_created: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    live_mode: z.boolean().optional(),
  })
  .passthrough();
export type WebhookBody = z.infer<typeof WebhookBodySchema>;

/**
 * Normalized webhook event after parsing. The library extracts topic + dataId
 * from either query params or body, since MP sends them in either location
 * depending on integration version.
 */
export interface ParsedWebhookEvent {
  /** Topic of the event, e.g., "preapproval", "payment", "subscription_authorized_payment". */
  topic: string;
  /** ID of the affected resource. */
  dataId: string;
  /** Action descriptor when present (e.g., "updated", "created"). */
  action: string | null;
  /** Raw body MP sent, for caller inspection / debugging. */
  raw: WebhookBody;
}
