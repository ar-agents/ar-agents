// Public API surface for @ar-agents/iibb.

export {
  RateBook,
  computeDdjj,
  calculateRetention,
  calculatePerception,
  type ComputeDdjjArgs,
} from "./calc";

export {
  type IibbAdapter,
  type FetchLike,
  type HttpPadronAdapterOptions,
  type AgipPublicAdapterOptions,
  type ArbaCitAdapterOptions,
  UnconfiguredIibbAdapter,
  HttpPadronAdapter,
  AgipPublicAdapter,
  ArbaCitAdapter,
  AgipAdapter,
  ArbaAdapter,
  ConvenioMultilateralAdapter,
} from "./adapter";

export {
  iibbTools,
  type IibbToolsOptions,
  type IibbToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  IibbError,
  IibbUnconfiguredError,
  IibbValidationError,
  IibbRateNotFoundError,
} from "./errors";

export type {
  JurisdictionCode,
  Authority,
  Alicuota,
  Padron,
  CmRegime,
  IngresoLine,
  DdjjResult,
  DdjjJurisdictionSummary,
  RetentionInput,
  RetentionResult,
  PerceptionInput,
  PerceptionResult,
} from "./types";

export { AUTHORITY_BY_JURISDICTION } from "./types";
