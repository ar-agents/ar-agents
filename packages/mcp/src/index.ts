export { createServer, startStdio } from "./server";
export {
  adaptToolSetToMcp,
  combineToolSets,
  type McpAdapter,
  type McpTool,
} from "./adapter";
export {
  buildIdentityTools,
  describeIdentityConfig,
} from "./registries/identity";
export {
  buildMercadoPagoTools,
  describeMercadoPagoConfig,
} from "./registries/mercadopago";
export {
  buildWhatsAppTools,
  describeWhatsAppConfig,
  getWhatsAppClient,
} from "./registries/whatsapp";
export {
  buildIdentityAttestTools,
  describeIdentityAttestConfig,
} from "./registries/identity-attest";
export {
  buildBankingTools,
  describeBankingConfig,
} from "./registries/banking";
export {
  buildFacturacionTools,
  describeFacturacionConfig,
} from "./registries/facturacion";
export {
  buildShippingTools,
  describeShippingConfig,
} from "./registries/shipping";
export {
  buildMiArgentinaTools,
  describeMiArgentinaConfig,
} from "./registries/mi-argentina";
export {
  buildBoletinOficialTools,
  describeBoletinOficialConfig,
} from "./registries/boletin-oficial";
export {
  buildIgjTools,
  describeIgjConfig,
} from "./registries/igj";
export {
  buildFirmaDigitalTools,
  describeFirmaDigitalConfig,
} from "./registries/firma-digital";
