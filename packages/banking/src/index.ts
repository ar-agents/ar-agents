// Public API surface for @ar-agents/banking.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool collection.
// Pair with `Experimental_Agent` (or any caller of `tool()`).
//
// See README.md for usage and AGENTS.md for tool selection guidance from an
// agent-author's perspective.

// CBU/CVU algorithm primitives — pure functions, no I/O.
export {
  parseCbu,
  isValidCbu,
  normalizeCbu,
  computeBlockCheckDigit,
  type CbuParseResult,
  type CbuKind,
} from "./cbu";

// Bank / PSP lookup table.
export {
  lookupBankByCode,
  lookupCvuByPrefix,
  listBanks,
  listPsps,
  type BankInfo,
  type EntityKind,
} from "./banks";

// BCRA Central de Deudores adapter contract + implementations.
export {
  type BcraDeudaAdapter,
  type BcraPublicApiAdapterOptions,
  UnconfiguredBcraAdapter,
  BcraPublicApiAdapter,
} from "./bcra";

// Result types.
export {
  describeSituation,
  type BcraDeudaResult,
  type BcraDeudaData,
  type BcraDebtEntity,
  type BcraSituation,
} from "./types";

// Vercel AI SDK tool collection.
export {
  bankingTools,
  type BankingToolName,
  type BankingToolsOptions,
} from "./tools";

// Errors for programmatic handling.
export {
  BankingError,
  BcraNotConfiguredError,
  type BankingErrorCode,
} from "./errors";
