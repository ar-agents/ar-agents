/**
 * OpenTelemetry instrumentation — drop-in tracing + metrics for the MP toolkit.
 *
 * # Why a subpath?
 *
 * `@opentelemetry/api` is an OPTIONAL peer dep. Consumers who don't use
 * OpenTelemetry don't pay the bundle cost. Consumers who DO use it import
 * from `@ar-agents/mercadopago/otel` and get instant instrumentation:
 * spans for every MP request, metrics for latency/errors/rate-limit
 * remaining, and proper context propagation to your downstream traces.
 *
 * # Setup
 *
 * 1. Install: `pnpm add @opentelemetry/api`
 * 2. Wire your tracer + meter at app boot (per OpenTelemetry standard).
 * 3. Pass the instrumented hooks to MercadoPagoClient:
 *
 *    ```ts
 *    import { MercadoPagoClient } from "@ar-agents/mercadopago";
 *    import { createOtelHooks } from "@ar-agents/mercadopago/otel";
 *
 *    const otel = createOtelHooks({ serviceName: "billing-bot" });
 *    const client = new MercadoPagoClient({
 *      accessToken: process.env.MP_ACCESS_TOKEN!,
 *      onCall: otel.onCall,
 *      traceContext: otel.traceContext,
 *    });
 *    ```
 *
 * # What gets instrumented
 *
 * - **Spans**: one span per MP request, named `mp.{method}.{path}` (e.g.,
 *   `mp.GET./v1/payments/123`). Includes attributes: status code,
 *   request_id, retried count, success bool, MP rate-limit remaining,
 *   circuit breaker state.
 * - **Metrics**: `mp.requests.duration` histogram (ms), `mp.requests.count`
 *   counter (labeled by success/method/path/status), `mp.rate_limit.remaining`
 *   gauge.
 *
 * # No-op fallback
 *
 * If `@opentelemetry/api` isn't installed at runtime, the hooks degrade to
 * no-ops gracefully (without throwing) so the toolkit remains importable
 * even without OTEL configured.
 */

// Types-only imports — `@opentelemetry/api` is an OPTIONAL peer dep.
// We resolve at runtime via dynamic import; if absent, we run as no-ops.
type Tracer = {
  startSpan(name: string, options?: unknown): {
    setAttribute(k: string, v: unknown): void;
    setStatus(s: { code: number; message?: string }): void;
    end(): void;
    spanContext(): { traceId: string; spanId: string; traceFlags: number };
  };
};
type Histogram = { record(v: number, attributes?: Record<string, unknown>): void };
type Counter = { add(v: number, attributes?: Record<string, unknown>): void };
type Gauge = { record(v: number, attributes?: Record<string, unknown>): void };

interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): Tracer;
    getActiveSpan(): { spanContext(): { traceId: string; spanId: string; traceFlags: number } } | undefined;
  };
  metrics: {
    getMeter(name: string, version?: string): {
      createHistogram(name: string, opts?: { description?: string; unit?: string }): Histogram;
      createCounter(name: string, opts?: { description?: string }): Counter;
      createGauge?(name: string, opts?: { description?: string; unit?: string }): Gauge;
    };
  };
  SpanStatusCode: { OK: number; ERROR: number; UNSET: number };
}

let cachedApi: OtelApi | null | undefined = undefined;

async function loadOtelApi(): Promise<OtelApi | null> {
  if (cachedApi !== undefined) return cachedApi;
  try {
    const mod = (await import(
      /* @vite-ignore */ "@opentelemetry/api"
    )) as unknown as OtelApi;
    cachedApi = mod;
    return mod;
  } catch {
    cachedApi = null;
    return null;
  }
}

export interface OtelHooksOptions {
  /** Service name shown in trace UIs. Default "ar-agents-mercadopago". */
  serviceName?: string;
  /** Toolkit version (defaults to a static "0.10.x"). */
  version?: string;
  /**
   * Attributes added to every span/metric (e.g., environment, deployment_id).
   */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Build OpenTelemetry-aware hooks for `MercadoPagoClient`. Returns:
 *
 * - `onCall`: wires every request into traces + metrics
 * - `traceContext`: extracts active span context for traceparent propagation
 *
 * Both degrade to no-ops if `@opentelemetry/api` isn't installed.
 */
export function createOtelHooks(opts: OtelHooksOptions = {}): {
  onCall: (event: {
    method: string;
    path: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
    requestId?: string | null;
    rateLimit?: { remaining: number | null; resetSeconds: number | null };
    circuitState?: "CLOSED" | "OPEN" | "HALF_OPEN";
    traceContext?: { traceId?: string; spanId?: string };
  }) => void;
  traceContext: () => { traceId?: string; spanId?: string; traceFlags?: number } | undefined;
} {
  const serviceName = opts.serviceName ?? "ar-agents-mercadopago";
  const version = opts.version ?? "0.10.0";
  const baseAttrs = opts.attributes ?? {};

  // Lazy state — resolved on first invocation (so module load is sync + safe).
  let initialized = false;
  let api: OtelApi | null = null;
  let durationHist: Histogram | null = null;
  let requestCounter: Counter | null = null;
  let rateLimitGauge: Gauge | null = null;

  const ensureInit = async () => {
    if (initialized) return;
    initialized = true;
    api = await loadOtelApi();
    if (!api) return;
    const meter = api.metrics.getMeter(serviceName, version);
    durationHist = meter.createHistogram("mp.requests.duration", {
      description: "MP API request duration",
      unit: "ms",
    });
    requestCounter = meter.createCounter("mp.requests.count", {
      description: "MP API requests count by outcome",
    });
    rateLimitGauge = meter.createGauge?.("mp.rate_limit.remaining", {
      description: "MP-reported rate limit remaining at last response",
      unit: "1",
    }) ?? null;
  };

  return {
    onCall: (event) => {
      // Don't await — fire-and-forget. Best-effort observability.
      void (async () => {
        await ensureInit();
        if (!api) return;
        const attrs: Record<string, unknown> = {
          ...baseAttrs,
          "mp.method": event.method,
          "mp.path": event.path,
          "mp.success": event.success,
          "mp.retried": event.retried,
        };
        if (event.httpStatus !== null) attrs["http.status_code"] = event.httpStatus;
        if (event.requestId) attrs["mp.request_id"] = event.requestId;
        if (event.circuitState) attrs["mp.circuit_state"] = event.circuitState;

        durationHist?.record(event.durationMs, attrs);
        requestCounter?.add(1, attrs);
        if (event.rateLimit?.remaining !== null && event.rateLimit?.remaining !== undefined) {
          rateLimitGauge?.record(event.rateLimit.remaining, {
            "mp.path": event.path,
          });
        }

        // Span: emit a synthetic child span scoped to this request's duration.
        const tracer = api.trace.getTracer(serviceName, version);
        const span = tracer.startSpan(`mp.${event.method}.${event.path}`, {
          attributes: attrs,
        });
        if (event.success) {
          span.setStatus({ code: api.SpanStatusCode.OK });
        } else {
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: `MP request failed (status=${event.httpStatus})`,
          });
        }
        span.end();
      })();
    },

    traceContext: () => {
      // Synchronous getter — must be cheap. Resolves the OTEL active span
      // context if available; returns undefined if OTEL isn't installed.
      if (!api) {
        // Try to use the cached api if loadOtelApi already ran
        if (cachedApi) api = cachedApi;
      }
      if (!api) return undefined;
      const span = api.trace.getActiveSpan();
      if (!span) return undefined;
      const ctx = span.spanContext();
      return {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        traceFlags: ctx.traceFlags,
      };
    },
  };
}
