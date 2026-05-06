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

// v0.5 — OAuth Marketplace flow
export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  expirationTimeMs,
  isExpiringSoon,
} from "./oauth";

export {
  MercadoPagoError,
  MercadoPagoAuthError,
  MercadoPagoBackUrlInvalidError,
  MercadoPagoSelfPaymentError,
  MercadoPagoAccountTypeMismatchError,
  MercadoPagoPaymentRejectedError,
  MercadoPagoAuthorizeForbiddenError,
  MercadoPagoRateLimitError,
  MercadoPagoOverloadedError,
  MercadoPagoTimeoutError,
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
  // QR (v0.3)
  QrOrder,
  CreateQrPaymentParams,
  // Card tokens (v0.3)
  CardToken,
  CreateCardTokenParams,
  // Subscription Plans (v0.4)
  SubscriptionPlan,
  CreateSubscriptionPlanParams,
  SubscriptionPayment,
  // Stores + POS (v0.4)
  Store,
  CreateStoreParams,
  Pos,
  CreatePosParams,
  // Disputes (v0.4)
  Dispute,
  // Lookup (v0.4)
  IdentificationType,
  Issuer,
  // Webhooks management (v0.4)
  WebhookConfig,
  WebhookTopic,
  CreateWebhookParams,
  // OAuth Marketplace (v0.5)
  OAuthToken,
  // Order Management API (v0.5)
  Order,
  OrderItem,
  OrderStatus,
  CreateOrderParams,
  // Marketplace split params (v0.5)
  MarketplaceParams,
  // Common
  CurrencyId,
  FrequencyType,
  SiteId,
  WebhookBody,
  ParsedWebhookEvent,
} from "./types";
