/**
 * Circuit breaker — protects your app from cascading failures when MP
 * (or any upstream) is degraded.
 *
 * # Why
 *
 * When MP's API has an outage, naive retry-with-backoff still pounds the
 * dead service N times per request × every concurrent request. That makes
 * MP's outage worse AND your app's error rate worse (each request burns
 * `requestTimeoutMs × maxRetries` ms of CPU/event-loop time before failing).
 *
 * A circuit breaker observes failures over a rolling window. After enough
 * failures it OPENS — subsequent calls fail fast (no network round-trip)
 * with a `CircuitOpenError`. After a cooldown it HALF-OPENs — lets one
 * trial through. If that succeeds, it CLOSES (back to normal). If it
 * fails, it RE-OPENs for another cooldown.
 *
 * # State machine
 *
 *  CLOSED ──(failures ≥ threshold)──▶ OPEN
 *    ▲                                  │
 *    │                                  │ (cooldown elapsed)
 *    │                                  ▼
 *    │                              HALF_OPEN
 *    │                                  │
 *    └──(trial succeeds)────────────────┤
 *                                       │ (trial fails)
 *                                       ▼
 *                                     OPEN
 *
 * # When to use
 *
 * - **Protects YOUR app** from being slow/dead when MP is slow/dead.
 * - **Protects MP** from your app pummeling it during incidents.
 * - **Surfaces a clear signal to ops**: `circuit_open` event tells you
 *   "MP is broken, my app is intentionally short-circuiting" — different
 *   from "MP timed out 30s × 3 retries × 1000 concurrent users".
 *
 * # When NOT to use
 *
 * - For idempotent reads where stale-cached data is acceptable, prefer
 *   a cache-aside pattern instead.
 * - For fire-and-forget webhooks where the backpressure should propagate
 *   to MP itself (return 5xx, MP retries with backoff).
 *
 * # Configuration
 *
 * Defaults are tuned for typical MP traffic patterns:
 * - `failureThreshold: 5` — open after 5 consecutive failures
 * - `successThreshold: 2` — close after 2 trial successes (half-open)
 * - `resetTimeoutMs: 30_000` — 30s cooldown before half-open trial
 * - `monitoringWindowMs: 60_000` — count failures within a 60s window
 *
 * # Per-host vs global
 *
 * The default `MercadoPagoClient` uses ONE breaker per client instance
 * (which means one per upstream host: `api.mercadopago.com` for prod,
 * `api.mercadopago.com` sandbox for TEST). For multi-host setups (e.g.,
 * marketplace flows with per-seller clients), instantiate a SHARED breaker
 * and pass it to all clients — they all benefit from the same backpressure
 * signal.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Open the breaker after this many consecutive failures. Default 5. */
  failureThreshold?: number;
  /** Close the breaker after this many successive successes in HALF_OPEN. Default 2. */
  successThreshold?: number;
  /** Time to stay OPEN before allowing a HALF_OPEN trial. Default 30s. */
  resetTimeoutMs?: number;
  /** Rolling window for counting failures. Failures older than this don't count. Default 60s. */
  monitoringWindowMs?: number;
  /**
   * Called on EVERY state transition. Useful for emitting metrics/logs.
   * `cause` is the error that triggered the transition (when applicable).
   */
  onStateChange?: (event: {
    from: CircuitState;
    to: CircuitState;
    cause?: unknown;
    consecutiveFailures: number;
  }) => void;
  /**
   * Predicate to decide whether an error should count as a circuit failure.
   * By default, all errors count. Override to ignore expected business
   * errors (e.g., 404s, validation errors) — they shouldn't open the breaker.
   */
  isFailure?: (error: unknown) => boolean;
  /** Time provider (for tests). Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Thrown when a circuit breaker is OPEN and rejects a call without trying.
 * Catch this separately from MercadoPagoError to differentiate "MP said no"
 * from "we didn't even ask MP".
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    public readonly consecutiveFailures: number,
  ) {
    super(
      `Circuit breaker is OPEN — failing fast. Retry in ${Math.ceil(
        retryAfterMs / 1000,
      )}s. Consecutive upstream failures: ${consecutiveFailures}.`,
    );
    this.name = "CircuitOpenError";
  }
}

/**
 * Thread-safe circuit breaker. Single-instance per upstream (typically per
 * `MercadoPagoClient`). Pass to multiple clients to share state.
 *
 * @example
 * ```ts
 * import { CircuitBreaker, MercadoPagoClient } from "@ar-agents/mercadopago";
 *
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30_000,
 *   onStateChange: (e) => metrics.increment(`circuit.${e.to}`),
 * });
 *
 * const client = new MercadoPagoClient({
 *   accessToken: process.env.MP_ACCESS_TOKEN!,
 *   circuitBreaker: breaker,
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private openedAt = 0;
  /** Timestamps of failures within the monitoring window. */
  private failureWindow: number[] = [];

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly monitoringWindowMs: number;
  private readonly onStateChange: NonNullable<
    CircuitBreakerOptions["onStateChange"]
  > | null;
  private readonly isFailureFn: (error: unknown) => boolean;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.successThreshold = opts.successThreshold ?? 2;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.monitoringWindowMs = opts.monitoringWindowMs ?? 60_000;
    this.onStateChange = opts.onStateChange ?? null;
    this.isFailureFn = opts.isFailure ?? (() => true);
    this.now = opts.now ?? Date.now;
  }

  /** Read the current state. Useful for health checks + metrics. */
  getState(): CircuitState {
    // Auto-transition OPEN → HALF_OPEN if cooldown elapsed.
    if (this.state === "OPEN" && this.now() - this.openedAt >= this.resetTimeoutMs) {
      this.transitionTo("HALF_OPEN");
    }
    return this.state;
  }

  /** Read diagnostic state for health checks + dashboards. */
  getStats(): {
    state: CircuitState;
    consecutiveFailures: number;
    failuresInWindow: number;
    msSinceOpened: number | null;
    msUntilHalfOpen: number | null;
  } {
    const state = this.getState();
    const msSinceOpened =
      this.openedAt > 0 ? this.now() - this.openedAt : null;
    const msUntilHalfOpen =
      state === "OPEN" && msSinceOpened !== null
        ? Math.max(0, this.resetTimeoutMs - msSinceOpened)
        : null;
    return {
      state,
      consecutiveFailures: this.consecutiveFailures,
      failuresInWindow: this.failuresInCurrentWindow(),
      msSinceOpened,
      msUntilHalfOpen,
    };
  }

  /**
   * Execute `fn` under the breaker's protection.
   * - If the breaker is OPEN, throws `CircuitOpenError` immediately.
   * - If `fn` succeeds, may transition HALF_OPEN → CLOSED.
   * - If `fn` fails (and the error counts as a failure), records the
   *   failure; may transition CLOSED → OPEN or HALF_OPEN → OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === "OPEN") {
      const elapsed = this.now() - this.openedAt;
      throw new CircuitOpenError(
        Math.max(0, this.resetTimeoutMs - elapsed),
        this.consecutiveFailures,
      );
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (this.isFailureFn(err)) {
        this.recordFailure(err);
      }
      throw err;
    }
  }

  /** Manually force the breaker open. Useful for runbook / manual ops. */
  trip(reason?: unknown): void {
    if (this.state !== "OPEN") {
      this.transitionTo("OPEN", reason);
    }
  }

  /** Manually reset the breaker to CLOSED. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.failureWindow = [];
    if (this.state !== "CLOSED") {
      this.transitionTo("CLOSED");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === "HALF_OPEN") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.transitionTo("CLOSED");
      }
    }
  }

  private recordFailure(cause: unknown): void {
    this.consecutiveFailures++;
    this.failureWindow.push(this.now());
    this.pruneWindow();

    if (this.state === "HALF_OPEN") {
      // Single failure during trial → re-open.
      this.transitionTo("OPEN", cause);
      return;
    }
    if (
      this.state === "CLOSED" &&
      this.failuresInCurrentWindow() >= this.failureThreshold
    ) {
      this.transitionTo("OPEN", cause);
    }
  }

  private transitionTo(to: CircuitState, cause?: unknown): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    if (to === "OPEN") {
      this.openedAt = this.now();
      this.halfOpenSuccesses = 0;
    } else if (to === "CLOSED") {
      this.consecutiveFailures = 0;
      this.halfOpenSuccesses = 0;
      this.failureWindow = [];
      this.openedAt = 0;
    } else if (to === "HALF_OPEN") {
      this.halfOpenSuccesses = 0;
    }
    this.onStateChange?.({
      from,
      to,
      cause,
      consecutiveFailures: this.consecutiveFailures,
    });
  }

  private pruneWindow(): void {
    const cutoff = this.now() - this.monitoringWindowMs;
    while (this.failureWindow.length > 0 && this.failureWindow[0]! < cutoff) {
      this.failureWindow.shift();
    }
  }

  private failuresInCurrentWindow(): number {
    this.pruneWindow();
    return this.failureWindow.length;
  }
}
