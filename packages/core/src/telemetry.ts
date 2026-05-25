/**
 * Telemetry hook contract.
 *
 * A single `TelemetryHook` interface that every middleware in this
 * package speaks. Plug in an OpenTelemetry adapter, a Datadog
 * shipper, a console logger, or your own — the middleware doesn't
 * care.
 *
 * # Why we don't depend on `@opentelemetry/api` directly
 *
 * @opentelemetry/api is heavy (≈30KB), version-volatile, and not
 * everyone uses OTel. By staying behind a tiny interface we let the
 * consumer choose their observability stack without pulling code we
 * don't need.
 *
 * # Convention
 *
 * Each tool invocation produces one ToolEvent. Fields:
 *   - name      tool name (e.g. "uala_create_payment_link")
 *   - durationMs latency from `execute` start to settle
 *   - ok        whether `execute` resolved (true) or threw (false)
 *   - errorCode iff ok=false and the error is an ArAgentsError
 *   - attrs     free-form structured attributes (avoid PII)
 */

export interface ToolEvent {
  name: string;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
  errorRetryable?: boolean;
  attrs?: Record<string, string | number | boolean>;
}

export interface TelemetryHook {
  onToolEvent(event: ToolEvent): void;
}

/**
 * A no-op hook. Use as a default so middleware never crashes when no
 * hook was wired.
 */
export const noopTelemetryHook: TelemetryHook = {
  onToolEvent() {
    /* intentionally empty */
  },
};

/**
 * Combine multiple hooks into one. Each event is delivered to all
 * hooks in order; a throwing hook does NOT block the others — its
 * exception is swallowed (observability must never crash the request).
 */
export function combineHooks(...hooks: TelemetryHook[]): TelemetryHook {
  if (hooks.length === 0) return noopTelemetryHook;
  if (hooks.length === 1) return hooks[0]!;
  return {
    onToolEvent(event) {
      for (const h of hooks) {
        try {
          h.onToolEvent(event);
        } catch {
          // Swallow — observability hooks must never crash the app.
        }
      }
    },
  };
}

/**
 * A console-backed hook. Useful for local dev + CI. Emits JSON lines
 * to stdout so log shippers can pick them up.
 */
export function consoleTelemetryHook(
  opts: { prefix?: string } = {},
): TelemetryHook {
  const prefix = opts.prefix ?? "[ar-agents]";
  return {
    onToolEvent(event) {
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${JSON.stringify(event)}`);
    },
  };
}
