// Public API surface for @ar-agents/sicore.

export {
  calculateRetention,
  calculateRetentionStream,
  buildSicoreDdjj,
  quickRetention,
  asEntry,
} from "./calc";

export {
  DEFAULT_RATE_TABLE,
  SICORE_TABLES,
} from "./tables";

export {
  type SicoreAdapter,
  UnconfiguredSicoreAdapter,
} from "./adapter";

export {
  sicoreTools,
  type SicoreToolsOptions,
  type SicoreToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  SicoreError,
  SicoreValidationError,
  SicoreRateNotFoundError,
  SicoreUnconfiguredError,
} from "./errors";

export type {
  SicoreCategory,
  SupplierStatus,
  SicoreRateEntry,
  SicoreScaleStep,
  RetentionInput,
  RetentionResult,
  SicoreEntry,
  SicoreDdjjArgs,
  SicoreDdjjResult,
} from "./types";
