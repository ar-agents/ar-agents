// Pluggable telemetry hooks. Wires the client to OpenTelemetry, Sentry,
// Datadog, custom logging — without modifying the lib.
//
// Hosts pass `telemetry: { onRequest, onResponse, onRetry, onRateLimitWait }`
// in `MeliClientOptions`. All hooks are optional; the client treats missing
// hooks as no-ops with zero overhead.
//
// Design choices:
//   - Hooks are SYNCHRONOUS by default — they shouldn't add latency to the
//     request path. Async work (e.g., shipping spans to a remote collector)
//     should be enqueued by the host.
//   - The hook payload uses opaque `requestId` strings the host generates so
//     onRequest/onResponse can be correlated.
//   - We never pass headers containing `Authorization` to hooks.

export interface TelemetryRequestEvent {
  /** Stable id for correlating onRequest ↔ onResponse / onRetry. */
  requestId: string;
  /** Wall-clock start in ms (Date.now). */
  startedAt: number;
  method: string;
  /** Full URL including query string. */
  url: string;
  /** Path without query string for low-cardinality span names. */
  path: string;
  /** Attempt number (1-based). */
  attempt: number;
}

export interface TelemetryResponseEvent {
  requestId: string;
  /** Wall-clock end in ms. */
  endedAt: number;
  /** Total duration in ms (endedAt - startedAt). */
  durationMs: number;
  status: number;
  /** Number of attempts that ran before this response (1 = no retries). */
  attempts: number;
  /** MELI's request id from the response header, if present. */
  meliRequestId?: string;
}

export interface TelemetryRetryEvent {
  requestId: string;
  attempt: number;
  /** Reason: 5xx status, 429, network error, etc. */
  reason: "status" | "network" | "timeout";
  status?: number;
  /** Backoff delay before next attempt, in ms. */
  delayMs: number;
}

export interface TelemetryRateLimitEvent {
  /** Bucket scope (`seller:<userId>`, `bearer:<suffix>`, or "anon"). */
  scope: string;
  /** How long we waited for a token, in ms. */
  waitMs: number;
}

export interface TelemetryHooks {
  /** Fired before the HTTP call leaves the client. */
  onRequest?: (event: TelemetryRequestEvent) => void;
  /** Fired after the response is received (success or non-retryable error). */
  onResponse?: (event: TelemetryResponseEvent) => void;
  /** Fired before each retry attempt. */
  onRetry?: (event: TelemetryRetryEvent) => void;
  /** Fired when a rate-limit token wait completes. Only emitted when wait > 0. */
  onRateLimitWait?: (event: TelemetryRateLimitEvent) => void;
}

/**
 * No-op telemetry. Used as the default when the host doesn't configure hooks.
 * Defined here (instead of `?? {}` inline) so the JIT can devirtualize the
 * empty path.
 */
export const noopTelemetry: Required<TelemetryHooks> = {
  onRequest: () => {},
  onResponse: () => {},
  onRetry: () => {},
  onRateLimitWait: () => {},
};

/**
 * Generate a request id without depending on `crypto.randomUUID()`. Edge
 * runtimes have it, but Node 18- on Lambda doesn't.
 */
export function generateRequestId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  // Fallback — 16 bytes of Math.random hex.
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return id;
}
