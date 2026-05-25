// Public API surface for @ar-agents/iva-retenciones.

export {
  calculateRetention,
  buildRetentionDdjj,
  quickRetention,
  asEntry,
} from "./calc";

export { DEFAULT_RATE_TABLE, IVA_RETENTION_TABLES } from "./tables";

export {
  type IvaRetentionAdapter,
  UnconfiguredIvaRetentionAdapter,
} from "./adapter";

export {
  ivaRetentionTools,
  type IvaRetentionToolsOptions,
  type IvaRetentionToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  IvaRetentionError,
  IvaRetentionValidationError,
  IvaRetentionRateNotFoundError,
  IvaRetentionUnconfiguredError,
} from "./errors";

export type {
  IvaRetentionRegime,
  IvaOperationType,
  SupplierStatus,
  IvaRetentionRateEntry,
  RetentionInput,
  RetentionResult,
  RetentionEntry,
  RetentionDdjjArgs,
  RetentionDdjjResult,
} from "./types";
