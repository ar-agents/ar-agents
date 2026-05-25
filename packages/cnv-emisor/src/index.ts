// Public API surface for @ar-agents/cnv-emisor.

export type {
  IssuerRecord,
  HechoRelevante,
  HechoRelevanteCategory,
  FinancialStatementRecord,
  FinancialStatementKind,
} from "./types";

export {
  type CnvAdapter,
  type InMemoryCnvSeed,
  UnconfiguredCnvAdapter,
  InMemoryCnvAdapter,
} from "./adapter";

export {
  cnvTools,
  type CnvToolsOptions,
  type CnvToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  CnvError,
  CnvValidationError,
  CnvUnconfiguredError,
  CnvApiError,
} from "./errors";
