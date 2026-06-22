/**
 * 3A — adversarial resilience of the governance rails under infrastructure
 * faults. Implemented as fault-INJECTION TESTS rather than a live "chaos"
 * endpoint: a fault-injecting endpoint would itself be an attack surface to
 * lock down in prod, whereas these prove the same invariants in CI with zero
 * production surface.
 *
 * Fault modeled here: a TOTAL Vercel KV outage (every op throws). The rails must
 * degrade SAFELY — never lose a signed record, never wave a flood through a
 * money path, never 500 a public read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Total KV outage: every kv.* call throws, synchronously, for every op.
const kvOutage = () => {
  throw new Error("KV outage (injected)");
};
vi.mock("@vercel/kv", () => ({
  kv: new Proxy({}, { get: () => kvOutage }),
}));

import { appendAudit, readAudit, verifyEntry } from "../src/lib/audit";
import { kvRateLimit } from "../src/lib/ratelimit";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  // Force the KV code path (isKvWired() true) so the injected outage is exercised
  // rather than the plain in-memory path.
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
});

afterEach(() => {
  delete process.env.AUDIT_HMAC_SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("3A fault injection — total KV outage", () => {
  it("appendAudit degrades to in-memory, never throws, and the entry stays signed + verifiable", async () => {
    const sess = "kv-down-durable";
    const entry = await appendAudit(
      sess,
      { tool: "incorporate_attested", governance: "audit-logged", input: { a: 1 }, output: {} },
      { durable: true },
    );
    expect(entry.hmac).toMatch(/^sha256:[0-9a-f]+$/); // signing never touches KV
    const back = await readAudit(sess); // KV read throws → falls back to memory
    expect(back).toHaveLength(1);
    expect(await verifyEntry(back[0]!)).toBe(true); // forensic integrity preserved
  });

  it("kvRateLimit on the durable-write path FAILS CLOSED (denies) under the outage", async () => {
    // The only cross-isolate quota is down; a constitution flood must be denied,
    // not waved through.
    expect(
      await kvRateLimit("incorporate-attested", "1.2.3.4", 5, 3600, { failClosed: true }),
    ).toBe(false);
  });

  it("kvRateLimit on cheap abuse-damping paths FAILS OPEN (availability) under the outage", async () => {
    // The in-memory limiter remains the backstop for these.
    expect(await kvRateLimit("approvals-gate", "1.2.3.4", 60, 3600)).toBe(true);
  });
});
