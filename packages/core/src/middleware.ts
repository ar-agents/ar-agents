/**
 * Tool middleware — composable wrappers around Vercel AI SDK 6 tools.
 *
 * Every middleware is a `Tool → Tool` function. They wrap the
 * `execute` callback (the network/IO/state-mutating part) with a
 * cross-cutting concern (metrics, retry, timeout, HITL gate) WITHOUT
 * modifying the tool's input schema, description, or output type.
 *
 * # Composition order
 *
 * Middleware applies innermost-first when called via `compose()`:
 *
 *   compose(A, B, C)(tool) ≡ A(B(C(tool)))
 *
 * Execution order at runtime is THE OPPOSITE (outermost first):
 *   request → A → B → C → tool.execute → C → B → A → response
 *
 * Recommended ordering (outermost first):
 *   withApproval   — gate the call BEFORE we burn time on it
 *   withRetry      — surround the real work
 *   withTimeout    — cap the real work
 *   withMetrics    — closest to execute, sees the real timing
 */

import type { Tool } from "ai";
import {
  ArAgentsError,
  ArAgentsRateLimitError,
  isArAgentsError,
} from "./errors";
import type { TelemetryHook } from "./telemetry";
import { noopTelemetryHook } from "./telemetry";

// Matches the AI SDK's heterogeneous ToolSet: a record of tools with differing
// input/output generics. `Tool<unknown, unknown>` rejects them because a tool's
// `needsApproval` is contravariant in its input type, so a strongly-typed tool
// (e.g. Tool<{ text: string }>) is not assignable to Tool<unknown>. `any` is the
// SDK's own choice for a tool of unknown shape; the middleware only wraps
// `execute` and never reads the input/output types, so this is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;
export type ToolMiddleware = <T extends AnyTool>(tool: T) => T;

/**
 * Combine multiple middleware into one. Innermost-first composition:
 *
 *   compose(A, B, C)(tool) ≡ A(B(C(tool)))
 *
 * At call time the runtime order is reversed: A wraps B wraps C wraps tool.
 */
export function compose(...middlewares: ToolMiddleware[]): ToolMiddleware {
  if (middlewares.length === 0) return (t) => t;
  return <T extends AnyTool>(tool: T): T =>
    middlewares.reduceRight<T>((acc, mw) => mw(acc), tool);
}

/**
 * Apply one middleware (or composition) to every tool in a record
 * (the shape Vercel AI SDK 6 expects for the `tools` option). Each
 * tool gets the same middleware stack; tool name is passed to the
 * underlying middleware via the closure so middleware can label its
 * telemetry by the tool name.
 *
 *   const wrapped = applyToAllTools(tools, (name) =>
 *     compose(withMetrics(name, { telemetry }), withTimeout(name, 10_000)),
 *   );
 */
export function applyToAllTools<T extends Record<string, AnyTool>>(
  tools: T,
  middlewareForName: (name: string) => ToolMiddleware,
): T {
  const out: Record<string, AnyTool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    out[name] = middlewareForName(name)(tool);
  }
  return out as T;
}

// ── withMetrics ────────────────────────────────────────────────

export interface WithMetricsOptions {
  telemetry?: TelemetryHook;
  /** Static attributes attached to every event. */
  attrs?: Record<string, string | number | boolean>;
}

/**
 * Emit one ToolEvent per invocation to the configured telemetry hook.
 * Captures latency + success/error + ArAgentsError code & retryable
 * fields when available.
 */
export function withMetrics(
  toolName: string,
  opts: WithMetricsOptions = {},
): ToolMiddleware {
  const hook = opts.telemetry ?? noopTelemetryHook;
  const staticAttrs = opts.attrs ?? {};
  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        const start = Date.now();
        let ok = false;
        let errorCode: string | undefined;
        let errorRetryable: boolean | undefined;
        try {
          const r = await original(args, ctx);
          ok = true;
          return r;
        } catch (err) {
          if (isArAgentsError(err)) {
            errorCode = err.code;
            errorRetryable = err.retryable;
          }
          throw err;
        } finally {
          try {
            const ev: import("./telemetry").ToolEvent = {
              name: toolName,
              durationMs: Date.now() - start,
              ok,
              attrs: staticAttrs,
              ...(errorCode !== undefined ? { errorCode } : {}),
              ...(errorRetryable !== undefined ? { errorRetryable } : {}),
            };
            hook.onToolEvent(ev);
          } catch {
            // Observability never crashes the request.
          }
        }
      },
    } as T;
    return wrapped;
  };
}

// ── withTimeout ────────────────────────────────────────────────

/**
 * Cap execute() at `timeoutMs`. On timeout, throws an
 * ArAgentsProtocolError(retryable=true). The middleware does NOT
 * cancel underlying network requests (no AbortController is plumbed
 * through here — that's tool-internal); it merely returns control
 * promptly so the caller's response budget is honored.
 */
export function withTimeout(toolName: string, timeoutMs: number): ToolMiddleware {
  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            original(args, ctx),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(
                  new ArAgentsError(
                    `Tool "${toolName}" timed out after ${timeoutMs}ms`,
                    {
                      code: "timeout",
                      retryable: true,
                      context: { toolName, timeoutMs },
                    },
                  ),
                );
              }, timeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
    } as T;
    return wrapped;
  };
}

// ── withRetry ──────────────────────────────────────────────────

export interface WithRetryOptions {
  /** Max attempts INCLUDING the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms (exponential). Default 250. */
  baseMs?: number;
  /** Max backoff in ms. Default 5_000. */
  maxMs?: number;
  /** Predicate that decides whether THIS error is retryable. Default:
   * `ArAgentsError.retryable === true`. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Jitter ratio (0..1). Default 0.2. */
  jitter?: number;
}

/**
 * Retry transient failures (network blips, rate-limits, 5xx) with
 * exponential backoff + jitter. Bails immediately on non-retryable
 * errors (e.g. validation, auth).
 *
 * For ArAgentsRateLimitError, honors the error's `retryAfterMs` over
 * the computed backoff so the caller respects server signals.
 */
export function withRetry(opts: WithRetryOptions = {}): ToolMiddleware {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 5_000;
  const jitter = opts.jitter ?? 0.2;
  const shouldRetry =
    opts.shouldRetry ?? ((err) => isArAgentsError(err) && err.retryable);

  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await original(args, ctx);
          } catch (err) {
            lastErr = err;
            if (attempt === maxAttempts || !shouldRetry(err, attempt)) {
              throw err;
            }
            const waitMs =
              err instanceof ArAgentsRateLimitError
                ? err.retryAfterMs
                : Math.min(
                    maxMs,
                    baseMs * Math.pow(2, attempt - 1) * (1 + (Math.random() - 0.5) * 2 * jitter),
                  );
            await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
          }
        }
        // Unreachable — the for loop always returns or throws.
        throw lastErr;
      },
    } as T;
    return wrapped;
  };
}

// ── withApproval (HITL gate) ───────────────────────────────────

export interface WithApprovalOptions {
  /**
   * Called BEFORE execute. Return true to proceed, false (or throw)
   * to refuse. This is the real runtime enforcement of the
   * `requiresConfirmation` flag in tools.manifest.json (which is
   * merely a hint to clients).
   */
  approve: (
    toolName: string,
    args: unknown,
  ) => Promise<boolean> | boolean;
  /** Optional reason emitted in the error when refused. */
  refusedMessage?: string;
}

/**
 * Human-in-the-loop gate. Use on side-effectful tools (money moves,
 * tax returns, irreversible writes). The `approve` callback is the
 * host's hook to ask the user / call a policy engine / consult an
 * allowlist.
 */
export function withApproval(
  toolName: string,
  opts: WithApprovalOptions,
): ToolMiddleware {
  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let approved = false;
        try {
          approved = await opts.approve(toolName, args);
        } catch (err) {
          throw new ArAgentsError(
            opts.refusedMessage ??
              `HITL approval threw for tool "${toolName}".`,
            {
              code: "approval_error",
              retryable: false,
              context: { toolName },
              cause: err,
            },
          );
        }
        if (!approved) {
          throw new ArAgentsError(
            opts.refusedMessage ??
              `HITL approval denied for tool "${toolName}".`,
            {
              code: "approval_denied",
              retryable: false,
              context: { toolName },
            },
          );
        }
        return original(args, ctx);
      },
    } as T;
    return wrapped;
  };
}

// ── withHalt (kill-switch) ─────────────────────────────────────

export interface WithHaltOptions {
  /**
   * Called BEFORE execute. Return true if the society is suspended, so the tool
   * must refuse. Unlike withApproval (which only gates high-stakes acts), the
   * kill-switch halts EVERY operation, regardless of risk level, while the
   * society is suspended.
   */
  isHalted: (toolName: string, args: unknown) => Promise<boolean> | boolean;
  /** Optional reason emitted in the error when halted. */
  haltedMessage?: string;
}

/**
 * Kill-switch. When `isHalted` returns true the tool refuses before doing
 * anything. This is the operational form of the art. 102 supervision duty: a
 * human administrator (or supervisor) can suspend a Sociedad Automatizada and
 * every one of its tools stops, enforced centrally rather than trusted to each
 * agent. FAILS CLOSED: if the halt state cannot be read, the tool refuses (a
 * kill-switch we cannot consult must never silently let the society act).
 */
export function withHalt(toolName: string, opts: WithHaltOptions): ToolMiddleware {
  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let halted = false;
        try {
          halted = await opts.isHalted(toolName, args);
        } catch (err) {
          throw new ArAgentsError(
            opts.haltedMessage ??
              `Halt check failed for tool "${toolName}"; refusing (fail closed).`,
            { code: "halt_check_error", retryable: false, context: { toolName }, cause: err },
          );
        }
        if (halted) {
          throw new ArAgentsError(
            opts.haltedMessage ??
              `Society is suspended (kill-switch); tool "${toolName}" refused.`,
            { code: "society_suspended", retryable: false, context: { toolName } },
          );
        }
        return original(args, ctx);
      },
    } as T;
    return wrapped;
  };
}
