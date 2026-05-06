// Public API surface for @ar-agents/facturacion.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool collection.
// Pair with `Experimental_Agent` (or any caller of `tool()`) and a
// `WsfeClient` configured with your AFIP/ARCA cert.
//
// See README.md for the cert + service-authorization walkthrough and
// AGENTS.md for tool selection guidance.

// High-level client (the typical entrypoint).
export { WsfeClient, type WsfeClientOptions } from "./wsfe-client";

// Vercel AI SDK tool collection.
export {
  facturacionTools,
  type FacturacionToolName,
  type FacturacionToolsOptions,
} from "./tools";

// Pre-flight validator (catches AFIP rejections locally).
export {
  validateSolicitarCae,
  type ValidationError,
  type ValidationResult,
} from "./validator";

// AFIP catalogs (constants — comprobante types, doc types, IVA rates, etc.).
export {
  CbteTipo,
  DocTipo,
  Concepto,
  AlicuotaIva,
  Moneda,
  describeCbteTipo,
  type CbteTipoCode,
  type DocTipoCode,
  type ConceptoCode,
  type AlicuotaIvaCode,
  type MonedaCode,
  type WsfeResultado,
} from "./catalogs";

// Low-level operations (for advanced users — most apps use WsfeClient).
export {
  solicitarCAE,
  consultarUltimoAutorizado,
  consultarComprobante,
  dummy,
  getTiposCbte,
  getTiposDoc,
  getTiposIva,
  getTiposConcepto,
  getTiposMonedas,
  getCotizacion,
  WSFE_SERVICE_NAME,
  type CatalogItem,
} from "./wsfe";

// Result types.
export type {
  WsfeEnv,
  IvaItem,
  TributoItem,
  CbteAsociado,
  OpcionalItem,
  SolicitarCaeInput,
  SolicitarCaeResult,
  UltimoComprobanteResult,
  ConsultarComprobanteResult,
  DummyResult,
  WsfeError,
  WsfeObservacion,
  WsfeEvento,
} from "./types";

// Errors.
export {
  FacturacionError,
  WsfeNotConfiguredError,
  WsfeValidationError,
  WsfeRejectedError,
  type FacturacionErrorCode,
} from "./errors";
