/**
 * Tool middleware — composable wrappers around any Vercel AI SDK tool.
 *
 * # The pattern
 *
 * Vercel AI SDK tools have a uniform shape: `{ description, inputSchema, execute }`.
 * Middleware wraps a tool's `execute()` with cross-cutting concerns (logging,
 * rate limiting, retries, metrics) WITHOUT modifying the tool itself.
 *
 * Compose middleware to layer behaviors:
 *
 * ```ts
 * import { withAuditLog, withRateLimit, withMetrics, compose } from "@ar-agents/mercadopago";
 *
 * const baseTools = mercadoPagoTools(client, { state, backUrl });
 *
 * const tools = Object.fromEntries(
 *   Object.entries(baseTools).map(([name, tool]) => [
 *     name,
 *     compose(
 *       withMetrics(name, { onMetric: (m) => statsd.increment(...) }),
 *       withRateLimit(rateLimiter),
 *       withAuditLog(auditLogger, name),
 *     )(tool),
 *   ])
 * );
 * ```
 *
 * # Why this matters
 *
 * Without middleware, every cross-cutting concern (audit, rate limit, retry)
 * has to be wired INTO the tool implementation OR repeated at every call
 * site. Middleware lets you add/remove/swap concerns from a single config
 * point — clean separation of concerns + testable in isolation.
 */

import type { Tool } from "ai";
import type { AuditLogger, AuditOperation } from "./audit";
import type { TokenBucketRateLimiter } from "./rate-limiter";

/**
 * A tool middleware — takes a tool, returns a wrapped tool with the same
 * shape but enhanced behavior in `execute()`.
 */
export type ToolMiddleware = <T extends Tool<unknown, unknown>>(tool: T) => T;

/**
 * Compose multiple middleware functions. The LAST middleware in the list
 * runs INNERMOST (closest to the original tool's execute):
 *
 * ```
 * compose(a, b, c)(tool) == a(b(c(tool)))
 * ```
 *
 * Reasoning: the most "core" concerns (e.g. audit log) typically wrap the
 * actual call closely (innermost), while observability layers (e.g. metrics,
 * tracing) sit outside.
 *
 * @example
 * ```ts
 * const enhance = compose(
 *   withMetrics("create_payment"),       // outer (records duration of everything below)
 *   withRateLimit(limiter),              // middle (rate-limits before the call)
 *   withAuditLog(audit, "create_payment"), // inner (records the call result)
 * );
 * const enhanced = enhance(originalTool);
 * ```
 */
export function compose(...middlewares: ToolMiddleware[]): ToolMiddleware {
  return <T extends Tool<unknown, unknown>>(tool: T): T => {
    return middlewares.reduceRight((wrapped, mw) => mw(wrapped), tool);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// withAuditLog — wraps a tool's execute with AuditLogger.record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a tool's `execute()` with audit logging. Every call records an entry
 * with operation, actor, inputHash, outcome, and duration.
 *
 * @param logger The configured AuditLogger.
 * @param operation The operation name (matches AuditOperation union).
 * @param actor Optional actor override (defaults to logger's defaultActor).
 */
export function withAuditLog(
  logger: AuditLogger,
  operation: AuditOperation,
  actor?: string,
): ToolMiddleware {
  return <T extends Tool<unknown, unknown>>(tool: T): T => {
    const original = tool.execute;
    if (!original) return tool;
    return {
      ...tool,
      execute: (async (input: unknown, opts: unknown) => {
        return logger.record({
          operation,
          input,
          ...(actor !== undefined ? { actor } : {}),
          fn: () => original(input as never, opts as never) as Promise<unknown>,
        });
      }) as T["execute"],
    } as T;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// withRateLimit — acquires a token before invoking the underlying tool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a tool's `execute()` with rate limiting. Acquires a token from the
 * bucket BEFORE the call; if the bucket is empty, awaits up to the bucket's
 * `acquireTimeoutMs`. Throws `RateLimitTimeoutError` if the wait exceeds it.
 */
export function withRateLimit(limiter: TokenBucketRateLimiter): ToolMiddleware {
  return <T extends Tool<unknown, unknown>>(tool: T): T => {
    const original = tool.execute;
    if (!original) return tool;
    return {
      ...tool,
      execute: (async (input: unknown, opts: unknown) => {
        await limiter.acquire();
        return original(input as never, opts as never);
      }) as T["execute"],
    } as T;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// withMetrics — emits per-call metrics (duration, success/error count)
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricsHook {
  /**
   * Called after every tool invocation. Synchronous, fire-and-forget.
   * Compatible with Datadog, StatsD, Prometheus client, OTEL meter, etc.
   */
  onMetric: (event: {
    toolName: string;
    durationMs: number;
    success: boolean;
    errorCode?: string;
  }) => void;
}

/**
 * Wrap a tool's `execute()` with metrics emission. Records duration + a
 * success/error counter for every call.
 */
export function withMetrics(
  toolName: string,
  hook: MetricsHook,
): ToolMiddleware {
  return <T extends Tool<unknown, unknown>>(tool: T): T => {
    const original = tool.execute;
    if (!original) return tool;
    return {
      ...tool,
      execute: (async (input: unknown, opts: unknown) => {
        const t0 = Date.now();
        try {
          const result = await original(input as never, opts as never);
          hook.onMetric({
            toolName,
            durationMs: Date.now() - t0,
            success: true,
          });
          return result;
        } catch (err) {
          hook.onMetric({
            toolName,
            durationMs: Date.now() - t0,
            success: false,
            errorCode: extractErrorCode(err),
          });
          throw err;
        }
      }) as T["execute"],
    } as T;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// withRetry — retries the tool's execute on transient failures
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max attempts including initial. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms (multiplied by 2^attempt). Default 250. */
  baseBackoffMs?: number;
  /**
   * Predicate: should this error trigger a retry? Default: retries on
   * any thrown Error EXCEPT MercadoPagoError 4xx (those are user errors).
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional hook fired on every retry attempt. */
  onRetry?: (event: { attempt: number; error: unknown; delayMs: number }) => void;
}

const defaultShouldRetry = (err: unknown): boolean => {
  // If MercadoPagoError with 4xx → don't retry (user error)
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return false;
    }
  }
  return true;
};

/**
 * Wrap a tool's `execute()` with retry-with-backoff. Useful for tools that
 * call external APIs not protected by the underlying client's retry budget
 * (e.g., agent-side aggregation tools).
 *
 * The MercadoPagoClient already retries internally on 5xx/429, so layering
 * this on top of MP-backed tools usually means total retries = client × tool.
 * Use sparingly.
 */
export function withRetry(opts: RetryOptions = {}): ToolMiddleware {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseBackoff = opts.baseBackoffMs ?? 250;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  return <T extends Tool<unknown, unknown>>(tool: T): T => {
    const original = tool.execute;
    if (!original) return tool;
    return {
      ...tool,
      execute: (async (input: unknown, opts2: unknown) => {
        let attempt = 0;
        while (true) {
          try {
            return await original(input as never, opts2 as never);
          } catch (err) {
            attempt++;
            if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
              throw err;
            }
            const delayMs = baseBackoff * Math.pow(2, attempt - 1);
            opts.onRetry?.({ attempt, error: err, delayMs });
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }) as T["execute"],
    } as T;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk helper — apply middleware to ALL tools in a ToolSet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a middleware to every tool in a ToolSet. Useful for blanket policies:
 * "all tools rate-limited", "all tools metrics-emitted".
 *
 * @example
 * ```ts
 * const baseTools = mercadoPagoTools(client, { state, backUrl });
 * const limited = applyToAllTools(baseTools, withRateLimit(limiter));
 * ```
 */
export function applyToAllTools<T extends Record<string, Tool<unknown, unknown>>>(
  tools: T,
  middleware: ToolMiddleware,
): T {
  const out: Record<string, Tool<unknown, unknown>> = {};
  for (const [name, tool] of Object.entries(tools)) {
    out[name] = middleware(tool);
  }
  return out as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

function extractErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; name?: string };
    return e.code ?? e.name ?? "unknown_error";
  }
  return "unknown_error";
}
