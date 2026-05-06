import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  applyToAllTools,
  AuditLogger,
  compose,
  InMemoryAuditLog,
  TokenBucketRateLimiter,
  withAuditLog,
  withMetrics,
  withRateLimit,
  withRetry,
} from "../src";

// Helper: build a simple tool that returns the input
function makeEchoTool(name: string) {
  return tool({
    description: `${name} echo`,
    inputSchema: z.object({ x: z.number() }),
    execute: async (input: { x: number }) => ({ echoed: input.x }),
  }) as never;
}

describe("withAuditLog middleware", () => {
  it("records audit entries on every successful call", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter, defaultActor: "test" });
    const wrapped = withAuditLog(logger, "create_payment")(makeEchoTool("t"));

    await wrapped.execute!({ x: 42 } as never, {} as never);

    expect(adapter.all()).toHaveLength(1);
    expect(adapter.all()[0]!.operation).toBe("create_payment");
    expect(adapter.all()[0]!.outcome).toBe("ok");
  });

  it("records error on throw + re-throws", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter });
    const t = tool({
      description: "throw",
      inputSchema: z.object({}),
      execute: async () => {
        throw new Error("boom");
      },
    }) as never;
    const wrapped = withAuditLog(logger, "refund_payment")(t);
    await expect(wrapped.execute!({} as never, {} as never)).rejects.toThrow("boom");
    expect(adapter.all()[0]!.outcome).toBe("error");
  });
});

describe("withRateLimit middleware", () => {
  it("acquires a token before each call", async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSecond: 0.001 });
    const fn = vi.fn(async (input: { x: number }) => ({ echoed: input.x }));
    const t = tool({
      description: "x",
      inputSchema: z.object({ x: z.number() }),
      execute: fn as never,
    }) as never;
    const wrapped = withRateLimit(limiter)(t);
    await wrapped.execute!({ x: 1 } as never, {} as never);
    await wrapped.execute!({ x: 2 } as never, {} as never);
    expect(fn).toHaveBeenCalledTimes(2);
    // Bucket drained
    expect(limiter.tryAcquire()).toBe(false);
  });
});

describe("withMetrics middleware", () => {
  it("emits metrics on success + error", async () => {
    const onMetric = vi.fn();
    const wrapped = withMetrics("create_payment", { onMetric })(makeEchoTool("t"));
    await wrapped.execute!({ x: 5 } as never, {} as never);
    expect(onMetric).toHaveBeenCalledTimes(1);
    expect(onMetric.mock.calls[0]![0]).toMatchObject({
      toolName: "create_payment",
      success: true,
    });

    const failing = withMetrics("refund", { onMetric })(
      tool({
        description: "fail",
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error("x");
        },
      }) as never,
    );
    await expect(failing.execute!({} as never, {} as never)).rejects.toThrow();
    expect(onMetric.mock.calls[1]![0]).toMatchObject({ success: false });
  });
});

describe("withRetry middleware", () => {
  it("retries on transient failures", async () => {
    let attempts = 0;
    const t = tool({
      description: "flaky",
      inputSchema: z.object({}),
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error("transient");
        return { ok: true };
      },
    }) as never;
    const wrapped = withRetry({ maxAttempts: 5, baseBackoffMs: 1 })(t);
    const result = await wrapped.execute!({} as never, {} as never);
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it("does NOT retry on 4xx (user errors)", async () => {
    let attempts = 0;
    const t = tool({
      description: "4xx",
      inputSchema: z.object({}),
      execute: async () => {
        attempts++;
        const err = new Error("bad request") as Error & { status: number };
        err.status = 400;
        throw err;
      },
    }) as never;
    const wrapped = withRetry({ maxAttempts: 5, baseBackoffMs: 1 })(t);
    await expect(wrapped.execute!({} as never, {} as never)).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});

describe("compose + applyToAllTools", () => {
  it("compose applies middleware in correct order (innermost = last)", async () => {
    const order: string[] = [];
    const a: typeof withAuditLog extends (...args: never[]) => infer R ? R : never = (t) => ({
      ...t,
      execute: (async (input: never, opts: never) => {
        order.push("A-before");
        const r = await t.execute!(input, opts);
        order.push("A-after");
        return r;
      }) as typeof t.execute,
    });
    const b: typeof a = (t) => ({
      ...t,
      execute: (async (input: never, opts: never) => {
        order.push("B-before");
        const r = await t.execute!(input, opts);
        order.push("B-after");
        return r;
      }) as typeof t.execute,
    });
    const composed = compose(a, b)(makeEchoTool("t"));
    await composed.execute!({ x: 1 } as never, {} as never);
    expect(order).toEqual(["A-before", "B-before", "B-after", "A-after"]);
  });

  it("applyToAllTools wraps every tool in a ToolSet", () => {
    const tools = {
      a: makeEchoTool("a"),
      b: makeEchoTool("b"),
      c: makeEchoTool("c"),
    } as never;
    const wrapped = vi.fn(<T>(t: T) => t);
    applyToAllTools(tools, wrapped as never);
    expect(wrapped).toHaveBeenCalledTimes(3);
  });
});
