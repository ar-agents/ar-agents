// Public API surface for @ar-agents/identity.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool collection.
// Pair with `Experimental_Agent` (or any caller of `tool()`) and an optional
// AFIP adapter for taxpayer lookups.
//
// See README.md for usage and AGENTS.md for tool selection guidance from an
// agent-author's perspective.

// Algorithm primitives — pure functions, no I/O, always safe to call.
export {
  parseCuit,
  isValidCuit,
  computeCheckDigit,
  normalizeCuit,
  describePersonType,
  type CuitParseResult,
  type CuitPersonType,
} from "./cuit";

// AFIP padron adapter contract + default unconfigured implementation.
export {
  type AfipPadronAdapter,
  UnconfiguredAfipPadronAdapter,
} from "./afip";

// Vercel AI SDK tool collection.
export {
  identityTools,
  validateCuitTool,
  type IdentityToolName,
  type IdentityToolsOptions,
} from "./tools";

// Result types for AFIP lookups.
export type {
  AfipPadronData,
  AfipPadronResult,
  AfipTaxCondition,
  MonotributoCategoria,
} from "./types";

// Errors for programmatic handling.
export {
  IdentityError,
  AfipNotConfiguredError,
  AfipCuitNotFoundError,
  type IdentityErrorCode,
} from "./errors";
