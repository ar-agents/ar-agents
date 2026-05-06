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

// ─────────────────────────────────────────────────────────────────────────────
// Payments (v0.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level lifecycle status of a payment. MP-canonical values; widened to
 * string for forward compatibility.
 */
export const PaymentStatusSchema = z.union([
  z.literal("pending"),
  z.literal("approved"),
  z.literal("authorized"),
  z.literal("in_process"),
  z.literal("in_mediation"),
  z.literal("rejected"),
  z.literal("cancelled"),
  z.literal("refunded"),
  z.literal("charged_back"),
  z.string(),
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** Status detail — finer granularity inside a status (e.g., why rejected). */
export type PaymentStatusDetail = string;

/**
 * The full Payment object MP returns. Many fields are optional because they
 * vary by payment method, status, and integration mode (Checkout Pro vs API).
 */
export const PaymentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: PaymentStatusSchema,
  status_detail: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
  date_approved: z.string().nullable().optional(),
  date_last_updated: z.string().nullable().optional(),
  transaction_amount: z.number(),
  currency_id: z.string(),
  installments: z.number().int().nullable().optional(),
  payment_method_id: z.string().nullable().optional(),
  payment_type_id: z.string().nullable().optional(),
  external_reference: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  payer: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      email: z.string().nullable().optional(),
      identification: z
        .object({
          type: z.string().nullable().optional(),
          number: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .passthrough()
    .optional(),
  transaction_details: z
    .object({
      net_received_amount: z.number().nullable().optional(),
      total_paid_amount: z.number().nullable().optional(),
      installment_amount: z.number().nullable().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();
export type Payment = z.infer<typeof PaymentSchema>;

/** Params for creating a payment (Checkout API / transparent flow). */
export interface CreatePaymentParams {
  /** Amount in account currency. ARS for Argentina. */
  transactionAmount: number;
  /** Number of installments. Use 1 for no cuotas; AR cards typically allow up to 12. */
  installments?: number;
  /** MP payment_method_id — `visa`, `master`, `naranja`, `account_money`, etc. */
  paymentMethodId: string;
  /** Payer email — REQUIRED. Cannot equal seller email. */
  payerEmail: string;
  /** Card token from MP frontend SDK (Cardform). Required for credit/debit; omit for `account_money` etc. */
  token?: string;
  /** Description shown in payer's MP statement. */
  description?: string;
  /** Your-system identifier for correlation. */
  externalReference?: string;
  /** Optional payer identification (DNI/CUIT) — required for some payment types. */
  identification?: { type: "DNI" | "CUIT" | "CUIL"; number: string };
  /** Webhook override URL. Falls back to dashboard config if omitted. */
  notificationUrl?: string;
  /** AFIP/ARCA discount/fee/tax additions. Used to discriminate IVA, marketplace fees, etc. */
  additionalInfo?: {
    items?: Array<{
      id?: string;
      title: string;
      quantity: number;
      unit_price: number;
      description?: string;
    }>;
  };
  /** Statement descriptor — what shows on the buyer's card statement. Max 13 chars. */
  statementDescriptor?: string;
  /** When true, capture is deferred (only for credit cards) — useful for hold flows. */
  capture?: boolean;
  /** Idempotency key — pass the same value on retries to dedupe. Required for non-GET. */
  idempotencyKey?: string;
}

export interface SearchPaymentsParams {
  /** Filter by external_reference (your-system id). */
  externalReference?: string;
  /** Filter by payment status. */
  status?: PaymentStatus;
  /** Filter by payer email. */
  payerEmail?: string;
  /** Date range for date_created (ISO 8601). */
  beginDate?: string;
  endDate?: string;
  /** Result page (default 0). */
  offset?: number;
  /** Page size (default 30, max 100). */
  limit?: number;
  /** Sort: e.g. "date_created" desc. */
  sort?: string;
  criteria?: "asc" | "desc";
}

export const PaymentsSearchResultSchema = z.object({
  paging: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
  results: z.array(PaymentSchema),
});
export type PaymentsSearchResult = z.infer<typeof PaymentsSearchResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Refunds
// ─────────────────────────────────────────────────────────────────────────────

export const RefundSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  payment_id: z.union([z.string(), z.number()]).transform(String),
  amount: z.number(),
  source: z
    .object({
      id: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  date_created: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
}).passthrough();
export type Refund = z.infer<typeof RefundSchema>;

export interface CreateRefundParams {
  paymentId: string;
  /** Partial refund amount. Omit for full refund. */
  amount?: number;
  /** Idempotency key — required for retry-safety. */
  idempotencyKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Pro (Preferences)
// ─────────────────────────────────────────────────────────────────────────────

export const PreferenceItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  picture_url: z.string().url().optional(),
  category_id: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  currency_id: CurrencyIdSchema.optional(),
});
export type PreferenceItem = z.infer<typeof PreferenceItemSchema>;

export const PreferenceSchema = z.object({
  id: z.string(),
  init_point: z.string().url().optional(),
  sandbox_init_point: z.string().url().optional(),
  client_id: z.union([z.string(), z.number()]).optional(),
  collector_id: z.union([z.string(), z.number()]).optional(),
  items: z.array(PreferenceItemSchema).optional(),
  external_reference: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
  expires: z.boolean().optional(),
  expiration_date_from: z.string().nullable().optional(),
  expiration_date_to: z.string().nullable().optional(),
}).passthrough();
export type Preference = z.infer<typeof PreferenceSchema>;

export interface CreatePreferenceParams {
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    currency_id?: CurrencyId;
    description?: string;
    picture_url?: string;
  }>;
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: { area_code?: string; number?: string };
    identification?: { type: string; number: string };
    address?: { street_name?: string; street_number?: number; zip_code?: string };
  };
  /** Where to send the buyer after success/failure/pending. */
  backUrls?: { success?: string; failure?: string; pending?: string };
  /** "approved" → auto-redirect on success; "all" → always; "" → never. */
  autoReturn?: "approved" | "all";
  /** Webhook URL. */
  notificationUrl?: string;
  /** Your-system id for correlation. */
  externalReference?: string;
  /** Max installments offered. Defaults to MP account config. */
  paymentMethods?: {
    excluded_payment_types?: Array<{ id: string }>;
    excluded_payment_methods?: Array<{ id: string }>;
    installments?: number;
    default_installments?: number;
  };
  /** Statement descriptor — shows on buyer's card statement. */
  statementDescriptor?: string;
  /** Expiration window for the link itself. */
  expires?: boolean;
  expirationDateFrom?: string;
  expirationDateTo?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers + Saved Cards
// ─────────────────────────────────────────────────────────────────────────────

export const CustomerSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z
    .object({ area_code: z.string().nullable().optional(), number: z.string().nullable().optional() })
    .nullable()
    .optional(),
  identification: z
    .object({ type: z.string().nullable().optional(), number: z.string().nullable().optional() })
    .nullable()
    .optional(),
  date_created: z.string().nullable().optional(),
  date_last_updated: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).passthrough();
export type Customer = z.infer<typeof CustomerSchema>;

export const CustomerCardSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  expiration_month: z.number().int().nullable().optional(),
  expiration_year: z.number().int().nullable().optional(),
  first_six_digits: z.string().nullable().optional(),
  last_four_digits: z.string().nullable().optional(),
  payment_method: z
    .object({
      id: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      payment_type_id: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  date_created: z.string().nullable().optional(),
}).passthrough();
export type CustomerCard = z.infer<typeof CustomerCardSchema>;

export interface CreateCustomerParams {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: { areaCode?: string; number?: string };
  identification?: { type: "DNI" | "CUIT" | "CUIL"; number: string };
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Methods + Installments
// ─────────────────────────────────────────────────────────────────────────────

export const PaymentMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  payment_type_id: z.string(),
  status: z.string(),
  thumbnail: z.string().nullable().optional(),
  secure_thumbnail: z.string().nullable().optional(),
  min_allowed_amount: z.number().nullable().optional(),
  max_allowed_amount: z.number().nullable().optional(),
}).passthrough();
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const InstallmentOfferSchema = z.object({
  payment_method_id: z.string(),
  payment_type_id: z.string(),
  issuer: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  payer_costs: z.array(
    z.object({
      installments: z.number().int(),
      installment_rate: z.number(),
      discount_rate: z.number().nullable().optional(),
      installment_amount: z.number(),
      total_amount: z.number(),
      recommended_message: z.string().nullable().optional(),
    }).passthrough(),
  ),
}).passthrough();
export type InstallmentOffer = z.infer<typeof InstallmentOfferSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Account
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// QR (in-store dynamic)
// ─────────────────────────────────────────────────────────────────────────────

export const QrOrderSchema = z.object({
  in_store_order_id: z.string(),
  qr_data: z.string(),
}).passthrough();
export type QrOrder = z.infer<typeof QrOrderSchema>;

export interface CreateQrPaymentParams {
  /** Pre-configured POS external_id from MP dashboard. Required. */
  externalPosId: string;
  /** Total amount in ARS. */
  totalAmount: number;
  /** Display title shown to the buyer when scanning. */
  title: string;
  description?: string;
  /** Webhook URL — MP fires `point_integration_wh` then `payment` topic. */
  notificationUrl?: string;
  /** Your-system identifier for correlation. */
  externalReference?: string;
  /** ISO 8601 expiration (default 10 min from now). */
  expirationDate?: string;
  /** Itemized line items (optional but improves analytics). */
  items?: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    unit_measure?: string;
    total_amount?: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card tokens (for charge_saved_card)
// ─────────────────────────────────────────────────────────────────────────────

export const CardTokenSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  date_due: z.string().optional(),
  card_id: z.string().optional(),
  cardholder: z.unknown().optional(),
}).passthrough();
export type CardToken = z.infer<typeof CardTokenSchema>;

export interface CreateCardTokenParams {
  /** Saved card id (from list_customer_cards). */
  cardId: string;
  /** Customer that owns the card. */
  customerId: string;
  /** CVV — required for AR; MP doesn't store CVV. */
  securityCode: string;
}

export const AccountInfoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  email: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  country_id: z.string().nullable().optional(),
  site_id: z.string().nullable().optional(),
  user_type: z.string().nullable().optional(),
  status: z
    .object({ user_type: z.string().nullable().optional() })
    .passthrough()
    .nullable()
    .optional(),
}).passthrough();
export type AccountInfo = z.infer<typeof AccountInfoSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans (preapproval_plan — reusable plan definitions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reusable subscription plan. Different from a per-customer subscription:
 * a plan defines the price + frequency once, then customers subscribe to it
 * via `subscribe_to_plan` (which creates a preapproval pointing at the plan).
 *
 * Use plans for SaaS-style billing where you have a fixed set of tiers
 * (Básico/Pro/Enterprise) instead of negotiating amounts per customer.
 */
export const SubscriptionPlanSchema = z.object({
  id: z.string(),
  status: z.string(),
  reason: z.string(),
  back_url: z.string().url().optional(),
  external_reference: z.string().nullable().optional(),
  date_created: z.string(),
  last_modified: z.string(),
  auto_recurring: AutoRecurringSchema,
}).passthrough();
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export interface CreateSubscriptionPlanParams {
  /** Customer-facing plan name shown at checkout. */
  reason: string;
  /** Where MP redirects buyer after first payment. HTTPS only. */
  backUrl: string;
  /** Recurrence (e.g., 1 + months = monthly). */
  frequency: number;
  frequencyType: FrequencyType;
  /** Amount per cycle. */
  amount: number;
  /** ARS for AR. */
  currency: CurrencyId;
  /** Optional plan-level identifier from your system. */
  externalReference?: string;
  /** Free trial days before first charge. */
  freeTrialFrequency?: number;
  freeTrialFrequencyType?: FrequencyType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stores + POS (for QR payments setup)
// ─────────────────────────────────────────────────────────────────────────────

export const StoreSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  external_id: z.string().optional(),
  date_creation: z.string().optional(),
  location: z
    .object({
      address_line: z.string().optional(),
      city_name: z.string().optional(),
      state_name: z.string().optional(),
      country_id: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();
export type Store = z.infer<typeof StoreSchema>;

export interface CreateStoreParams {
  /** Display name for the store. */
  name: string;
  /** Caller-defined identifier (must be unique within the seller's stores). */
  externalId: string;
  /** Optional physical location. */
  location?: {
    addressLine?: string;
    cityName?: string;
    stateName?: string;
    countryId?: string;
    latitude?: number;
    longitude?: number;
  };
}

export const PosSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  external_id: z.string().optional(),
  store_id: z.union([z.string(), z.number()]).optional(),
  category: z.number().int().optional(),
  fixed_amount: z.boolean().optional(),
  qr: z
    .object({
      template_image: z.string().optional(),
      image: z.string().optional(),
    })
    .passthrough()
    .optional(),
  date_creation: z.string().optional(),
}).passthrough();
export type Pos = z.infer<typeof PosSchema>;

export interface CreatePosParams {
  /** Display name. */
  name: string;
  /** Caller-defined POS id (used in QR endpoints; unique within store). */
  externalId: string;
  /** Parent store id (number from createStore). */
  storeId: string | number;
  /** MP category code (default 621102 = Other Food and Beverage Services). */
  category?: number;
  /** If true, the QR has a fixed amount; if false, dynamic per-order. */
  fixedAmount?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Disputes / Chargebacks (read-only)
// ─────────────────────────────────────────────────────────────────────────────

export const DisputeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.string(),
  resource: z.string().optional(),
  resource_id: z.union([z.string(), z.number()]).optional(),
  amount: z.number().optional(),
  date_created: z.string().optional(),
  reason: z.string().optional(),
  resolution: z
    .object({
      reason: z.string().optional(),
      result: z.string().optional(),
      date: z.string().optional(),
    })
    .passthrough()
    .optional(),
  /** Documents the buyer / seller submitted as evidence. */
  documents: z.array(z.unknown()).optional(),
  /** Buyer's stated complaint. */
  reason_description: z.string().optional(),
}).passthrough();
export type Dispute = z.infer<typeof DisputeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Payment History (authorized_payments under a preapproval)
// ─────────────────────────────────────────────────────────────────────────────

export const SubscriptionPaymentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  preapproval_id: z.string().optional(),
  status: z.string(),
  payment_id: z.union([z.string(), z.number()]).nullable().optional(),
  transaction_amount: z.number().optional(),
  currency_id: z.string().optional(),
  date_created: z.string().optional(),
  debit_date: z.string().optional(),
  next_retry_date: z.string().nullable().optional(),
  retry_attempt: z.number().optional(),
  reason: z.string().optional(),
}).passthrough();
export type SubscriptionPayment = z.infer<typeof SubscriptionPaymentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Identification Types + Issuers (lookup helpers)
// ─────────────────────────────────────────────────────────────────────────────

export const IdentificationTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  min_length: z.number().optional(),
  max_length: z.number().optional(),
}).passthrough();
export type IdentificationType = z.infer<typeof IdentificationTypeSchema>;

export const IssuerSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  secure_thumbnail: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  processing_mode: z.string().optional(),
  status: z.string().optional(),
}).passthrough();
export type Issuer = z.infer<typeof IssuerSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks (configure subscriptions to topics)
// ─────────────────────────────────────────────────────────────────────────────

/** Topics MP can fire webhooks for. Add more as MP exposes them. */
export const WebhookTopicSchema = z.enum([
  "payment",
  "subscription_authorized_payment",
  "subscription_preapproval",
  "merchant_order",
  "point_integration_wh",
  "stop_delivery_op_wh",
]);
export type WebhookTopic = z.infer<typeof WebhookTopicSchema>;

export const WebhookConfigSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  url: z.string().url().optional(),
  status: z.string().optional(),
  topic: z.string().optional(),
  date_created: z.string().optional(),
  date_modified: z.string().optional(),
}).passthrough();
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export interface CreateWebhookParams {
  url: string;
  /** Topic to subscribe to. */
  topic: WebhookTopic | string;
}
