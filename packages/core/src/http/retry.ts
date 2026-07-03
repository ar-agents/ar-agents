// HTTP retry with exponential backoff + jitter.
//
// Lifted from @ar-agents/mercadolibre's battle-tested transport into core so
// every adapter shares ONE retry policy instead of re-inventing it (or, worse,
// shipping none). Retries 5xx + 429 + network/timeout errors, honors
// `Retry-After`, and — critically — only retries NON-idempotent methods
// (POST/PATCH) when the caller explicitly marks the request safe. Without that
// guard a timeout-after-write duplicates a payment, an invoice, or a shipment.

export interface HttpRetryOptions {
  /** Max attempts (including the first). Default 4. */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default 200. */
  baseDelayMs?: number;
  /** Max delay between retries in ms. Default 8000. */
  maxDelayMs?: number;
  /** Jitter factor 0..1. Default 0.3 (±30%). */
  jitter?: number;
  /** Fired before each retry (attempt is 1-based, pre-increment). */
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
  /** Override delay (e.g. from a `Retry-After` header), in ms. */
  delayMsOverride?: number;
}

export interface RetryContext {
  /** HTTP method of the request, uppercase. Default "GET". */
  method?: string;
  /** Attempt number (1-based). */
  attempt?: number;
  /**
   * Explicit override of method-based idempotency. When set it wins: pass
   * `true` for a POST that is safe to retry (idempotent endpoint or an
   * Idempotency-Key header), `false` to forbid retrying an otherwise-idempotent
   * method. Undefined → derive from {@link IDEMPOTENT_METHODS}.
   */
  idempotent?: boolean;
}

/** A function that decides whether a thrown error / response is retryable. */
export type RetryClassifier = (
  error: unknown,
  response: Response | null,
  ctx?: RetryContext,
) => RetryDecision;

/** HTTP methods safe to retry by default (RFC 9110 idempotent set). */
export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE",
]);

/** Parse a `Retry-After` header value: integer seconds OR HTTP-date → ms. */
export function parseRetryAfter(value: string): number | null {
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && String(seconds) === value.trim()) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/**
 * Default classifier — retry on 5xx, 429, and network/timeout errors, but only
 * for idempotent requests (see {@link RetryContext.idempotent}).
 *
 * - **429**: retryable only if idempotent — honors `Retry-After`. A
 *   non-idempotent money POST is NOT retried on a 429 (double-spend risk).
 * - **5xx**: retry only if idempotent — a gateway can persist a write after a
 *   5xx (split-brain), so retrying a POST risks a duplicate.
 * - **network error**: retry if idempotent.
 * - **our own timeout** (`TimeoutError` from `AbortSignal.timeout`): retry if
 *   idempotent — the attempt was abandoned before a response.
 * - **caller cancellation** (`AbortError`): never retry — the caller asked to
 *   stop.
 */
export const defaultRetryClassifier: RetryClassifier = (error, response, ctx) => {
  const method = ctx?.method?.toUpperCase() ?? "GET";
  const idempotent = ctx?.idempotent ?? IDEMPOTENT_METHODS.has(method);

  if (response) {
    if (response.status === 429) {
      // A 429 is only safe to retry on an idempotent request. Retrying a
      // non-idempotent money POST on a 429 can double-spend: the server may
      // have rate-limited AFTER partially processing (or the retry itself
      // re-submits an order). Gate on idempotency exactly like 5xx — callers
      // whose POST is genuinely safe opt in with `idempotent: true`.
      if (!idempotent) return { shouldRetry: false };
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const delayMs = parseRetryAfter(retryAfter);
        if (delayMs !== null) return { shouldRetry: true, delayMsOverride: delayMs };
      }
      return { shouldRetry: true };
    }
    if (response.status >= 500 && response.status < 600) {
      return { shouldRetry: idempotent };
    }
    return { shouldRetry: false };
  }

  if (error instanceof Error) {
    // Caller cancelled — respect it, never retry.
    if (error.name === "AbortError") return { shouldRetry: false };
    // Our timeout, or a raw network failure → retry only if idempotent.
    return { shouldRetry: idempotent };
  }
  return { shouldRetry: false };
};

/**
 * Run an async op with exponential backoff. The op receives the 1-based attempt
 * number and either resolves or throws; the classifier decides on retry. For
 * HTTP prefer {@link fetchWithRetry}, which composes this with response
 * inspection.
 */
export async function runWithRetry<T>(
  op: (attempt: number) => Promise<T>,
  classifier: RetryClassifier = defaultRetryClassifier,
  options: HttpRetryOptions = {},
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
      if (!decision.shouldRetry || attempt === opts.maxAttempts) throw err;
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
 * `runWithRetry` specialized for `fetch`. The wrapped call MUST return the
 * `Response` (not throw on 4xx/5xx) — this helper inspects the status itself and
 * synthesizes a retry-carrying error when the classifier says so. Network
 * errors (fetch throwing) propagate to the classifier as-is.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: HttpRetryOptions = {},
  classifier: RetryClassifier = defaultRetryClassifier,
  fetchImpl: typeof fetch = fetch,
  ctx: RetryContext = {},
): Promise<Response> {
  const method = (init.method ?? ctx.method ?? "GET").toUpperCase();
  const fullCtx: RetryContext = { ...ctx, method };
  return runWithRetry(
    async () => {
      const response = await fetchImpl(url, init);
      const decision = classifier(null, response, fullCtx);
      if (decision.shouldRetry) {
        const synthetic = new Error(`HTTP ${response.status} ${response.statusText}`);
        (synthetic as { response?: Response }).response = response;
        throw synthetic;
      }
      return response;
    },
    classifier,
    options,
    fullCtx,
  );
}

function computeBackoffMs(attempt: number, base: number, max: number, jitter: number): number {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  const j = exp * jitter * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(exp + j));
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
