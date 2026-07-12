/**
 * Unit tests for the platform-sink dual-write client (ROADMAP.md M3-6):
 * `writeToSink` (POST /api/society-audit/append on apps/landing) and
 * `readSinkTail` (GET /api/society-audit/tail). Both must never throw and
 * must fail silently (counted, not surfaced as an exception), since a sink
 * outage must never break the tool call it's auditing or the /api/status
 * read that falls back to it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSinkTail,
  sinkAuditDroppedWrites,
  writeToSink,
  __resetAuditSinkForTests,
} from "../src/lib/audit-sink";
import type { LocalAuditEntry } from "../src/lib/audit-log";

const ENTRY: LocalAuditEntry = {
  id: "2026-01-01T00:00:00.000Z-abcd1234",
  ts: "2026-01-01T00:00:00.000Z",
  tool: "registrar_decision",
  governance: "create",
  errored: false,
  summary: "priorizar clientes mayoristas este mes",
  hmac: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.SOCIETY_ID = "sess-sink-1";
  process.env.SOCIETY_GATE_TOKEN = "sgt_test_token";
  process.env.AR_AGENTS_API_BASE = "https://ar-agents.test";
  __resetAuditSinkForTests();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.SOCIETY_ID;
  delete process.env.SOCIETY_GATE_TOKEN;
  delete process.env.AR_AGENTS_API_BASE;
  __resetAuditSinkForTests();
  vi.unstubAllGlobals();
});

describe("writeToSink", () => {
  it("skips silently when not configured (no SOCIETY_ID/GATE_TOKEN) -- not a dropped write", async () => {
    delete process.env.SOCIETY_ID;
    await writeToSink(ENTRY);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sinkAuditDroppedWrites()).toBe(0);
  });

  it("POSTs the entry with society + gateToken when configured", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await writeToSink(ENTRY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://ar-agents.test/api/society-audit/append");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ society: "sess-sink-1", gateToken: "sgt_test_token", entry: ENTRY });
    expect(sinkAuditDroppedWrites()).toBe(0);
  });

  it("never throws and counts a dropped write on a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 }));
    await expect(writeToSink(ENTRY)).resolves.toBeUndefined();
    expect(sinkAuditDroppedWrites()).toBe(1);
  });

  it("never throws and counts a dropped write on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(writeToSink(ENTRY)).resolves.toBeUndefined();
    expect(sinkAuditDroppedWrites()).toBe(1);
  });
});

describe("readSinkTail", () => {
  it("returns [] when not configured, no network call", async () => {
    delete process.env.SOCIETY_GATE_TOKEN;
    const entries = await readSinkTail();
    expect(entries).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the gate token as a header, never as a query param", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, entries: [] }), { status: 200 }));
    await readSinkTail(10);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("sgt_test_token");
    expect(init.headers["x-gate-token"]).toBe("sgt_test_token");
    expect(String(url)).toContain("society=sess-sink-1");
    expect(String(url)).toContain("limit=10");
  });

  it("returns the parsed entries array on a well-formed response", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, entries: [{ id: "e1", tool: "x" }] }), { status: 200 }),
    );
    const entries = await readSinkTail();
    expect(entries).toEqual([{ id: "e1", tool: "x" }]);
  });

  it("returns [] (never throws) on a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 }));
    expect(await readSinkTail()).toEqual([]);
  });

  it("returns [] (never throws) on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await readSinkTail()).toEqual([]);
  });
});
