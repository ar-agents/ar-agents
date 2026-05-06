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
