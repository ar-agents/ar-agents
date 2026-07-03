// Shared HTTP transport + response validation for @ar-agents/* adapters.
// See ./client.ts for the rationale (one transport, schema-validated boundary).

export {
  HttpClient,
  type HttpClientOptions,
  type HttpRequest,
  type HttpMethod,
  type QueryParams,
  type AuthProvider,
} from "./client";

export {
  parseOrThrow,
  type ResponseSchema,
  type SafeParseResult,
  type SchemaIssue,
} from "./schema";

export {
  fetchWithRetry,
  runWithRetry,
  defaultRetryClassifier,
  parseRetryAfter,
  sleep,
  IDEMPOTENT_METHODS,
  type HttpRetryOptions,
  type RetryClassifier,
  type RetryContext,
  type RetryDecision,
} from "./retry";
