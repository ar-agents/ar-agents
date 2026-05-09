/**
 * Unit tests for the audit log primitives. The HMAC + canonical-JSON
 * surface is the forensic primitive that the regulator demo depends on,
 * so tests here are tier-1 priority.
 *
 * The KV path is exercised via the in-memory fallback (KV_REST_API_URL
 * unset). The KV-real path is verified end-to-end in the live deploy.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAudit,
  type AuditEntry,
  backend,
  isSessionIdValid,
  readAudit,
  signEntry,
  verifyEntry,
  verifySession,
} from "../src/lib/audit";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";

describe("isSessionIdValid", () => {
  it("accepts UUIDs and short tokens (8-64 chars, [A-Za-z0-9_-])", () => {
    expect(isSessionIdValid("abcdef12")).toBe(true);
    expect(isSessionIdValid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSessionIdValid("a".repeat(64))).toBe(true);
  });
  it("rejects too short / too long / invalid chars", () => {
    expect(isSessionIdValid("short")).toBe(false);
    expect(isSessionIdValid("a".repeat(65))).toBe(false);
    expect(isSessionIdValid("has spaces")).toBe(false);
    expect(isSessionIdValid("has/slash")).toBe(false);
    expect(isSessionIdValid("")).toBe(false);
  });
});

describe("backend()", () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });
  it('returns "in-memory" when KV is not provisioned', () => {
    expect(backend()).toBe("in-memory");
  });
  it('returns "vercel-kv" when both KV vars are set', () => {
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "token-stub";
    expect(backend()).toBe("vercel-kv");
  });
});

describe("HMAC sign + verify", () => {
  beforeEach(() => {
    process.env.AUDIT_HMAC_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("signs an entry deterministically (same input → same hmac)", async () => {
    const entry = {
      id: "fixed-id",
      sessionId: "sess1",
      ts: "2026-05-09T12:00:00.000Z",
      tool: "validate_cuit",
      governance: "algorithm-only" as const,
      input: { cuit: "20-12345678-9" },
      output: { valid: true },
      durationMs: 1,
    };
    const a = await signEntry(entry);
    const b = await signEntry(entry);
    expect(a).toEqual(b);
    expect(a).toMatch(/^sha256:[0-9a-f]+$/);
  });

  it("returns null when secret is absent", async () => {
    delete process.env.AUDIT_HMAC_SECRET;
    const sig = await signEntry({
      id: "x",
      sessionId: "x",
      ts: "now",
      tool: "x",
      governance: "algorithm-only",
      input: {},
    } as Omit<AuditEntry, "hmac">);
    expect(sig).toBeNull();
  });

  it("verifies a clean entry", async () => {
    const entry = {
      id: "id-1",
      sessionId: "sess1",
      ts: "2026-05-09T12:00:00.000Z",
      tool: "validate_cuit",
      governance: "algorithm-only" as const,
      input: { cuit: "20-12345678-9" },
      hmac: null as string | null,
    };
    entry.hmac = await signEntry(entry);
    const ok = await verifyEntry(entry as AuditEntry);
    expect(ok).toBe(true);
  });

  it("detects tampering on input", async () => {
    const entry: AuditEntry = {
      id: "id-1",
      sessionId: "sess1",
      ts: "2026-05-09T12:00:00.000Z",
      tool: "validate_cuit",
      governance: "algorithm-only",
      input: { cuit: "20-12345678-9" },
      hmac: null,
    };
    entry.hmac = await signEntry(entry);
    // tamper
    (entry.input as Record<string, unknown>).cuit = "FAKE";
    const ok = await verifyEntry(entry);
    expect(ok).toBe(false);
  });

  it("detects tampering on tool name", async () => {
    const entry: AuditEntry = {
      id: "id-1",
      sessionId: "sess1",
      ts: "2026-05-09T12:00:00.000Z",
      tool: "validate_cuit",
      governance: "algorithm-only",
      input: { cuit: "20-12345678-9" },
      hmac: null,
    };
    entry.hmac = await signEntry(entry);
    entry.tool = "DIFFERENT_TOOL";
    expect(await verifyEntry(entry)).toBe(false);
  });

  it("rejects malformed hmac strings", async () => {
    const entry: AuditEntry = {
      id: "id-1",
      sessionId: "sess1",
      ts: "now",
      tool: "x",
      governance: "algorithm-only",
      input: {},
      hmac: "not-a-real-hmac",
    };
    expect(await verifyEntry(entry)).toBe(false);
  });

  it("rejects non-hex hmac body", async () => {
    const entry: AuditEntry = {
      id: "id-1",
      sessionId: "sess1",
      ts: "now",
      tool: "x",
      governance: "algorithm-only",
      input: {},
      hmac: "sha256:GGGG",
    };
    expect(await verifyEntry(entry)).toBe(false);
  });
});

describe("appendAudit + readAudit (in-memory backend)", () => {
  beforeEach(() => {
    process.env.AUDIT_HMAC_SECRET = SECRET;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("appends + reads back in order", async () => {
    const sess = "test-session-aaaa";
    await appendAudit(sess, {
      tool: "validate_cuit",
      governance: "algorithm-only",
      input: { cuit: "20111111119" },
      output: { valid: true },
    });
    await appendAudit(sess, {
      tool: "lookup_cuit_afip",
      governance: "mocked-upstream",
      input: { cuit: "20111111119" },
      output: { available: false },
    });
    const entries = await readAudit(sess);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool).toBe("validate_cuit");
    expect(entries[1]!.tool).toBe("lookup_cuit_afip");
    // Each entry has a non-null hmac because secret is set.
    for (const e of entries) {
      expect(e.hmac).toMatch(/^sha256:[0-9a-f]+$/);
    }
  });

  it("verifies all entries in a session", async () => {
    const sess = "test-session-bbbb";
    await appendAudit(sess, {
      tool: "x",
      governance: "algorithm-only",
      input: {},
      output: {},
    });
    await appendAudit(sess, {
      tool: "y",
      governance: "audit-logged",
      input: { a: 1 },
      output: { b: 2 },
    });
    const stats = await verifySession(sess);
    expect(stats).toMatchObject({
      total: 2,
      verified: 2,
      tampered: 0,
      hmacWired: true,
    });
  });

  it("reports hmacWired:false when secret is absent", async () => {
    delete process.env.AUDIT_HMAC_SECRET;
    const sess = "test-session-cccc";
    await appendAudit(sess, {
      tool: "x",
      governance: "algorithm-only",
      input: {},
      output: {},
    });
    const stats = await verifySession(sess);
    expect(stats.hmacWired).toBe(false);
  });

  it("returns empty array for unknown session", async () => {
    expect(await readAudit("does-not-exist-zzzz")).toEqual([]);
  });
});

describe("canonical-JSON stability (regression)", () => {
  it("same data with reordered keys produces the same hmac", async () => {
    process.env.AUDIT_HMAC_SECRET = SECRET;
    const sigA = await signEntry({
      id: "x",
      sessionId: "s",
      ts: "now",
      tool: "validate_cuit",
      governance: "algorithm-only",
      input: { a: 1, b: 2 },
      output: { x: 1, y: 2 },
    });
    const sigB = await signEntry({
      id: "x",
      sessionId: "s",
      ts: "now",
      tool: "validate_cuit",
      governance: "algorithm-only",
      input: { b: 2, a: 1 } as Record<string, unknown>,
      output: { y: 2, x: 1 } as Record<string, unknown>,
    });
    expect(sigA).toBe(sigB);
  });
});
