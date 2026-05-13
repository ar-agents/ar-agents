/**
 * RFC-004 conformance test suite.
 *
 * The reference implementation MUST pass every vector in
 * /public/test-vectors/rfc-004-v1.json. The vectors file is the
 * normative document; this test file is the proof-of-conformance for
 * the lib at ./audit.ts.
 *
 * Run with: pnpm test
 *
 * Re-generate vectors (if the canonical-JSON or HMAC algorithm changes
 *, which it MUST NOT, by RFC-004 v1's frozen-spec rule, but the
 * regeneration script is useful for v2+):
 *   pnpm tsx scripts/regenerate-rfc-004-vectors.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reference implementation under test.
import { signEntry, verifyEntry, type AuditEntry } from "../src/lib/audit";

// ─────────────────────────────────────────────────────────────────────────────
// Load the published test-vectors JSON
// ─────────────────────────────────────────────────────────────────────────────

interface VectorsFile {
  spec: string;
  version: string;
  publishedAt: string;
  secret: string;
  vectors: Array<{
    id: string;
    description: string;
    input?: unknown;
    expectedCanonical?: string;
    entry?: Omit<AuditEntry, "hmac" | "sessionId" | "errored" | "durationMs"> & {
      sessionId?: string;
      errored?: boolean;
      durationMs?: number;
    };
    expectedHmac?: string;
    mustDifferFrom?: string;
    mustEqual?: string;
  }>;
}

const vectorsPath = resolve(
  __dirname,
  "../public/test-vectors/rfc-004-v1.json",
);
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorsFile;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical-JSON (duplicated here for vector-1 + vector-2 tests; the
// HMAC vectors use the lib's signEntry which uses the lib's canonical
// function internally, proving the lib's canonical matches the spec)
// ─────────────────────────────────────────────────────────────────────────────

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup: inject the conformance secret into the env so signEntry +
// verifyEntry use it for the duration of the tests.
// ─────────────────────────────────────────────────────────────────────────────

let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.AUDIT_HMAC_SECRET;
  process.env.AUDIT_HMAC_SECRET = vectors.secret;
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.AUDIT_HMAC_SECRET;
  else process.env.AUDIT_HMAC_SECRET = originalSecret;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("RFC-004 v1 conformance, reference implementation", () => {
  it("loads the vectors file successfully", () => {
    expect(vectors.spec).toBe("https://ar-agents.ar/rfcs/004");
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(7);
  });

  // Canonical-JSON vectors (1 + 2): exercise the algorithm directly.
  it("vector-1: canonical-JSON sorts object keys", () => {
    const v = vectors.vectors.find((x) => x.id === "vector-1-canonical-keys-sorted")!;
    expect(canonical(v.input)).toBe(v.expectedCanonical);
  });

  it("vector-2: canonical-JSON recurses through nested arrays + objects", () => {
    const v = vectors.vectors.find((x) => x.id === "vector-2-canonical-nested")!;
    expect(canonical(v.input)).toBe(v.expectedCanonical);
  });

  // HMAC vectors: signEntry must produce the exact expectedHmac.
  it("vector-3: HMAC of base entry matches the spec's expected value", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-3-hmac-base-entry")!;
    const sig = await signEntry({ ...v.entry, hmac: null } as AuditEntry);
    expect(sig).toBe(v.expectedHmac);
  });

  it("vector-4: mutating the output field changes the HMAC", async () => {
    const v3 = vectors.vectors.find((x) => x.id === "vector-3-hmac-base-entry")!;
    const v4 = vectors.vectors.find((x) => x.id === "vector-4-mutated-output-differs")!;
    const sig3 = await signEntry({ ...v3.entry, hmac: null } as AuditEntry);
    const sig4 = await signEntry({ ...v4.entry, hmac: null } as AuditEntry);
    expect(sig4).toBe(v4.expectedHmac);
    expect(sig4).not.toBe(sig3); // mustDifferFrom
  });

  it("vector-5: re-signing the same entry is idempotent", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-5-sign-is-idempotent")!;
    const sigA = await signEntry({ ...v.entry, hmac: null } as AuditEntry);
    const sigB = await signEntry({ ...v.entry, hmac: null } as AuditEntry);
    expect(sigA).toBe(sigB);
    expect(sigA).toBe(v.expectedHmac);
  });

  it("vector-6 (base): nested input produces the expected HMAC", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-6-nested-input-base")!;
    const sig = await signEntry({ ...v.entry, hmac: null } as AuditEntry);
    expect(sig).toBe(v.expectedHmac);
  });

  it("vector-6 (mutated): deeply-nested mutation is detected", async () => {
    const vBase = vectors.vectors.find((x) => x.id === "vector-6-nested-input-base")!;
    const vMut = vectors.vectors.find((x) => x.id === "vector-6-mutated-nested")!;
    const sigBase = await signEntry({ ...vBase.entry, hmac: null } as AuditEntry);
    const sigMut = await signEntry({ ...vMut.entry, hmac: null } as AuditEntry);
    expect(sigMut).toBe(vMut.expectedHmac);
    expect(sigMut).not.toBe(sigBase);
  });

  it("verifyEntry round-trips: signed entry verifies; mutated does not", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-3-hmac-base-entry")!;
    const entry = { ...v.entry, hmac: null } as AuditEntry;
    entry.hmac = await signEntry(entry);
    expect(await verifyEntry(entry)).toBe(true);

    // Mutate output → verify fails.
    const mutated = { ...entry, output: { pong: 999 } } as AuditEntry;
    expect(await verifyEntry(mutated)).toBe(false);
  });

  it("missing AUDIT_HMAC_SECRET makes sign return null + verify return false", async () => {
    const saved = process.env.AUDIT_HMAC_SECRET;
    delete process.env.AUDIT_HMAC_SECRET;
    try {
      const entry: AuditEntry = {
        id: "x",
        sessionId: "x",
        ts: "x",
        tool: "x",
        governance: "algorithm-only",
        input: {},
        hmac: null,
      };
      expect(await signEntry(entry)).toBeNull();
      expect(await verifyEntry({ ...entry, hmac: "sha256:0".repeat(33) })).toBe(false);
    } finally {
      process.env.AUDIT_HMAC_SECRET = saved;
    }
  });

  it("HMAC format matches sha256:<64-hex>", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-3-hmac-base-entry")!;
    const sig = await signEntry({ ...v.entry, hmac: null } as AuditEntry);
    expect(sig).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
