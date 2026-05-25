// Public API surface for @ar-agents/dnrpa.

export type {
  DominioLookupInput,
  DominioLookupResult,
  DominioFormat,
} from "./types";
export { detectDominioFormat } from "./types";

export {
  type DnrpaAdapter,
  type InMemoryDnrpaSeed,
  UnconfiguredDnrpaAdapter,
  InMemoryDnrpaAdapter,
} from "./adapter";

export {
  dnrpaTools,
  type DnrpaToolsOptions,
  type DnrpaToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  DnrpaError,
  DnrpaValidationError,
  DnrpaUnconfiguredError,
  DnrpaCaptchaError,
} from "./errors";
