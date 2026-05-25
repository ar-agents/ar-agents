// Public API surface for @ar-agents/banking-bcra.

export {
  type BcraAdapter,
  type FetchLike,
  type HttpBcraAdapterOptions,
  type InMemoryBcraSeed,
  UnconfiguredBcraAdapter,
  HttpBcraAdapter,
  InMemoryBcraAdapter,
} from "./adapter";

export {
  bcraTools,
  type BcraToolsOptions,
  type BcraToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  summarizeDebt,
  riskBand,
  entryAmountCentavos,
  normalizeCuit,
} from "./summarize";

export {
  BcraError,
  BcraValidationError,
  BcraNotFoundError,
  BcraApiError,
  BcraUnconfiguredError,
} from "./errors";

export type {
  Cuit,
  SituacionCrediticia,
  DebtEntry,
  DebtResponse,
  HistoricalDebtPeriodo,
  HistoricalDebtResponse,
  BouncedCheckEntry,
  BouncedChecksResponse,
  DebtSummary,
} from "./types";
