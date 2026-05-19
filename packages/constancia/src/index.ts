// Public API surface for @ar-agents/constancia.
//
// ARCA Constancia de Inscripción — the official, legally-citable fiscal
// document — for AI agents on the Vercel AI SDK 6+. Browser-backed: the
// PDF artifact has no API, so this drives the public web form via the
// companion `afip-constancia` skill (browserbase/skills) behind a typed,
// testable adapter contract.
//
// See README.md for usage and AGENTS.md for tool-selection guidance.

// Public types.
export type {
  CondicionFiscal,
  Constancia,
  ConstanciaActividad,
  ConstanciaDomicilio,
  ConstanciaImpuesto,
  ConstanciaPdf,
  ConstanciaResult,
  RawSkillOutput,
} from "./types";

// Fetchers — adapter contract + implementations.
export {
  type ConstanciaFetcher,
  type BrowseSkillConstanciaFetcherOptions,
  BrowseSkillConstanciaFetcher,
  MockConstanciaFetcher,
  UnconfiguredConstanciaFetcher,
  normalizeCuit,
  parseSkillOutput,
} from "./fetcher";

// Vercel AI SDK tool collection.
export {
  constanciaTools,
  type ConstanciaToolName,
  type ConstanciaToolsOptions,
} from "./tools";

// Errors.
export {
  ConstanciaError,
  FetcherNotConfiguredError,
  type ConstanciaErrorCode,
} from "./errors";
