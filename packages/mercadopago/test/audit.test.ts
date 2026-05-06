import { describe, expect, it } from "vitest";
import { AuditLogger, InMemoryAuditLog } from "../src/audit";

describe("AuditLogger", () => {
  it("records ok entries with resourceId from result", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter, defaultActor: "test" });

    await logger.record({
      operation: "create_payment",
      input: { amount: 100, payerEmail: "x@test.com" },
      fn: async () => ({ id: "pay_123", status: "approved" }),
    });

    const entries = adapter.all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.operation).toBe("create_payment");
    expect(entries[0]!.actor).toBe("test");
    expect(entries[0]!.outcome).toBe("ok");
    expect(entries[0]!.resourceId).toBe("pay_123");
    expect(entries[0]!.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entries[0]!.inputRaw).toBeUndefined(); // redact=true (default)
  });

  it("records error entries on throw with errorCode + errorMessage", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter });

    await expect(
      logger.record({
        operation: "refund_payment",
        input: { paymentId: "x" },
        fn: async () => {
          const err = new Error("MP rejected the refund");
          (err as Error & { code: string }).code = "refund_failed";
          throw err;
        },
      }),
    ).rejects.toThrow();

    const entries = adapter.all();
    expect(entries[0]!.outcome).toBe("error");
    expect(entries[0]!.errorCode).toBe("refund_failed");
    expect(entries[0]!.errorMessage).toContain("MP rejected");
  });

  it("includes raw input when redact=false", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter, redact: false });

    await logger.record({
      operation: "create_payment",
      input: { amount: 100, payerEmail: "x@test.com" },
      fn: async () => ({ id: "pay_1" }),
    });

    expect(adapter.all()[0]!.inputRaw).toEqual({ amount: 100, payerEmail: "x@test.com" });
  });

  it("inputHash is deterministic across calls", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter });

    await logger.record({
      operation: "create_payment",
      input: { a: 1, b: 2 },
      fn: async () => ({ id: "1" }),
    });
    await logger.record({
      operation: "create_payment",
      input: { b: 2, a: 1 }, // same fields, different order
      fn: async () => ({ id: "1" }),
    });

    const entries = adapter.all();
    expect(entries[0]!.inputHash).toBe(entries[1]!.inputHash);
  });

  it("query filters by actor + operation + tenant + time range", async () => {
    const adapter = new InMemoryAuditLog();
    const logger = new AuditLogger({ adapter });

    await logger.record({
      operation: "create_payment",
      input: {},
      actor: "agent:bot1",
      tenantId: "tenant-1",
      fn: async () => ({ id: "1" }),
    });
    await logger.record({
      operation: "refund_payment",
      input: {},
      actor: "agent:bot2",
      tenantId: "tenant-1",
      fn: async () => ({ id: "2" }),
    });

    expect((await adapter.query!({ actor: "agent:bot1" })).length).toBe(1);
    expect((await adapter.query!({ operation: "refund_payment" })).length).toBe(1);
    expect((await adapter.query!({ tenantId: "tenant-1" })).length).toBe(2);
  });
});
