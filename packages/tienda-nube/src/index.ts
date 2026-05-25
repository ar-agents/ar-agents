// Public API surface for @ar-agents/tienda-nube.

export {
  type TiendaNubeAdapter,
  type FetchLike,
  type HttpTiendaNubeAdapterOptions,
  type InMemoryTiendaNubeAdapterSeed,
  UnconfiguredTiendaNubeAdapter,
  HttpTiendaNubeAdapter,
  InMemoryTiendaNubeAdapter,
} from "./adapter";

export {
  tiendaNubeTools,
  type TiendaNubeToolsOptions,
  type TiendaNubeToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export { buildAuthorizeUrl, exchangeCodeForToken } from "./oauth";

export {
  TiendaNubeError,
  TiendaNubeValidationError,
  TiendaNubeAuthError,
  TiendaNubeApiError,
  TiendaNubeUnconfiguredError,
} from "./errors";

export type {
  Currency,
  Locale,
  TnId,
  Localized,
  Store,
  Product,
  ProductVariant,
  Order,
  OrderStatus,
  PaymentStatus,
  ShippingStatus,
  OrderProduct,
  TnAddress,
  Customer,
  Webhook,
  WebhookEvent,
  ListOrdersArgs,
  ListProductsArgs,
  ListCustomersArgs,
  PageResult,
  OAuthAuthorizeArgs,
  OAuthExchangeArgs,
  OAuthTokenSet,
} from "./types";
