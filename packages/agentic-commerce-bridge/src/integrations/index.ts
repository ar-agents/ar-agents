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

// AP2 mandate integration (opt-in, requires `@ar-agents/ap2` peer dep).
export {
  verifyAp2CheckoutCredential,
  signAp2CheckoutReceipt,
  signAp2PaymentReceipt,
  type VerifyAp2CredentialOptions,
  type Ap2VerifyOutcome,
  type SignAp2CheckoutReceiptOptions,
  type SignAp2PaymentReceiptOptions,
} from "./ap2";
