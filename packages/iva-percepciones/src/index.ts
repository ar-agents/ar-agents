// Public API surface for @ar-agents/iva-percepciones.

export {
  calculatePerception,
  buildPerceptionDdjj,
  quickPerception,
  asEntry,
} from "./calc";

export {
  DEFAULT_RATE_TABLE,
  IVA_PERCEPTION_TABLES,
} from "./tables";

export {
  type IvaPerceptionAdapter,
  UnconfiguredIvaPerceptionAdapter,
} from "./adapter";

export {
  ivaPerceptionTools,
  type IvaPerceptionToolsOptions,
  type IvaPerceptionToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  IvaPerceptionError,
  IvaPerceptionValidationError,
  IvaPerceptionRateNotFoundError,
  IvaPerceptionUnconfiguredError,
} from "./errors";

export type {
  IvaPerceptionRegime,
  BuyerIvaCondition,
  IvaPerceptionRateEntry,
  PerceptionInput,
  PerceptionResult,
  PerceptionEntry,
  PerceptionDdjjArgs,
  PerceptionDdjjResult,
} from "./types";
