import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * Sprint 1B: attestation.ts body.timestamp binding (ADDITIVE, RFC-006 6.1).
 *
 * Invariants under test:
 *  - When NO OTS proof covers the head, body.timestamp is ABSENT and the
 *    canonical bytes are byte-stable (the no-OTS case the frozen vectors pin).
 *  - When an OTS proof covers the head, body.timestamp is present with the right
 *    shape AND the Ed25519 signature still verifies over canonical006(body).
 *  - The Ed25519 sig is computed over canonical006(body) including timestamp.
 */

// Stateful KV mock backing the ledger's reads (lrange for links/anchors, get +
// smembers for proofs). Set by each test via the `seed` helper.
const { kv } = vi.hoisted(() => {
  const lists = new Map<string, unknown[]>();
  const objs = new Map<string, unknown>();
  const sets = new Map<string, Set<unknown>>();
  return {
    kv: {
      lists,
      objs,
      sets,
      mock: {
        lrange: async (k: string, start: number, stop: number) => {
          const arr = lists.get(k) ?? [];
          // Mirror @vercel/kv: negative indices count from the end, inclusive.
          const n = arr.length;
          const s = start < 0 ? Math.max(n + start, 0) : start;
          const e = stop < 0 ? n + stop : stop;
          return arr.slice(s, e + 1);
        },
        get: async (k: string) => objs.get(k) ?? null,
        set: async (k: string, v: unknown) => {
          objs.set(k, v);
          return "OK";
        },
        sadd: async (k: string, ...m: unknown[]) => {
          const set = sets.get(k) ?? new Set();
          m.forEach((x) => set.add(x));
          sets.set(k, set);
          return m.length;
        },
        smembers: async (k: string) => Array.from(sets.get(k) ?? []),
        rpush: async () => 1,
        del: async () => 1,
      },
    },
  };
});
vi.mock("@vercel/kv", () => ({ kv: kv.mock }));

import { buildAttestation } from "../src/lib/attestation";
import { anchorDigest, canonical006, type Anchor, type AnchorProof, type ChainLink } from "../src/lib/ledger";

const SECRET = "test-hmac-secret-aaaaaaaaaaaaaaaaaaaa";
const PRIV = "MC4CAQAwBQYDK2VwBCIEIGW8zyK1X-q0ILg2EjyzDdZU43pHsva8CfRRZ_ZibcGv";
const PUB_SPKI_B64URL = "MCowBQYDK2VwAyEAjFW5_BXTil8F7Jxhg269rWf7ulhKbo_mVHGf7bBwAoA";
const SLUG = "soc_demo01";

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function makeLink(seq: number, societyId: string | null): ChainLink {
  return {
    seq,
    prevHash: seq === 1 ? "GENESIS" : `h${seq - 1}`,
    societyId,
    actor: "test",
    action: "test.act",
    meta: null,
    ts: `2026-06-29T00:00:0${seq}.000Z`,
    hash: `h${seq}`,
  };
}

function makeAnchor(seq: number, headSeq: number, headHash: string): Anchor {
  return {
    seq,
    headSeq,
    headHash,
    prevAnchor: seq === 1 ? "GENESIS" : `as${seq - 1}`,
    ts: "2026-06-29T00:01:00.000Z",
    signature: `as${seq}`,
  };
}

function seed(opts: { links: ChainLink[]; anchors?: Anchor[]; proofs?: Record<number, AnchorProof> }) {
  kv.lists.set("ledger:links", opts.links);
  kv.lists.set("ledger:anchors", opts.anchors ?? []);
  const head = opts.links[opts.links.length - 1];
  kv.objs.set("ledger:head", { seq: head.seq, hash: head.hash });
  if (opts.proofs) {
    for (const [seq, proof] of Object.entries(opts.proofs)) {
      kv.objs.set(`ledger:anchor:proof:${seq}`, proof);
      const set = kv.sets.get("ledger:anchor:proof:ids") ?? new Set();
      set.add(Number(seq));
      kv.sets.set("ledger:anchor:proof:ids", set);
    }
  }
}

function verifySig(body: unknown, sigB64: string): boolean {
  const pub = createPublicKey({ key: b64urlToBuf(PUB_SPKI_B64URL), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical006(body), "utf8"), pub, Buffer.from(sigB64, "base64"));
}

beforeEach(() => {
  kv.lists.clear();
  kv.objs.clear();
  kv.sets.clear();
  process.env.AUDIT_HMAC_SECRET = SECRET;
  process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
  process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_SPKI_B64URL;
});

afterEach(() => {
  delete process.env.AUDIT_HMAC_SECRET;
  delete process.env.AUDIT_ED25519_PRIVATE_KEY;
  delete process.env.AUDIT_ED25519_PUBLIC_KEY;
});

describe("attestation body.timestamp (RFC-006 6.1, additive)", () => {
  it("omits timestamp and stays byte-stable when no OTS proof covers the head", async () => {
    seed({ links: [makeLink(1, null), makeLink(2, SLUG)] });
    const res = await buildAttestation(SLUG);
    expect(res).not.toBeNull();
    expect(res!.attestation.body.timestamp).toBeUndefined();
    // Byte-stable shape: canonical006 of the no-OTS body has no "timestamp" key.
    expect(canonical006(res!.attestation.body)).not.toContain('"timestamp"');
    // Sig still verifies over the body.
    expect(verifySig(res!.attestation.body, res!.attestation.sig)).toBe(true);
  });

  it("binds the latest OTS proof whose anchor covers the head; sig verifies", async () => {
    const links = [makeLink(1, null), makeLink(2, SLUG)];
    const head = links[links.length - 1];
    const anchor = makeAnchor(1, head.seq, head.hash);
    const digest = await anchorDigest(anchor);
    const proof: AnchorProof = {
      type: "opentimestamps",
      otsBase64: "AAAA",
      digest,
      digestAlg: "sha256",
      status: "bitcoin",
      bitcoinBlockHeight: 800123,
      submittedAt: "2026-06-29T00:02:00.000Z",
      upgradedAt: "2026-06-29T03:00:00.000Z",
    };
    seed({ links, anchors: [anchor], proofs: { 1: proof } });

    const res = await buildAttestation(SLUG);
    expect(res).not.toBeNull();
    const ts = res!.attestation.body.timestamp;
    expect(ts).toBeDefined();
    expect(ts!.type).toBe("opentimestamps");
    expect(ts!.anchorSeq).toBe(1);
    expect(ts!.digest).toBe(digest);
    expect(ts!.status).toBe("bitcoin");
    expect(ts!.bitcoinBlockHeight).toBe(800123);
    // canonical006 includes the timestamp key now, and the sig verifies over it.
    expect(canonical006(res!.attestation.body)).toContain('"timestamp"');
    expect(verifySig(res!.attestation.body, res!.attestation.sig)).toBe(true);
  });

  it("ignores an anchor proof that does NOT cover the head (headSeq < attested head)", async () => {
    const links = [makeLink(1, null), makeLink(2, SLUG), makeLink(3, SLUG)];
    // Anchor only covers up to seq 2, but head is seq 3 -> not eligible.
    const anchor = makeAnchor(1, 2, "h2");
    const digest = await anchorDigest(anchor);
    const proof: AnchorProof = {
      type: "opentimestamps",
      otsBase64: "AAAA",
      digest,
      digestAlg: "sha256",
      status: "pending",
      submittedAt: "2026-06-29T00:02:00.000Z",
    };
    seed({ links, anchors: [anchor], proofs: { 1: proof } });

    const res = await buildAttestation(SLUG);
    expect(res!.attestation.body.timestamp).toBeUndefined();
  });
});
