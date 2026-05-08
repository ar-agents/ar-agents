/**
 * `@ar-agents/agentic-commerce-bridge` — open-source merchant facilitator for the
 * Agentic Commerce Protocol (ACP). Bridges agentic-commerce clients (ChatGPT,
 * Claude, Gemini, etc.) to MercadoLibre and MercadoPago.
 *
 * Phase 1 (this release): ACP `2026-04-17` schemas, webhook signing,
 * idempotency primitives, in-memory state adapter, API version negotiation.
 *
 * Phase 2 (planned): framework-agnostic HTTP handlers, MELI feed generator,
 * MP preference + webhook bridge, AR-fiscal Factura A/B/C auto-emission,
 * AP2 mandate verifier/signer.
 *
 * See README.md for setup and AGENTS.md for tool selection guidance.
 */

// All Zod schemas + inferred types.
export * from "./schemas";

// Webhook signing/verification (HMAC-SHA256, Merchant-Signature header).
export {
  SIGNATURE_HEADER,
  signWebhook,
  verifyWebhook,
  verifyAndParseWebhook,
  WebhookVerificationError,
  type SignWebhookOptions,
  type SignedWebhook,
  type VerifyWebhookOptions,
  type WebhookVerifyError,
} from "./webhook";

// Idempotency primitives.
export {
  IDEMPOTENCY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  RETRY_AFTER_HEADER,
  DEFAULT_IDEMPOTENCY_TTL_SECONDS,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  validateIdempotencyKey,
  hashBody,
  canonicalize,
  type IdempotencyOutcome,
  type IdempotencyRecord,
  type IdempotencyStore,
  type ValidatedIdempotencyKey,
} from "./idempotency";

// State adapter (interface + in-memory implementation).
export { InMemoryStateAdapter, type StateAdapter } from "./state";

// API version negotiation.
export {
  negotiateVersion,
  type VersionConfig,
  type VersionNegotiation,
} from "./version";

// ID generators (sessions, orders, carts).
export {
  generateSessionId,
  generateOrderId,
  generateCartId,
  isCheckoutSessionId,
  isOrderId,
  isCartId,
} from "./ids";

// Totals computation utilities.
export {
  buildLineItemTotals,
  buildOrderTotals,
  sumLineItemSubtotals,
  sumFulfillmentCost,
} from "./totals";

// Framework-agnostic handlers + dispatcher + types.
export type {
  AcpRequest,
  AcpResponse,
  CatalogProvider,
  ResolvedItem,
  PaymentProvider,
  PaymentResult,
  AuthenticationAction,
  FacilitatorHooks,
  FacilitatorOptions,
  Prereqs,
  DispatcherConfig,
} from "./handlers";
export {
  OutOfStockError,
  header,
  handleCreateSession,
  handleUpdateSession,
  handleGetSession,
  handleCompleteSession,
  handleCancelSession,
  handleDiscovery,
  buildDefaultDiscovery,
  createDispatcher,
  dispatch,
  jsonResponse,
  errorResponse,
  notFound,
  badRequest,
  unprocessable,
  methodNotAllowed,
  inFlight,
  replayedResponse,
  internalError,
  preflightPost,
  preflightGet,
} from "./handlers";

// Top-level facilitator factory.
export {
  createFacilitator,
  type Facilitator,
  type CreateFacilitatorOptions,
} from "./facilitator";

// Integrations — duck-typed adapters wiring the bridge to MercadoPago,
// MercadoLibre, and AR-fiscal compliance.
export * from "./integrations";
