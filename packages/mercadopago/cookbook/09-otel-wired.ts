/**
 * Recipe 09 — OpenTelemetry wired end-to-end.
 *
 * # Pattern
 *
 * 1. Wire an OTel SDK at app boot (NodeSDK or Edge equivalent)
 * 2. Build the MP client with `traceContext` so each MP request injects a
 *    W3C `traceparent` header (correlates with your distributed traces)
 * 3. Wrap the client / tools with the OTel instrumentation from
 *    `@ar-agents/mercadopago/otel` to get spans + metrics for every call:
 *    - `mp.request` span per MP API call (with attrs for endpoint, method,
 *      status, duration, retry count)
 *    - `mp.tool` span per agent-invoked tool (with input + output attrs)
 *    - Metrics: latency p50/p95/p99, error rate, rate-limit-remaining
 * 4. Ship traces + metrics to your OTel collector (Honeycomb, Datadog,
 *    New Relic, Grafana Tempo, ...)
 *
 * # Why this matters
 *
 * MP's API is the slow path of any agent that uses it (200-600ms per call).
 * Without observability you can't tell:
 *   - Which tool calls are slow (`create_payment` vs `create_subscription` vs `get_payment`)
 *   - When MP is degraded (rate-limit-remaining trending down before failures)
 *   - Where retries kick in (so you can size your timeout budget correctly)
 *
 * # Setup (one-time at app boot)
 *
 * ```ts
 * // instrumentation.ts (Vercel auto-loads this if present)
 * import { NodeSDK } from "@opentelemetry/sdk-node";
 * import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
 * import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
 * import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
 *
 * const sdk = new NodeSDK({
 *   serviceName: "my-ar-agent",
 *   traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT! }),
 *   metricReader: new PeriodicExportingMetricReader({
 *     exporter: new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT! }),
 *     exportIntervalMillis: 30_000,
 *   }),
 * });
 * sdk.start();
 * ```
 *
 * # Edge Runtime
 *
 * Edge-compatible. Use `@vercel/otel` instead of `@opentelemetry/sdk-node`.
 * The instrumentation in `@ar-agents/mercadopago/otel` is runtime-agnostic
 * (uses the `@opentelemetry/api` interface, no Node-only deps).
 */

import { trace, context as otelContext } from "@opentelemetry/api";
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
  CircuitBreaker,
} from "@ar-agents/mercadopago";
import {
  instrumentMercadoPagoClient,
  instrumentMercadoPagoTools,
} from "@ar-agents/mercadopago/otel";

const tracer = trace.getTracer("my-ar-agent");
const meter = trace.getTracer("my-ar-agent"); // simplified — use `metrics.getMeter` in real code

// 1. Build the client with traceContext so each MP request injects traceparent.
//    The function returns whatever active OTel context exists at call time.
const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  // Wire OTel context propagation. MP logs will be correlated with your trace
  // graph, and downstream tooling (Datadog APM, Honeycomb) can join the dots.
  traceContext: () => {
    const span = trace.getActiveSpan();
    if (!span) return undefined;
    const ctx = span.spanContext();
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      traceFlags: ctx.traceFlags,
    };
  },
  // Production hardening — circuit breaker observed by OTel as well.
  circuitBreaker: new CircuitBreaker({
    failureThreshold: 5,
    rollingWindowMs: 60_000,
    cooldownMs: 30_000,
  }),
  maxRetries: 2,
});

// 2. Instrument the client. Wraps every public method with a span + metric.
const instrumentedMp = instrumentMercadoPagoClient(mp, { tracer, meter });

// 3. Build tools as usual, then wrap with OTel tool instrumentation.
const baseTools = mercadoPagoTools(instrumentedMp, {
  state: new InMemoryStateAdapter(),
  backUrl: "https://example.com/done",
});
const tools = instrumentMercadoPagoTools(baseTools, { tracer });

// 4. Use the agent. Every tool call becomes a span; every MP request is a
//    nested span with full request context. Open Honeycomb / Tempo and you
//    see the full picture.
export const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: "You are a billing assistant for a SaaS in Argentina.",
  tools,
  stopWhen: stepCountIs(8),
});

/**
 * Trace shape (in your APM):
 *
 *   tool: agent.generate                            (root span)
 *   ├── tool: create_payment_preference (mp.tool)
 *   │   └── http: POST /checkout/preferences (mp.request)
 *   │       attrs:
 *   │         mp.method = POST
 *   │         mp.path   = /checkout/preferences
 *   │         mp.status = 201
 *   │         mp.duration_ms = 287
 *   │         mp.retried = false
 *   │         mp.idempotency_key = <uuid>
 *   │
 *   └── tool: get_payment (mp.tool)
 *       └── http: GET /v1/payments/9999 (mp.request)
 *           attrs:
 *             mp.method = GET
 *             mp.duration_ms = 142
 *
 * Metrics emitted (with attributes [endpoint, method, status_class]):
 *
 *   mp_request_duration_ms (histogram)
 *   mp_request_total (counter)
 *   mp_request_error_total (counter, by status_class=4xx|5xx|network)
 *   mp_circuit_breaker_state (gauge: closed=0, open=1, half_open=0.5)
 *   mp_rate_limit_remaining (gauge, from x-ratelimit-remaining response header)
 */

// Example: wrap a request handler with a parent span so MP calls join the trace.
export async function handleAgentRequest(userMessage: string) {
  return tracer.startActiveSpan("agent.request", async (span) => {
    try {
      const result = await agent.generate({ prompt: userMessage });
      span.setAttribute("agent.steps", result.steps.length);
      span.setAttribute("agent.finish_reason", result.finishReason);
      return result;
    } finally {
      span.end();
    }
  });
}
