/**
 * Unit tests for the SSE primitives. Validates wire-format correctness
 * + escape behavior so the live /api/play/audit-stream output is
 * provably parseable by every spec-compliant EventSource client.
 */

import { describe, expect, it } from "vitest";
import {
  isValidEventName,
  parseSseBuffer,
  sseComment,
  sseLine,
} from "../src/lib/sse";

describe("isValidEventName()", () => {
  it("accepts simple ASCII identifiers", () => {
    expect(isValidEventName("entry")).toBe(true);
    expect(isValidEventName("snapshot-complete")).toBe(true);
    expect(isValidEventName("a.b.c")).toBe(true);
    expect(isValidEventName("a_b_c")).toBe(true);
    expect(isValidEventName("ping")).toBe(true);
  });
  it("rejects empty / non-strings", () => {
    expect(isValidEventName("")).toBe(false);
    expect(isValidEventName(null as unknown as string)).toBe(false);
    expect(isValidEventName(123 as unknown as string)).toBe(false);
  });
  it("rejects names with whitespace or control chars", () => {
    expect(isValidEventName("has space")).toBe(false);
    expect(isValidEventName("has\nnewline")).toBe(false);
    expect(isValidEventName("has\tTab")).toBe(false);
  });
  it("rejects names that don't start with a letter", () => {
    expect(isValidEventName("1event")).toBe(false);
    expect(isValidEventName("-event")).toBe(false);
    expect(isValidEventName(".event")).toBe(false);
  });
  it("rejects very long names", () => {
    expect(isValidEventName("a".repeat(65))).toBe(false);
    expect(isValidEventName("a".repeat(64))).toBe(true);
  });
});

describe("sseLine()", () => {
  it("formats a basic event with JSON-stringified payload", () => {
    const line = sseLine("entry", { hello: "world" });
    expect(line).toBe('event: entry\ndata: {"hello":"world"}\n\n');
  });
  it("ends with double-newline (event terminator)", () => {
    const line = sseLine("entry", { a: 1 });
    expect(line.endsWith("\n\n")).toBe(true);
  });
  it("rejects invalid event names", () => {
    expect(() => sseLine("has space", {})).toThrow();
    expect(() => sseLine("", {})).toThrow();
    expect(() => sseLine("nl\nin\nname", {})).toThrow();
  });
  it("escapes payload via JSON.stringify (no raw newlines bleed)", () => {
    const line = sseLine("entry", { multi: "line\nwith\nbreaks" });
    // The serialized JSON has \n as the literal escape; the wire shouldn't
    // include the raw control characters that'd terminate a data line.
    expect(line).toContain("line\\nwith\\nbreaks");
    expect(line.split("\n").filter((s) => s.startsWith("data: "))).toHaveLength(1);
  });
  it("handles arrays + nested objects", () => {
    const line = sseLine("entry", { items: [1, 2, { nested: true }] });
    expect(line).toBe('event: entry\ndata: {"items":[1,2,{"nested":true}]}\n\n');
  });
  it("handles non-finite numbers (JSON-stringify converts to null)", () => {
    const line = sseLine("entry", { v: Number.POSITIVE_INFINITY });
    expect(line).toContain('"v":null');
  });
});

describe("sseComment()", () => {
  it("starts with a colon-space (per spec)", () => {
    expect(sseComment("hello")).toBe(": hello\n\n");
  });
  it("strips newlines from the comment body", () => {
    expect(sseComment("multi\nline\ncomment")).toBe(": multi line comment\n\n");
  });
});

describe("parseSseBuffer()", () => {
  it("parses a single event", () => {
    const buf = sseLine("entry", { id: 1 });
    const events = parseSseBuffer(buf);
    expect(events).toEqual([{ event: "entry", data: '{"id":1}' }]);
  });
  it("parses multiple events", () => {
    const buf = sseLine("entry", { id: 1 }) + sseLine("entry", { id: 2 });
    const events = parseSseBuffer(buf);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "entry", data: '{"id":1}' });
    expect(events[1]).toEqual({ event: "entry", data: '{"id":2}' });
  });
  it("handles event-name-less default (= 'message')", () => {
    const buf = "data: hello\n\n";
    const events = parseSseBuffer(buf);
    expect(events).toEqual([{ event: "message", data: "hello" }]);
  });
  it("ignores comment-only blocks", () => {
    const buf = sseComment("keepalive") + sseLine("entry", { id: 1 });
    const events = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("entry");
  });
  it("round-trips JSON payloads via line + parse", () => {
    const payload = { id: 42, ts: "2026-05-09T00:00:00Z", deep: { a: [1, 2] } };
    const line = sseLine("entry", payload);
    const events = parseSseBuffer(line);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.data)).toEqual(payload);
  });
});
