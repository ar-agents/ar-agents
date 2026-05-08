// Public API surface for @ar-agents/boletin-oficial.
//
// Drop into a Vercel AI SDK 6+ Agent setup as a tool collection, or use
// LiveBoFetcher / MockBoFetcher directly from any server-side handler.
//
// See README.md for usage and AGENTS.md for tool selection guidance.

// Public types.
export type {
  BoMatch,
  BoSeccion,
  BoSubscription,
  Norma,
  NormaTipo,
  SearchQuery,
  SearchResult,
} from "./types";

// Sección catalog + classifier.
export {
  SECCIONES,
  buildNormaUrl,
  classifyTipo,
  describeSeccion,
  extractCuits,
} from "./secciones";

// Fetchers — adapter contract + implementations.
export {
  type BoFetcher,
  type LiveBoFetcherOptions,
  LiveBoFetcher,
  MockBoFetcher,
  UnconfiguredBoFetcher,
  parseSearchHtml,
  parseDetailHtml,
} from "./fetcher";

// Subscriptions — adapter contract + matcher.
export {
  type BoSubscriptionAdapter,
  InMemoryBoSubscriptionAdapter,
  makeSubscriptionId,
  matchNorma,
} from "./subscriptions";

// Vercel AI SDK tool collection.
export {
  boletinOficialTools,
  type BoToolName,
  type BoToolsOptions,
} from "./tools";

// Errors.
export {
  BoError,
  FetcherNotConfiguredError,
  type BoErrorCode,
} from "./errors";
