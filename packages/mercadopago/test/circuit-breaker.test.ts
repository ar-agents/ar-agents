import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/circuit-breaker";

/**
 * Controllable clock for deterministic state-transition tests.
 */
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("CircuitBreaker — state machine", () => {
  it("starts CLOSED", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("stays CLOSED on successful calls", async () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 100; i++) {
      await cb.execute(async () => "ok");
    }
    expect(cb.getState()).toBe("CLOSED");
  });

  it("opens after `failureThreshold` failures within window", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      monitoringWindowMs: 60_000,
      now: clock.now,
    });
    const fail = () => cb.execute(async () => { throw new Error("MP down"); });

    await expect(fail()).rejects.toThrow("MP down");
    expect(cb.getState()).toBe("CLOSED");
    await expect(fail()).rejects.toThrow("MP down");
    expect(cb.getState()).toBe("CLOSED");
    await expect(fail()).rejects.toThrow("MP down");
    expect(cb.getState()).toBe("OPEN");
  });

  it("rejects with CircuitOpenError when OPEN — fails fast (no fn invocation)", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      now: clock.now,
    });
    await expect(cb.execute(async () => { throw new Error("boom"); })).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");

    // The fn should NOT be called when OPEN.
    const fn = vi.fn(async () => "result");
    await expect(cb.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("transitions OPEN → HALF_OPEN after resetTimeoutMs elapsed", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 30_000,
      now: clock.now,
    });
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");

    // Just before cooldown — still OPEN.
    clock.advance(29_999);
    expect(cb.getState()).toBe("OPEN");

    // Cooldown elapsed — auto-transition to HALF_OPEN.
    clock.advance(1);
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  it("HALF_OPEN closes on `successThreshold` consecutive successes", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      resetTimeoutMs: 30_000,
      now: clock.now,
    });
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    clock.advance(31_000);
    expect(cb.getState()).toBe("HALF_OPEN");

    // First success — still HALF_OPEN.
    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe("HALF_OPEN");

    // Second success — CLOSED.
    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("HALF_OPEN failure re-opens immediately (no further trials)", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      resetTimeoutMs: 30_000,
      now: clock.now,
    });
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    clock.advance(31_000);
    expect(cb.getState()).toBe("HALF_OPEN");

    await expect(cb.execute(async () => { throw new Error("still down"); })).rejects.toThrow("still down");
    expect(cb.getState()).toBe("OPEN");
  });

  it("prunes failures older than monitoringWindowMs", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      monitoringWindowMs: 1000,
      now: clock.now,
    });
    const fail = () => cb.execute(async () => { throw new Error("x"); });

    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();
    expect(cb.getState()).toBe("CLOSED");

    // Advance past window — old failures pruned.
    clock.advance(1500);

    // 1 fresh failure shouldn't be enough (threshold 3, but old 2 are pruned).
    await expect(fail()).rejects.toThrow();
    expect(cb.getState()).toBe("CLOSED");
  });
});

describe("CircuitBreaker — observability", () => {
  it("emits onStateChange events on every transition", async () => {
    const clock = makeClock();
    const events: Array<{ from: string; to: string }> = [];
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 30_000,
      successThreshold: 1,
      onStateChange: (e) => events.push({ from: e.from, to: e.to }),
      now: clock.now,
    });

    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    expect(events).toEqual([{ from: "CLOSED", to: "OPEN" }]);

    clock.advance(31_000);
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(events).toEqual([
      { from: "CLOSED", to: "OPEN" },
      { from: "OPEN", to: "HALF_OPEN" },
    ]);

    await cb.execute(async () => "ok");
    expect(events).toEqual([
      { from: "CLOSED", to: "OPEN" },
      { from: "OPEN", to: "HALF_OPEN" },
      { from: "HALF_OPEN", to: "CLOSED" },
    ]);
  });

  it("getStats reports accurate diagnostic info", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 30_000,
      now: clock.now,
    });
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();

    const s1 = cb.getStats();
    expect(s1.state).toBe("OPEN");
    expect(s1.consecutiveFailures).toBe(1);
    expect(s1.msUntilHalfOpen).toBe(30_000);

    clock.advance(20_000);
    const s2 = cb.getStats();
    expect(s2.msUntilHalfOpen).toBe(10_000);
  });

  it("isFailure predicate filters which errors count", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      // Only count network errors, not validation errors
      isFailure: (err) =>
        err instanceof Error && err.message.includes("network"),
    });
    await expect(cb.execute(async () => { throw new Error("validation: bad input"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("validation: bad input"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("validation: bad input"); })).rejects.toThrow();
    // Validation errors don't count → still CLOSED.
    expect(cb.getState()).toBe("CLOSED");

    await expect(cb.execute(async () => { throw new Error("network: ECONNREFUSED"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("network: ECONNREFUSED"); })).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");
  });
});

describe("CircuitBreaker — manual control", () => {
  it("trip() forces OPEN", () => {
    const cb = new CircuitBreaker();
    cb.trip("manual ops decision");
    expect(cb.getState()).toBe("OPEN");
  });

  it("reset() returns to CLOSED + clears state", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");

    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getStats().consecutiveFailures).toBe(0);
  });
});
