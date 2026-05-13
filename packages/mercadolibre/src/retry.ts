// Exponential-backoff retry helper.
//
// Retries on 5xx + 429 + network errors. Honors `Retry-After` when present
// (seconds or HTTP-date). Configurable max attempts + base delay. Adds
// jitter so concurrent failures don't synchronize.

export interface RetryOptions {
  /** Max attempts (including the first). Default 4. */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default 200. */
  baseDelayMs?: number;
  /** Max delay between retries in ms. Default 8000. */
  maxDelayMs?: number;
  /** Jitter factor 0..1. Default 0.3 (±30%). */
  jitter?: number;
  /** Custom callback fired before each retry. */
  onRetry?: (attempt: number, lastError: unknown) => void;
}

const DEFAULTS = {
  maxAttempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 8000,
  jitter: 0.3,
} as const;

export interface RetryDecision {
  shouldRetry: boolean;
  /** Override delay (e.g. from Retry-After header). */
  delayMsOverride?: number;
}

export interface RetryContext {
  /** HTTP method of the request being attempted, uppercase. Default "GET". */
  method?: string;
  /** Attempt number (1-based). */
  attempt?: number;
}

/** A function that decides whether a thrown error / response is retryable. */
export type RetryClassifier = (
  error: unknown,
  response: Response | null,
  ctx?: RetryContext,
) => RetryDecision;

/** HTTP methods that are safe to retry by default (RFC 9110 idempotent set). */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/** Parse a `Retry-After` header value: integer seconds OR HTTP-date. */
function parseRetryAfter(value: string): number | null {
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/**
 * Default classifier — retry on 5xx, 429, network errors. By default,
 * **only retries idempotent methods** (GET/HEAD/OPTIONS/PUT/DELETE). POST
 * and PATCH are NOT retried because MELI's gateway can persist a request
 * after a 5xx (split-brain), which would create duplicate listings,
 * double-answers, or duplicate promo opt-ins on retry.
 *
 * Callers who know their POST endpoint is idempotent (or who supply an
 * `X-Idempotency-Key` header) can override via `retryClassifier`.
 */
export const defaultRetryClassifier: RetryClassifier = (error, response, ctx) => {
  const method = ctx?.method?.toUpperCase() ?? "GET";
  const methodIsIdempotent = IDEMPOTENT_METHODS.has(method);

  if (response) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const delayMs = parseRetryAfter(retryAfter);
        if (delayMs !== null) {
          return { shouldRetry: true, delayMsOverride: delayMs };
        }
      }
      // 429 is safe to retry on any method (request hadn't been processed).
      return { shouldRetry: true };
    }
    if (response.status >= 500 && response.status < 600) {
      // 5xx is split-brain risky: only retry idempotent verbs.
      return { shouldRetry: methodIsIdempotent };
    }
    return { shouldRetry: false };
  }
  // Network-level failure (fetch threw, AbortError, etc.)
  if (error instanceof Error) {
    if (error.name === "AbortError") return { shouldRetry: false };
    // Network errors are safe to retry on idempotent methods. For non-
    // idempotent ones we have no way to know if the server got the request,
    // so we err on the side of "fail loud."
    return { shouldRetry: methodIsIdempotent };
  }
  return { shouldRetry: false };
};

/**
 * Run an async operation with exponential backoff. The operation receives
 * the current attempt number (1-based) and is expected to either resolve
 * with a value or throw. The classifier decides whether to retry.
 *
 * For HTTP, prefer the `fetchWithRetry` helper instead — it composes this
 * with response inspection.
 */
export async function withRetry<T>(
  op: (attempt: number) => Promise<T>,
  classifier: RetryClassifier = defaultRetryClassifier,
  options: RetryOptions = {},
  ctx: RetryContext = {},
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await op(attempt);
    } catch (err) {
      lastError = err;
      const response = (err as { response?: Response }).response ?? null;
      const decision = classifier(err, response, { ...ctx, attempt });
      if (!decision.shouldRetry || attempt === opts.maxAttempts) {
        throw err;
      }
      const delay =
        decision.delayMsOverride ??
        computeBackoffMs(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.jitter);
      opts.onRetry?.(attempt, err);
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Variant of `withRetry` specialized for `fetch`. The op MUST return the
 * `Response`, NOT throw on 4xx/5xx — this helper inspects the response
 * status itself. Network errors (fetch throwing) are retried per the
 * classifier.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
  classifier: RetryClassifier = defaultRetryClassifier,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const ctx: RetryContext = { method };
  return withRetry(
    async () => {
      const response = await fetchImpl(url, init);
      const decision = classifier(null, response, ctx);
      if (decision.shouldRetry) {
        const synthetic = new Error(`HTTP ${response.status} ${response.statusText}`);
        (synthetic as { response?: Response }).response = response;
        throw synthetic;
      }
      return response;
    },
    classifier,
    options,
    ctx,
  );
}

function computeBackoffMs(
  attempt: number,
  base: number,
  max: number,
  jitter: number,
): number {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  const j = exp * jitter * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(exp + j));
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
