/**
 * Shared HTTP helper for shipping adapters — timeout, retry, observability.
 *
 * Mirrors the `fetchWithRetry` pattern from `@ar-agents/identity` but
 * tailored to shipping carrier APIs (REST/JSON instead of SOAP).
 */

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
   * `crear` / `cancelar` POSTs) MUST pass `false` — retrying them on a timeout
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

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(params.url, {
        ...params.init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok && res.status >= 500 && attempt < maxRetries) {
        params.onCall?.({
          label,
          durationMs: Date.now() - start,
          httpStatus: res.status,
          retried: attempt,
          success: false,
        });
        await sleep(250 * (attempt + 1));
        continue;
      }

      params.onCall?.({
        label,
        durationMs: Date.now() - start,
        httpStatus: res.status,
        retried: attempt,
        success: res.ok,
      });
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));
      params.onCall?.({
        label,
        durationMs: Date.now() - start,
        httpStatus: null,
        retried: attempt,
        success: false,
      });
      if (isAbort || attempt >= maxRetries) {
        throw err;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error("shippingFetch exhausted retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
