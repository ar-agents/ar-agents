// Public API surface for @ar-agents/mercadopago
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool collection.
// Pair with `Experimental_Agent` (or any caller of `tool()`) and a state
// adapter of your choice.

export {
  MercadoPagoClient,
  type MercadoPagoClientOptions,
} from "./client";

export {
  mercadoPagoTools,
  type MercadoPagoToolsOptions,
} from "./tools";

export {
  type SubscriptionStateAdapter,
  type SubscriptionStateRecord,
  InMemoryStateAdapter,
} from "./state";

export {
  parseWebhookEvent,
  verifyWebhookSignature,
} from "./webhook";

export {
  MercadoPagoError,
  MercadoPagoAuthError,
  MercadoPagoBackUrlInvalidError,
  MercadoPagoSelfPaymentError,
  MercadoPagoAccountTypeMismatchError,
  MercadoPagoPaymentRejectedError,
  MercadoPagoAuthorizeForbiddenError,
  MercadoPagoRateLimitError,
  classifyError,
} from "./errors";

export type {
  // Subscriptions
  Preapproval,
  PreapprovalStatus,
  CreatePreapprovalParams,
  AutoRecurring,
  // Payments
  Payment,
  PaymentStatus,
  CreatePaymentParams,
  SearchPaymentsParams,
  PaymentsSearchResult,
  // Refunds
  Refund,
  CreateRefundParams,
  // Checkout Pro
  Preference,
  PreferenceItem,
  CreatePreferenceParams,
  // Customers + Cards
  Customer,
  CustomerCard,
  CreateCustomerParams,
  // Payment Methods + Installments
  PaymentMethod,
  InstallmentOffer,
  // Account
  AccountInfo,
  // Common
  CurrencyId,
  FrequencyType,
  SiteId,
  WebhookBody,
  ParsedWebhookEvent,
} from "./types";
