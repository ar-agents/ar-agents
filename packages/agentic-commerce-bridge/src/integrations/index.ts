// Integration adapters — duck-typed glue between the bridge and the
// `@ar-agents/*` ecosystem (or any equivalent client).

export {
  createMercadoPagoPaymentProvider,
  mercadoPagoPaymentHandler,
  sessionToPreferencePayload,
  type MercadoPagoProviderOptions,
  type MpPreferenceCreatePayload,
  type MpPreferenceResponse,
  type MpPaymentResponse,
} from "./mp";

export {
  parseMpPaymentIdFromWebhook,
  mpStatusToAcpOrderStatus,
  buildAcpEventFromMpWebhook,
  type MpWebhookV1,
  type MpWebhookV2,
  type MpWebhookPayload,
  type BuildAcpEventOptions,
} from "./mp-webhook";

export {
  createMeliCatalogProvider,
  buildMeliFeed,
  buildMeliFeedBatch,
  meliItemToFeedProduct,
  type MeliItem,
  type MeliCatalogProviderOptions,
  type FeedProduct,
  type BuildMeliFeedOptions,
} from "./meli";

export {
  createFacturacionHook,
  selectFacturaType,
  type SellerFiscal,
  type SellerRegime,
  type BuyerFiscal,
  type BuyerIvaCondition,
  type FacturaType,
  type WsfeClientLike,
  type WsfeAuthorizeRequest,
  type WsfeAuthorizeResponse,
  type ArcaPadronLookup,
  type ArcaPadronLookupResult,
  type FacturacionHookOptions,
} from "./facturacion";
