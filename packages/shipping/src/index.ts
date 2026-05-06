// Public API surface for @ar-agents/shipping.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool collection.
// Pair with `Experimental_Agent` (or any caller of `tool()`) and one or more
// adapters wired to AR shipping carriers.

// Adapter contract + implementations.
export {
  type ShippingAdapter,
  UnconfiguredShippingAdapter,
  MockShippingAdapter,
} from "./adapter";
export { AndreaniAdapter, type AndreaniAdapterOptions } from "./adapter-andreani";
export { OcaAdapter, type OcaAdapterOptions } from "./adapter-oca";
export { CorreoAdapter, type CorreoAdapterOptions } from "./adapter-correo";

// Vercel AI SDK tool collection.
export {
  shippingTools,
  unconfiguredShippingTools,
  type ShippingToolName,
  type ShippingToolsOptions,
} from "./tools";

// Provincias + CPA helpers (pure).
export {
  PROVINCIAS,
  lookupProvincia,
  isValidCPA,
  type Provincia,
} from "./provincias";

// Result types.
export type {
  Carrier,
  ServiceLevel,
  ShipmentDirection,
  Address,
  PackageInfo,
  QuoteInput,
  QuoteOption,
  CreateShipmentInput,
  ShipmentCreated,
  TrackingStatus,
  TrackingEvent,
  TrackingResult,
  CancelResult,
  Branch,
} from "./types";

// Errors.
export {
  ShippingError,
  ShippingNotConfiguredError,
  ShippingNotSupportedError,
  ShippingCarrierError,
  type ShippingErrorCode,
} from "./errors";
