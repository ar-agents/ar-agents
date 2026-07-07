/**
 * Shared HTTP helper for shipping adapters: timeout, retry, observability.
 *
 * Built on @ar-agents/core's retry engine (`runWithRetry` + the
 * idempotency-aware `defaultRetryClassifier`) instead of a hand-rolled
 * AbortController/setTimeout loop, so shipping shares ONE retry policy with
 * every other @ar-agents adapter: 5xx / 429 / network errors AND per-attempt
 * timeouts are retried for idempotent requests only. Unlike core's
 * `HttpClient`, this helper still returns the raw `Response` for every status
 * (including 4xx/5xx after retries are exhausted) because the carrier
 * adapters decode error bodies themselves and raise `ShippingCarrierError`.
 */

import {
  defaultRetryClassifier,
  runWithRetry,
  type RetryContext,
} from "@ar-agents/core";

export interface HttpRequestParams {
  url: string;
  init: RequestInit;
  fetchImpl?: typeof fetch;
  /** Default 30s. */
  requestTimeoutMs?: number;
  /** Default 1. */
  maxRetries?: number;
  /**
   * Whether the request is safe to retry. Idempotent reads (GET tariff /
   * tracking lookups) default to `true`. Non-idempotent writes (Andreani
   * `crear` / `cancelar` POSTs) MUST pass `false`: retrying them on a timeout
   * or 5xx would create duplicate shipments / double-cancellations even though
   * the original request may have succeeded server-side. Default `true`.
   */
  idempotent?: boolean;
  /** Carrier name for the observability hook label. */
  carrier: string;
  /** Operation name (cotizar, crear, etc.) for the observability hook label. */
  operation: string;
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

export async function shippingFetch(params: HttpRequestParams): Promise<Response> {
  const fetchImpl = params.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = params.requestTimeoutMs ?? 30_000;
  // Non-idempotent writes must never be retried: a timeout / 5xx does not mean
  // the carrier didn't process the request, so a retry risks a duplicate op.
  const idempotent = params.idempotent ?? true;
  const maxRetries = idempotent ? params.maxRetries ?? 1 : 0;
  const label = `shipping.${params.carrier}.${params.operation}`;
  const method = (params.init.method ?? "GET").toUpperCase();
  const ctx: RetryContext = { method, idempotent };

  try {
    return await runWithRetry(
      async (attempt) => {
        const start = Date.now();
        let res: Response;
        try {
          // Fresh per-attempt timeout signal, so a timed-out attempt can be
          // retried (idempotent requests only, per the classifier).
          res = await fetchImpl(params.url, {
            ...params.init,
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          params.onCall?.({
            label,
            durationMs: Date.now() - start,
            httpStatus: null,
            retried: attempt - 1,
            success: false,
          });
          throw err;
        }
        const decision = defaultRetryClassifier(null, res, ctx);
        if (decision.shouldRetry) {
          params.onCall?.({
            label,
            durationMs: Date.now() - start,
            httpStatus: res.status,
            retried: attempt - 1,
            success: false,
          });
          // Synthetic error carrying the Response, the same contract core's
          // fetchWithRetry uses: the classifier decides on retry; if attempts
          // run out we unwrap it below and hand the Response back.
          const synthetic = new Error(`HTTP ${res.status} ${res.statusText}`);
          (synthetic as { response?: Response }).response = res;
          throw synthetic;
        }
        params.onCall?.({
          label,
          durationMs: Date.now() - start,
          httpStatus: res.status,
          retried: attempt - 1,
          success: res.ok,
        });
        return res;
      },
      defaultRetryClassifier,
      { maxAttempts: maxRetries + 1, baseDelayMs: 250 },
      ctx,
    );
  } catch (err) {
    // Retryable status but attempts exhausted: keep the historical contract of
    // returning the last Response so adapters decode the carrier error body.
    const carried = (err as { response?: Response }).response;
    if (carried) return carried;
    throw err;
  }
}
