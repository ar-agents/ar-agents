// Public API surface for @ar-agents/wscdc.

export {
  type WscdcAdapter,
  type FetchLike,
  type HttpWscdcAdapterOptions,
  type InMemoryWscdcSeed,
  UnconfiguredWscdcAdapter,
  HttpWscdcAdapter,
  InMemoryWscdcAdapter,
} from "./adapter";

export {
  wscdcTools,
  type WscdcToolsOptions,
  type WscdcToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  buildConstatarEnvelope,
  buildDummyEnvelope,
  parseConstatarResponse,
  parseDummyResponse,
  WSCDC_URLS,
  WSCDC_SOAP_ACTIONS,
  SoapFaultError,
} from "./soap";

export { validateConstatarRequest, normalizeCuit } from "./validate";

export {
  WscdcError,
  WscdcValidationError,
  WscdcProtocolError,
  WscdcUnconfiguredError,
} from "./errors";

export type {
  WscdcEnv,
  CbteModo,
  CbteTipoCode,
  DocTipoCode,
  ConstatarRequest,
  ConstatarResult,
  ConstatarResultado,
  ConstatarObservacion,
  AccessTicket,
} from "./types";
