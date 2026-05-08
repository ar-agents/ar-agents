// Public API surface for @ar-agents/igj.
//
// IGJ open data wrapped as Vercel AI SDK 6+ tools. Reads from the public
// CKAN at datos.jus.gob.ar — no auth required. The dataset is SAMPLE
// (`muestreo`), not real-time; every result carries a `coverageNote`
// that should be surfaced to users.
//
// See README.md for usage and AGENTS.md for tool selection guidance.

// Public types.
export type {
  IgjAsamblea,
  IgjAutoridad,
  IgjBalance,
  IgjDomicilio,
  IgjEntity,
  IgjEntityType,
  IgjSearchQuery,
  IgjSearchResult,
} from "./types";

// Pure helpers (no I/O, safe in any env).
export {
  normalizeCuit,
  normalizeEntityType,
  parseAsamblea,
  parseAutoridad,
  parseBalance,
  parseDomicilio,
  parseEntity,
} from "./normalize";

// Fetchers.
export {
  type IgjFetcher,
  type LiveCkanFetcherOptions,
  IGJ_RESOURCE_IDS,
  LiveCkanFetcher,
  MockIgjFetcher,
  UnconfiguredIgjFetcher,
} from "./fetcher";

// Vercel AI SDK tool collection.
export {
  igjTools,
  type IgjToolName,
  type IgjToolsOptions,
} from "./tools";

// Errors.
export {
  IgjError,
  FetcherNotConfiguredError,
  type IgjErrorCode,
} from "./errors";
