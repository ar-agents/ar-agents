// `@ar-agents/mercadolibre` — public API surface.
//
// Production-grade Mercado Libre Agent Toolkit. Wraps the agent-relevant
// API surface — items + catalog (category predictor + domain technical
// specs), questions/messages, orders + packs, claims/mediation evidence,
// Mercado Envíos shipments, seller reputation monitor, promotions/
// candidates, webhooks with /missed_feeds replay.
//
// The first faithful TypeScript SDK since the official
// `mercadolibre/nodejs-sdk` was archived in February 2022.

// Schemas
export * from "./schemas";

// Errors
export * from "./errors";

// Retry + rate-limit primitives (in case consumers want to override).
export {
  fetchWithRetry,
  withRetry,
  defaultRetryClassifier,
  sleep,
  type RetryOptions,
  type RetryClassifier,
  type RetryDecision,
} from "./retry";
export {
  TokenBucketRateLimiter,
  NoopRateLimiter,
  type RateLimiter,
  type TokenBucketOptions,
} from "./rate-limiter";

// OAuth
export {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshTokens,
  ensureAccessToken,
  InMemoryOAuthStore,
  type OAuthAppCredentials,
  type OAuthTokenStore,
  type MeliOAuthTokens,
  type BuildAuthUrlInput,
} from "./oauth";

// Core client
export {
  MeliClient,
  type MeliClientOptions,
  type FetchOptions,
  type AuthMode,
} from "./client";

// Items
export {
  getItem,
  multigetItems,
  createItem,
  updateItem,
  pauseItem,
  closeItem,
  relistItem,
  searchSellerItems,
  iterateSellerItems,
  getItemDescription,
  updateItemDescription,
  type GetItemOptions,
  type SearchSellerItemsOptions,
  type SellerItemsSearchResponse,
  type ItemDescription,
} from "./items";

// Categories
export {
  predictCategory,
  discoverDomain,
  getDomainTechnicalSpecs,
  getRequiredAttributeIds,
  getCategory,
  listSiteCategories,
  categorizeAndPlan,
  type PredictCategoryInput,
  type CategorizeAndPlanResult,
} from "./categories";

// Questions
export {
  listQuestions,
  getQuestion,
  answerQuestion,
  blacklistAsker,
  unblockAsker,
  extractSpamFeatures,
  scoreSpam,
  classifySpam,
  type ListQuestionsOptions,
  type ClassifySpamInput,
  type SpamLabel,
} from "./questions";

// Orders + Packs
export {
  searchOrders,
  getOrder,
  getOrderBillingInfo,
  getPack,
  partitionByPack,
  type SearchOrdersOptions,
  type OrderBillingInfo,
} from "./orders";

// Claims / Mediation
export {
  searchClaims,
  getClaim,
  listClaimEvidences,
  uploadClaimEvidence,
  listClaimMessages,
  postClaimMessage,
  reviewReturn,
  defendClaim,
  type SearchClaimsOptions,
  type ClaimsSearchResponse,
  type ClaimEvidenceListResponse,
  type ClaimMessagesResponse,
  type ReturnReviewRequest,
  type ReturnReviewResponse,
  type DefendClaimInput,
  type DefendClaimResult,
} from "./claims";

// Shipments
export {
  getShipment,
  getShipmentHistory,
  fetchLabelsBlob,
  getShippingOptions,
  type FetchLabelsInput,
  type ShippingOptionsResponse,
} from "./shipments";

// Reputation
export {
  getSellerReputation,
  evaluateReputationAlerts,
  monitorReputation,
  type ReputationThresholds,
  type MonitorReputationOptions,
} from "./reputation";

// Promotions
export {
  listPromotionCandidates,
  listActivePromotions,
  optInPromotion,
  autoOptInPromotions,
  type ListPromotionCandidatesOptions,
  type PromotionCandidatesResponse,
  type MarginGuard,
  type AutoOptInResult,
} from "./promotions";

// Webhooks + missed-feeds replay
export {
  parseWebhook,
  extractResourceId,
  replayMissedFeeds,
  iterateAllMissedFeeds,
  type ParseWebhookOptions,
  type ReplayMissedFeedsOptions,
} from "./webhooks";

// Telemetry (pluggable hooks for OTel/Sentry/Datadog/etc.)
export {
  noopTelemetry,
  generateRequestId,
  type TelemetryHooks,
  type TelemetryRequestEvent,
  type TelemetryResponseEvent,
  type TelemetryRetryEvent,
  type TelemetryRateLimitEvent,
} from "./telemetry";
