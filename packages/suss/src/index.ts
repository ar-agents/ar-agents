// Public API surface for @ar-agents/suss.

export {
  calculateEmployeeMonth,
  buildSicossDdjj,
  quickContribuciones,
} from "./calc";

export { DEFAULT_RATE_TABLE } from "./rates";

export {
  type SussAdapter,
  UnconfiguredSussAdapter,
} from "./adapter";

export {
  sussTools,
  type SussToolsOptions,
  type SussToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  SussError,
  SussValidationError,
  SussUnconfiguredError,
} from "./errors";

export type {
  EmploymentMode,
  EmployerContributionRegime,
  EmployeeMonthInput,
  EmployeeMonthResult,
  CalcEmployeeArgs,
  ContributionRateTable,
  SicossDdjjArgs,
  SicossDdjjResult,
} from "./types";
