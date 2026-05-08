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

/** A function that decides whether a thrown error / response is retryable. */
export type RetryClassifier = (
  error: unknown,
  response: Response | null,
) => RetryDecision;

/** Default classifier — retry on 5xx, 429, AbortError, fetch network errors. */
export const defaultRetryClassifier: RetryClassifier = (error, response) => {
  if (response) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds)) {
          return { shouldRetry: true, delayMsOverride: seconds * 1000 };
        }
      }
      return { shouldRetry: true };
    }
    if (response.status >= 500 && response.status < 600) {
      return { shouldRetry: true };
    }
    return { shouldRetry: false };
  }
  // Network error, fetch threw, AbortError, etc.
  if (error instanceof Error) {
    if (error.name === "AbortError") return { shouldRetry: false };
    return { shouldRetry: true };
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
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await op(attempt);
    } catch (err) {
      lastError = err;
      const response = (err as { response?: Response }).response ?? null;
      const decision = classifier(err, response);
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
  return withRetry(
    async () => {
      let response: Response;
      try {
        response = await fetchImpl(url, init);
      } catch (err) {
        const decision = classifier(err, null);
        if (!decision.shouldRetry) throw err;
        throw err;
      }
      const decision = classifier(null, response);
      if (decision.shouldRetry) {
        const synthetic = new Error(`HTTP ${response.status} ${response.statusText}`);
        (synthetic as { response?: Response }).response = response;
        throw synthetic;
      }
      return response;
    },
    classifier,
    options,
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
