// Public API surface for @ar-agents/inpi.

export type {
  TrademarkStatus,
  TrademarkRecord,
  SearchInput,
  SearchResult,
} from "./types";

export {
  type InpiAdapter,
  type FetchLike,
  type HttpInpiAdapterOptions,
  type InMemoryInpiSeed,
  UnconfiguredInpiAdapter,
  HttpInpiAdapter,
  InMemoryInpiAdapter,
} from "./adapter";

export {
  inpiTools,
  type InpiToolsOptions,
  type InpiToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  InpiError,
  InpiValidationError,
  InpiUnconfiguredError,
  InpiApiError,
} from "./errors";
