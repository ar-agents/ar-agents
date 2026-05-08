import { z } from "zod";
import {
  ApiVersion,
  Currency,
  ISODateTime,
  Locale,
  Metadata,
  Timezone,
} from "./common.js";
import { Buyer } from "./buyer.js";
import { LineItem, LineItemCreateInput } from "./line-item.js";
import {
  FulfillmentDetails,
  FulfillmentGroup,
  FulfillmentOption,
  SelectedFulfillmentOption,
} from "./fulfillment.js";
import { Total } from "./totals.js";
import { Message, Link } from "./messages.js";
import {
  CapabilitiesRequest,
  CapabilitiesResponse,
} from "./capabilities.js";
import { DiscountsRequest, DiscountsResponse } from "./discount.js";
import {
  AuthenticationResult,
  MarketingConsent,
  PaymentData,
} from "./payment.js";
import { Order } from "./order.js";

// ACP `CheckoutSession.status` — closed enum on the merchant-facilitator
// side, but extensions may add states; we permit unknowns.
export const CheckoutSessionStatus = z.enum([
  "incomplete",
  "not_ready_for_payment",
  "requires_escalation",
  "authentication_required",
  "ready_for_payment",
  "pending_approval",
  "complete_in_progress",
  "completed",
  "canceled",
  "in_progress",
  "expired",
]);
export type CheckoutSessionStatus = z.infer<typeof CheckoutSessionStatus>;

// AuthenticationMetadata — challenges + redirect targets for 3DS, OTP, etc.
export const AuthenticationMetadata = z.object({
  type: z.string(),
  url: z.string().url().optional(),
  expires_at: ISODateTime.optional(),
  metadata: Metadata.optional(),
});
export type AuthenticationMetadata = z.infer<typeof AuthenticationMetadata>;

export const MarketingConsentOption = z.object({
  channel: z.string(),
  default_opted_in: z.boolean().optional(),
  required: z.boolean().optional(),
  display_text: z.string().optional(),
});
export type MarketingConsentOption = z.infer<typeof MarketingConsentOption>;

// Full `CheckoutSession` shape — the response body of all five endpoints
// (modulo the `order` extension on `complete`).
export const CheckoutSession = z.object({
  id: z.string().min(1),
  protocol: z.object({ version: ApiVersion }).optional(),
  capabilities: CapabilitiesResponse.optional(),
  buyer: Buyer.optional(),
  status: z.union([CheckoutSessionStatus, z.string()]),
  currency: Currency,
  presentment_currency: Currency.optional(),
  exchange_rate: z.number().positive().optional(),
  exchange_rate_timestamp: ISODateTime.optional(),
  locale: Locale.optional(),
  timezone: Timezone.optional(),
  line_items: z.array(LineItem),
  fulfillment_details: FulfillmentDetails.optional(),
  fulfillment_options: z.array(FulfillmentOption),
  selected_fulfillment_options: z.array(SelectedFulfillmentOption).optional(),
  fulfillment_groups: z.array(FulfillmentGroup).optional(),
  totals: z.array(Total),
  messages: z.array(Message),
  links: z.array(Link),
  authentication_metadata: AuthenticationMetadata.optional(),
  created_at: ISODateTime.optional(),
  updated_at: ISODateTime.optional(),
  expires_at: ISODateTime.optional(),
  continue_url: z.string().url().optional(),
  metadata: Metadata.optional(),
  quote_id: z.string().optional(),
  quote_expires_at: ISODateTime.optional(),
  marketing_consent_options: z.array(MarketingConsentOption).optional(),
  discounts: DiscountsResponse.optional(),
});
export type CheckoutSession = z.infer<typeof CheckoutSession>;

// Returned by `complete` — CheckoutSession + the freshly-minted order.
export const CheckoutSessionWithOrder = CheckoutSession.extend({
  order: Order,
});
export type CheckoutSessionWithOrder = z.infer<typeof CheckoutSessionWithOrder>;

// ===========================================================================
// REQUEST SHAPES — what agents POST to us.
// ===========================================================================

// `POST /checkout_sessions` — create.
export const CheckoutSessionCreateRequest = z.object({
  currency: Currency,
  presentment_currency: Currency.optional(),
  line_items: z.array(LineItemCreateInput).min(1),
  buyer: Buyer.partial().optional(),
  capabilities: CapabilitiesRequest.optional(),
  fulfillment_details: FulfillmentDetails.optional(),
  selected_fulfillment_options: z.array(SelectedFulfillmentOption).optional(),
  discounts: DiscountsRequest.optional(),
  metadata: Metadata.optional(),
  client_reference_id: z.string().optional(),
  order_notes: z.string().optional(),
  expires_at: ISODateTime.optional(),
  locale: Locale.optional(),
  timezone: Timezone.optional(),
});
export type CheckoutSessionCreateRequest = z.infer<
  typeof CheckoutSessionCreateRequest
>;

// `POST /checkout_sessions/{id}` — update (all fields optional).
export const CheckoutSessionUpdateRequest = CheckoutSessionCreateRequest
  .partial()
  .extend({
    line_items: z.array(LineItemCreateInput).optional(),
  });
export type CheckoutSessionUpdateRequest = z.infer<
  typeof CheckoutSessionUpdateRequest
>;

// `POST /checkout_sessions/{id}/complete` — finalize with payment data.
export const CheckoutSessionCompleteRequest = z.object({
  buyer: Buyer.optional(),
  payment_data: PaymentData,
  marketing_consents: z.array(MarketingConsent).optional(),
  authentication_result: AuthenticationResult.optional(),
  client_reference_id: z.string().optional(),
});
export type CheckoutSessionCompleteRequest = z.infer<
  typeof CheckoutSessionCompleteRequest
>;

// `POST /checkout_sessions/{id}/cancel`
export const CheckoutSessionCancelRequest = z
  .object({
    reason: z.string().optional(),
  })
  .partial();
export type CheckoutSessionCancelRequest = z.infer<
  typeof CheckoutSessionCancelRequest
>;
