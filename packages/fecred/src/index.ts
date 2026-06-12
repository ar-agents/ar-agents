// Public API surface for @ar-agents/fecred.

export {
  type FecredAdapter,
  type FetchLike,
  type HttpFecredAdapterOptions,
  type InMemoryFecredOptions,
  UnconfiguredFecredAdapter,
  HttpFecredAdapter,
  InMemoryFecredAdapter,
} from "./adapter";

export {
  fecredTools,
  type FecredToolsOptions,
  type FecredToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  buildDummyEnvelope,
  buildConsultarMontoObligadoEnvelope,
  buildConsultarComprobantesEnvelope,
  buildAceptarEnvelope,
  buildRechazarEnvelope,
  parseDummyResponse,
  parseConsultarMontoObligadoResponse,
  parseConsultarComprobantesResponse,
  parseOperacionFECredResponse,
  FECRED_URLS,
  FECRED_SOAP_ACTIONS,
  SoapFaultError,
} from "./soap";

export {
  FecredError,
  FecredValidationError,
  FecredProtocolError,
  FecredUnconfiguredError,
} from "./errors";

export {
  checkObligationInputSchema,
  listComprobantesInputSchema,
  acceptInvoiceInputSchema,
  rejectInvoiceInputSchema,
  motivoRechazoSchema,
  idFacturaSchema,
  cuitSchema,
  isoDateSchema,
  rolEnum,
  estadoCmpEnum,
  tipoFechaEnum,
} from "./types";

export type {
  FecredEnv,
  AccessTicket,
  CodigoDescripcion,
  IdFactura,
  CheckObligationInput,
  CheckObligationResult,
  Rol,
  EstadoCmp,
  TipoFecha,
  ListComprobantesInput,
  ListComprobantesResult,
  FecredComprobante,
  AcceptInvoiceInput,
  RejectInvoiceInput,
  OperacionFECredResult,
  FecredHealth,
} from "./types";
