/**
 * Unit tests for the per-society durable audit sink (ROADMAP.md M3-6). The
 * KV path is exercised via the in-memory fallback (KV_REST_API_URL unset),
 * same convention as test/audit.test.ts for the administrative log this
 * one is modeled on.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  appendSocietyAuditEntry,
  readSocietyAuditTail,
  sanitizeSocietyAuditEntry,
  __resetSocietyAuditForTests,
} from "../src/lib/society-audit";

const VALID_ENTRY = {
  id: "2026-01-01T00:00:00.000Z-abcd1234",
  ts: "2026-01-01T00:00:00.000Z",
  tool: "registrar_decision",
  governance: "create",
  errored: false,
  summary: "priorizar clientes mayoristas este mes",
  hmac: "sha256:deadbeef",
};

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  __resetSocietyAuditForTests();
});

describe("sanitizeSocietyAuditEntry", () => {
  it("accepts a well-formed entry and stamps receivedAt", () => {
    const before = Date.now();
    const entry = sanitizeSocietyAuditEntry(VALID_ENTRY);
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      id: VALID_ENTRY.id,
      tool: "registrar_decision",
      governance: "create",
      errored: false,
      summary: VALID_ENTRY.summary,
      hmac: "sha256:deadbeef",
    });
    expect(Date.parse(entry!.receivedAt)).toBeGreaterThanOrEqual(before);
  });

  it("accepts hmac: null (society had no AUDIT_HMAC_SECRET configured)", () => {
    const entry = sanitizeSocietyAuditEntry({ ...VALID_ENTRY, hmac: null });
    expect(entry!.hmac).toBeNull();
  });

  it("rejects missing/wrong-typed required fields", () => {
    expect(sanitizeSocietyAuditEntry(null)).toBeNull();
    expect(sanitizeSocietyAuditEntry({})).toBeNull();
    expect(sanitizeSocietyAuditEntry({ ...VALID_ENTRY, id: 123 })).toBeNull();
    expect(sanitizeSocietyAuditEntry({ ...VALID_ENTRY, errored: "no" })).toBeNull();
    expect(sanitizeSocietyAuditEntry({ ...VALID_ENTRY, summary: undefined })).toBeNull();
    expect(sanitizeSocietyAuditEntry({ ...VALID_ENTRY, hmac: 123 })).toBeNull();
  });

  it("never trusts the writer: caps every field server-side regardless of client-side redaction", () => {
    const entry = sanitizeSocietyAuditEntry({
      ...VALID_ENTRY,
      id: "i".repeat(500),
      tool: "t".repeat(500),
      governance: "g".repeat(500),
      summary: `  ${"s".repeat(500)}  `,
      hmac: `sha256:${"h".repeat(500)}`,
    });
    expect(entry).not.toBeNull();
    expect(entry!.id.length).toBeLessThanOrEqual(128);
    expect(entry!.tool.length).toBeLessThanOrEqual(200);
    expect(entry!.governance.length).toBeLessThanOrEqual(64);
    expect(entry!.summary.length).toBeLessThanOrEqual(280);
    expect(entry!.hmac!.length).toBeLessThanOrEqual(200);
    // Whitespace collapsed like the starter's own redactSummary.
    expect(entry!.summary.startsWith(" ")).toBe(false);
  });
});

describe("appendSocietyAuditEntry + readSocietyAuditTail (in-memory fallback)", () => {
  it("appends and reads back newest-first, namespaced by societyId", async () => {
    await appendSocietyAuditEntry("soc-a", { ...VALID_ENTRY, id: "e1", tool: "tool_1" });
    await appendSocietyAuditEntry("soc-a", { ...VALID_ENTRY, id: "e2", tool: "tool_2" });

    const entries = await readSocietyAuditTail("soc-a", 20);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool).toBe("tool_2"); // newest first
    expect(entries[1]!.tool).toBe("tool_1");
  });

  it("rejects an invalid entry and does not store it", async () => {
    const ok = await appendSocietyAuditEntry("soc-b", { garbage: true });
    expect(ok).toBe(false);
    expect(await readSocietyAuditTail("soc-b")).toHaveLength(0);
  });

  it("caps unbounded growth per society at MAX_ENTRIES (200)", async () => {
    for (let i = 0; i < 210; i++) {
      await appendSocietyAuditEntry("soc-c", { ...VALID_ENTRY, id: `e${i}`, tool: `tool_${i}` });
    }
    const entries = await readSocietyAuditTail("soc-c", 500);
    expect(entries.length).toBeLessThanOrEqual(200);
    expect(entries[0]!.tool).toBe("tool_209"); // newest survives the cap
  });

  it("respects the limit parameter, clamped to [1, MAX_ENTRIES]", async () => {
    for (let i = 0; i < 5; i++) {
      await appendSocietyAuditEntry("soc-d", { ...VALID_ENTRY, id: `e${i}`, tool: `tool_${i}` });
    }
    const entries = await readSocietyAuditTail("soc-d", 2);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool).toBe("tool_4");
    expect(entries[1]!.tool).toBe("tool_3");
  });

  it("isolation: two societies' entries never mix in the same read", async () => {
    await appendSocietyAuditEntry("soc-isolated-a", { ...VALID_ENTRY, id: "a1", tool: "a_tool" });
    await appendSocietyAuditEntry("soc-isolated-b", { ...VALID_ENTRY, id: "b1", tool: "b_tool" });

    const a = await readSocietyAuditTail("soc-isolated-a");
    const b = await readSocietyAuditTail("soc-isolated-b");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.tool).toBe("a_tool");
    expect(b[0]!.tool).toBe("b_tool");
  });
});
