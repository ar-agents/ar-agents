import { describe, expect, it, vi } from "vitest";
import {
  ArAgentsError,
  ArAgentsRateLimitError,
  ArAgentsValidationError,
  combineHooks,
  compose,
  consoleTelemetryHook,
  isArAgentsError,
  noopTelemetryHook,
  withApproval,
  withMetrics,
  withRetry,
  withTimeout,
  applyToAllTools,
  type TelemetryHook,
  type ToolEvent,
  type AnyTool,
} from "../src/index";

/**
 * Minimal Tool-shaped factories. We don't depend on `ai` at test time
 * (the real Tool type carries extra metadata we don't exercise here).
 */
function mkTool(execute: (args: unknown, ctx: unknown) => unknown): AnyTool {
  return {
    description: "test tool",
    inputSchema: { _zod: true } as unknown,
    execute,
  } as unknown as AnyTool;
}

function captureHook(): { hook: TelemetryHook; events: ToolEvent[] } {
  const events: ToolEvent[] = [];
  return {
    events,
    hook: { onToolEvent: (e) => events.push(e) },
  };
}

describe("errors", () => {
  it("ArAgentsError carries code + retryable + context", () => {
    const e = new ArAgentsError("nope", {
      code: "x",
      retryable: true,
      context: { a: 1 },
    });
    expect(e.code).toBe("x");
    expect(e.retryable).toBe(true);
    expect(e.context).toEqual({ a: 1 });
  });

  it("ArAgentsValidationError attaches field + non-retryable", () => {
    const e = new ArAgentsValidationError("cuit", "bad shape");
    expect(e.field).toBe("cuit");
    expect(e.code).toBe("validation_failed");
    expect(e.retryable).toBe(false);
    expect(e.context.field).toBe("cuit");
  });

  it("ArAgentsRateLimitError carries retryAfterMs + is retryable", () => {
    const e = new ArAgentsRateLimitError(1500);
    expect(e.retryAfterMs).toBe(1500);
    expect(e.retryable).toBe(true);
    expect(e.code).toBe("rate_limited");
  });

  it("isArAgentsError type guard", () => {
    expect(isArAgentsError(new Error("plain"))).toBe(false);
    expect(isArAgentsError(new ArAgentsError("x", { code: "y" }))).toBe(true);
    expect(isArAgentsError("nope")).toBe(false);
    expect(isArAgentsError(null)).toBe(false);
  });
});

describe("telemetry", () => {
  it("noopTelemetryHook never throws", () => {
    expect(() =>
      noopTelemetryHook.onToolEvent({ name: "x", durationMs: 1, ok: true }),
    ).not.toThrow();
  });

  it("combineHooks delivers events to all hooks", () => {
    const a = captureHook();
    const b = captureHook();
    const combined = combineHooks(a.hook, b.hook);
    combined.onToolEvent({ name: "t", durationMs: 5, ok: true });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
  });

  it("combineHooks: a throwing hook does not stop others", () => {
    const ok = captureHook();
    const bad: TelemetryHook = {
      onToolEvent: () => {
        throw new Error("boom");
      },
    };
    const combined = combineHooks(bad, ok.hook);
    expect(() =>
      combined.onToolEvent({ name: "t", durationMs: 5, ok: true }),
    ).not.toThrow();
    expect(ok.events).toHaveLength(1);
  });

  it("consoleTelemetryHook emits JSON lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const h = consoleTelemetryHook({ prefix: "[test]" });
    h.onToolEvent({ name: "t", durationMs: 5, ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = String(spy.mock.calls[0]?.[0] ?? "");
    expect(arg).toContain("[test]");
    expect(arg).toContain('"name":"t"');
    spy.mockRestore();
  });
});

describe("withMetrics", () => {
  it("emits an OK event on success", async () => {
    const cap = captureHook();
    const tool = mkTool(() => 42);
    const wrapped = withMetrics("t", { telemetry: cap.hook })(tool);
    const r = await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(r).toBe(42);
    expect(cap.events).toHaveLength(1);
    expect(cap.events[0]?.ok).toBe(true);
    expect(cap.events[0]?.name).toBe("t");
  });

  it("emits a non-OK event and rethrows on error", async () => {
    const cap = captureHook();
    const tool = mkTool(() => {
      throw new ArAgentsError("nope", { code: "x", retryable: true });
    });
    const wrapped = withMetrics("t", { telemetry: cap.hook })(tool);
    await expect(
      (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {}),
    ).rejects.toThrow();
    expect(cap.events).toHaveLength(1);
    expect(cap.events[0]?.ok).toBe(false);
    expect(cap.events[0]?.errorCode).toBe("x");
    expect(cap.events[0]?.errorRetryable).toBe(true);
  });

  it("passes through tools without an `execute` function", () => {
    const tool = { description: "x", inputSchema: {} } as unknown as AnyTool;
    const wrapped = withMetrics("t")(tool);
    expect(wrapped).toBe(tool);
  });
});

describe("withTimeout", () => {
  it("returns the value when execute finishes in time", async () => {
    const tool = mkTool(() => "ok");
    const wrapped = withTimeout("t", 100)(tool);
    const r = await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(r).toBe("ok");
  });

  it("rejects with a retryable ArAgentsError on timeout", async () => {
    const tool = mkTool(() => new Promise(() => {}));
    const wrapped = withTimeout("t", 30)(tool);
    try {
      await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(isArAgentsError(err)).toBe(true);
      if (isArAgentsError(err)) {
        expect(err.code).toBe("timeout");
        expect(err.retryable).toBe(true);
      }
    }
  });
});

describe("withRetry", () => {
  it("succeeds on first attempt — no retry", async () => {
    const spy = vi.fn(() => 1);
    const wrapped = withRetry({ maxAttempts: 3, baseMs: 1 })(mkTool(spy));
    await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors up to maxAttempts", async () => {
    let attempts = 0;
    const tool = mkTool(() => {
      attempts++;
      if (attempts < 3) {
        throw new ArAgentsError("transient", { code: "x", retryable: true });
      }
      return "ok";
    });
    const wrapped = withRetry({ maxAttempts: 5, baseMs: 1, maxMs: 5 })(tool);
    const r = await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(r).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does NOT retry non-retryable errors", async () => {
    let attempts = 0;
    const tool = mkTool(() => {
      attempts++;
      throw new ArAgentsValidationError("x", "bad");
    });
    const wrapped = withRetry({ maxAttempts: 5, baseMs: 1 })(tool);
    await expect(
      (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {}),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("honors retryAfterMs on ArAgentsRateLimitError", async () => {
    let attempts = 0;
    const tool = mkTool(() => {
      attempts++;
      if (attempts < 2) throw new ArAgentsRateLimitError(2);
      return "ok";
    });
    const wrapped = withRetry({ maxAttempts: 3, baseMs: 1000 })(tool);
    const start = Date.now();
    await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    const elapsed = Date.now() - start;
    // We should sleep ~2ms (the retryAfter), NOT 1000ms (the baseMs).
    expect(elapsed).toBeLessThan(200);
  });
});

describe("withApproval", () => {
  it("proceeds when approve() returns true", async () => {
    const tool = mkTool(() => "ok");
    const wrapped = withApproval("t", { approve: () => true })(tool);
    const r = await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(r).toBe("ok");
  });

  it("refuses with approval_denied code when approve() returns false", async () => {
    const tool = mkTool(() => "ok");
    const wrapped = withApproval("t", { approve: () => false })(tool);
    try {
      await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(isArAgentsError(err)).toBe(true);
      if (isArAgentsError(err)) {
        expect(err.code).toBe("approval_denied");
        expect(err.retryable).toBe(false);
      }
    }
  });

  it("translates approve() throws into approval_error", async () => {
    const tool = mkTool(() => "ok");
    const wrapped = withApproval("t", {
      approve: () => {
        throw new Error("policy engine down");
      },
    })(tool);
    try {
      await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
      expect.fail("should have thrown");
    } catch (err) {
      if (isArAgentsError(err)) {
        expect(err.code).toBe("approval_error");
      } else {
        expect.fail("expected ArAgentsError");
      }
    }
  });
});

describe("compose + applyToAllTools", () => {
  it("compose applies innermost-first", async () => {
    const order: string[] = [];
    const trace =
      (name: string): import("../src/index").ToolMiddleware =>
      (tool) => {
        const original = (tool as unknown as { execute: (a: unknown, c: unknown) => unknown }).execute;
        return {
          ...tool,
          execute: async (args: unknown, ctx: unknown) => {
            order.push(`before:${name}`);
            const r = await original(args, ctx);
            order.push(`after:${name}`);
            return r;
          },
        } as typeof tool;
      };
    const tool = mkTool(() => {
      order.push("execute");
      return "ok";
    });
    const wrapped = compose(trace("A"), trace("B"), trace("C"))(tool);
    await (wrapped.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(order).toEqual([
      "before:A",
      "before:B",
      "before:C",
      "execute",
      "after:C",
      "after:B",
      "after:A",
    ]);
  });

  it("applyToAllTools wraps each tool individually with its name", async () => {
    const cap = captureHook();
    const tools = {
      a: mkTool(() => 1),
      b: mkTool(() => 2),
    } as Record<string, AnyTool>;
    const wrapped = applyToAllTools(tools, (name) =>
      withMetrics(name, { telemetry: cap.hook }),
    );
    await (wrapped.a!.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    await (wrapped.b!.execute as (a: unknown, c: unknown) => Promise<unknown>)(undefined, {});
    expect(cap.events.map((e) => e.name).sort()).toEqual(["a", "b"]);
  });

  it("compose with zero middlewares is identity", () => {
    const tool = mkTool(() => "x");
    expect(compose()(tool)).toBe(tool);
  });
});
