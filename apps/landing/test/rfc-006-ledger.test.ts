import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anchorSig,
  canonical006,
  chainLinkHash,
  verifyAnchors,
  verifyChain,
  verifyRecordsOnly,
  type Anchor,
  type ChainLink,
} from "../src/lib/ledger";

/**
 * Conformance: the live ledger lib (src/lib/ledger.ts) must reproduce the
 * FROZEN RFC-006 test vectors byte for byte. The vectors + arg-verify.mjs are
 * the spec; any drift here is a cross-implementation forgery hole and fails CI.
 */

const doc = JSON.parse(
  readFileSync(join(__dirname, "..", "public", "test-vectors", "rfc-006-v1.json"), "utf8"),
);
const aSec: string = doc.secrets.audit;

describe("RFC-006 live ledger vs frozen vectors", () => {
  it("recomputes every chain link hash", async () => {
    for (const l of doc.chain.links as ChainLink[]) {
      expect(await chainLinkHash(aSec, l)).toBe(l.hash);
    }
  });

  it("verifies the valid chain as contiguous", async () => {
    const v = await verifyChain(doc.chain.links, aSec);
    expect(v.valid).toBe(true);
    expect(v.count).toBe(doc.chain.expect.count);
  });

  it("detects the mutated chain at the right seq", async () => {
    const m = await verifyChain(doc.chainMutated.links, aSec);
    expect(m.valid).toBe(false);
    expect(m.brokenAtSeq).toBe(doc.chainMutated.expect.brokenAtSeq);
    expect(String(m.reason)).toContain(doc.chainMutated.expect.reasonContains);
  });

  it("detects the deleted-link chain", async () => {
    const d = await verifyChain(doc.chainDeleted.links, aSec);
    expect(d.valid).toBe(false);
  });

  it("recomputes every anchor signature and verifies the anchor chain", async () => {
    for (const a of doc.anchors.anchors as Anchor[]) {
      expect(await anchorSig(aSec, a)).toBe(a.signature);
    }
    const av = await verifyAnchors(doc.anchors.anchors, aSec);
    expect(av.valid).toBe(true);
    expect(av.count).toBe(doc.anchors.expect.count);
  });

  it("recordsOnly verifies the export bundle slice (createdAt→ts mapping)", async () => {
    const eb = doc.exportBundle.bundle;
    const ro = await verifyRecordsOnly(eb.auditEvents, aSec);
    expect(ro.valid).toBe(true);
    expect(ro.count).toBe(doc.exportBundle.expect.recordsOnly.count);
  });

  it("recordsOnly flags the tampered bundle at the right seq", async () => {
    const tb = doc.exportBundleTampered.bundle;
    const ro = await verifyRecordsOnly(tb.auditEvents, aSec);
    expect(ro.valid).toBe(false);
    expect(ro.brokenAtSeq).toBe(doc.exportBundleTampered.expect.recordsOnly.brokenAtSeq);
  });

  it("canonical006 matches the attestation body canonical form (vectors)", () => {
    // The Ed25519 sig in the vectors is over canonical(att.body); reproducing
    // the exact canonical string is what makes our signatures verifiable by
    // arg-verify. Spot-check shape stability on the frozen body.
    const body = doc.exportBundle.bundle.attestation.body;
    const c = canonical006(body);
    expect(c.startsWith('{"chain":{')).toBe(true);
    expect(c).toContain('"globalHeadHash"');
    expect(c).toContain('"kind":"vultur.compliance.attestation"');
  });

  it("canonical006 rejects out-of-domain values (RFC-006 §2)", () => {
    expect(() => canonical006(undefined)).toThrow();
    expect(() => canonical006({ a: BigInt(1) } as unknown)).toThrow();
    expect(() => canonical006(Infinity)).toThrow();
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonical006([1, , 3] as unknown)).toThrow();
  });
});
