// Subpath entry for AFIP WSAA + WSCDC integration.
//
// Imported as `@ar-agents/identity/wsaa` rather than the package root so
// callers who only want pure-algorithm CUIT validation don't pull in the
// node-forge dep tree.
//
// See `WsaaWscdcAfipPadronAdapter` for the adapter you typically wire into
// `identityTools({ afip })`.

export {
  WsaaWscdcAfipPadronAdapter,
  type WsaaWscdcAdapterOptions,
} from "./wsaa-wscdc-adapter";

export {
  loginCms,
  TokenCache,
  InMemoryTokenStore,
  buildTraXml,
  signTra,
  buildSoapEnvelope,
  parseLoginTicketResponse,
  type AccessTicket,
  type AfipEnv,
  type WsaaOptions,
  type TokenStore,
} from "./wsaa";

export {
  getPersonaA13,
  buildGetPersonaSoap,
  parseGetPersonaResponse,
  WSCDC_SERVICE_NAME,
} from "./wscdc";
