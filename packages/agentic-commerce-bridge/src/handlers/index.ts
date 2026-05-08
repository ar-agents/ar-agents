// Public exports for the handler/facilitator layer.

export type {
  AcpRequest,
  AcpResponse,
  CatalogProvider,
  ResolvedItem,
  PaymentProvider,
  PaymentResult,
  AuthenticationAction,
  FacilitatorHooks,
  FacilitatorOptions,
} from "./types";
export { OutOfStockError, header } from "./types";

export {
  handleCreateSession,
  handleUpdateSession,
  handleGetSession,
  handleCompleteSession,
  handleCancelSession,
} from "./checkout-session";

export { handleDiscovery, buildDefaultDiscovery } from "./discovery";

export {
  createDispatcher,
  dispatch,
  type DispatcherConfig,
} from "./dispatcher";

export {
  jsonResponse,
  errorResponse,
  notFound,
  badRequest,
  unprocessable,
  methodNotAllowed,
  inFlight,
  replayedResponse,
  internalError,
} from "./responses";

export {
  preflightPost,
  preflightGet,
  type Prereqs,
} from "./preflight";
