/**
 * Unit tests for the starter's local signed audit log (ROADMAP.md M3-4 /
 * M3-5). The KV path is exercised via the in-memory fallback
 * (KV_REST_API_URL unset), same as apps/landing/test/audit.test.ts for the
 * administrative log this one is modeled on.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLocalAudit,
  localAuditDroppedWrites,
  readLocalAudit,
  redactSummary,
  __resetLocalAuditForTests,
} from "../src/lib/audit-log";

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUDIT_HMAC_SECRET;
  __resetLocalAuditForTests();
});

afterEach(() => {
  delete process.env.AUDIT_HMAC_SECRET;
  __resetLocalAuditForTests();
});

describe("redactSummary", () => {
  it("collapses whitespace and trims", () => {
    expect(redactSummary("  hola   mundo  \n")).toBe("hola mundo");
  });

  it("caps length with an ellipsis", () => {
    const long = "a".repeat(500);
    const out = redactSummary(long);
    expect(out.length).toBeLessThan(500);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("appendLocalAudit + readLocalAudit (in-memory fallback)", () => {
  it("appends and reads back newest-first", async () => {
    await appendLocalAudit({ tool: "validate_cuit", governance: "read", errored: false, summary: "ok" });
    await appendLocalAudit({ tool: "registrar_decision", governance: "create", errored: false, summary: "decidido" });

    const entries = await readLocalAudit(20);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool).toBe("registrar_decision"); // newest first
    expect(entries[1]!.tool).toBe("validate_cuit");
    for (const e of entries) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.ts).toBe("string");
    }
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await appendLocalAudit({ tool: `tool_${i}`, governance: "read", errored: false, summary: "x" });
    }
    const entries = await readLocalAudit(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool).toBe("tool_4");
    expect(entries[1]!.tool).toBe("tool_3");
  });

  it("caps unbounded growth at MAX_ENTRIES", async () => {
    for (let i = 0; i < 210; i++) {
      await appendLocalAudit({ tool: `tool_${i}`, governance: "read", errored: false, summary: "x" });
    }
    const entries = await readLocalAudit(500);
    expect(entries.length).toBeLessThanOrEqual(200);
    // Newest entry survives the cap.
    expect(entries[0]!.tool).toBe("tool_209");
  });

  it("redacts the summary before storing it", async () => {
    const entry = await appendLocalAudit({
      tool: "emitir_factura",
      governance: "fiscal",
      errored: false,
      summary: `  ${"x".repeat(400)}  `,
    });
    expect(entry).not.toBeNull();
    expect(entry!.summary.length).toBeLessThan(400);
  });
});

describe("HMAC signing", () => {
  it("hmac is null when AUDIT_HMAC_SECRET is unset", async () => {
    const entry = await appendLocalAudit({ tool: "t", governance: "read", errored: false, summary: "s" });
    expect(entry!.hmac).toBeNull();
  });

  it("hmac is a sha256:<hex> string when the secret is set", async () => {
    process.env.AUDIT_HMAC_SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
    const entry = await appendLocalAudit({ tool: "t", governance: "read", errored: false, summary: "s" });
    expect(entry!.hmac).toMatch(/^sha256:[0-9a-f]+$/);
  });

  it("different entries get different signatures", async () => {
    process.env.AUDIT_HMAC_SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
    const a = await appendLocalAudit({ tool: "t1", governance: "read", errored: false, summary: "s" });
    const b = await appendLocalAudit({ tool: "t2", governance: "read", errored: false, summary: "s" });
    expect(a!.hmac).not.toBe(b!.hmac);
  });
});

describe("localAuditDroppedWrites", () => {
  it("starts at 0", () => {
    expect(localAuditDroppedWrites()).toBe(0);
  });
});
