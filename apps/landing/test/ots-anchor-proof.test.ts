import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sprint 1B: OpenTimestamps anchor-proof layer (ADDITIVE over the HMAC+Ed25519
 * anchor sub-chain). Fetch is MOCKED throughout — no live calendar calls. KV is
 * a stateful in-memory mock so stamp -> read -> upgrade round-trips.
 */

// Stateful KV mock backing ledger's direct kv.* calls (set/get/sadd/smembers
// are the only ops the OTS proof code uses; the rest back createAnchor's chain).
const { kvStore, kvSets } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  kvSets: new Map<string, Set<unknown>>(),
}));
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown) => {
      kvStore.set(k, v);
      return "OK";
    },
    sadd: async (k: string, ...members: unknown[]) => {
      const s = kvSets.get(k) ?? new Set<unknown>();
      for (const m of members) s.add(m);
      kvSets.set(k, s);
      return members.length;
    },
    smembers: async (k: string) => Array.from(kvSets.get(k) ?? []),
    lrange: async () => [],
    rpush: async () => 1,
    del: async (k: string) => {
      kvStore.delete(k);
      return 1;
    },
  },
}));

import {
  anchorDigest,
  readAnchorProof,
  readAnchorProofs,
  stampAnchor,
  upgradeAnchorProof,
  type Anchor,
} from "../src/lib/ledger";
import {
  assembleOtsFile,
  b64ToBytes,
  bytesToB64,
  parseOtsFile,
  scanAttestations,
  stampDigest,
  upgradeOts,
} from "../src/lib/opentimestamps";

// Load the frozen vector's deterministic .ots fixture for parser parity.
const vectors = JSON.parse(
  readFileSync(join(__dirname, "..", "public", "test-vectors", "rfc-006-v1.json"), "utf8"),
);

const ANCHOR: Anchor = {
  seq: 7,
  headSeq: 12,
  headHash: "deadbeef".repeat(8),
  prevAnchor: "GENESIS",
  ts: "2026-06-29T00:00:00.000Z",
  signature: "sig",
};

// A minimal serialized OTS timestamp body carrying a PENDING (calendar)
// attestation: ATTESTATION marker (0x00) + pending tag + 1-byte len + uri.
const PENDING_TAG = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
function pendingSerialized(): Uint8Array {
  const uri = new TextEncoder().encode("https://a.pool.opentimestamps.org");
  return new Uint8Array([0x00, ...PENDING_TAG, uri.length, ...uri]);
}
// A serialized body carrying a BITCOIN attestation at block height 800123.
const BITCOIN_TAG = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
function bitcoinSerialized(height: number): Uint8Array {
  // tag + varuint(len=2) + varuint(height). 800123 = 0xC355B -> LEB128 bytes.
  const heightBytes: number[] = [];
  let h = height;
  do {
    let b = h & 0x7f;
    h >>>= 7;
    if (h !== 0) b |= 0x80;
    heightBytes.push(b);
  } while (h !== 0);
  return new Uint8Array([0x00, ...BITCOIN_TAG, heightBytes.length, ...heightBytes]);
}

let realFetch: typeof fetch;

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
  realFetch = globalThis.fetch;
  process.env.ANCHOR_OTS_ENABLED = "1";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ANCHOR_OTS_ENABLED;
  vi.restoreAllMocks();
});

describe("opentimestamps helpers (offline, pure)", () => {
  it("assembleOtsFile / parseOtsFile round-trip a detached sha256 proof", () => {
    const digestHex = "ab".repeat(32);
    const body = pendingSerialized();
    const file = assembleOtsFile(digestHex, body);
    const parsed = parseOtsFile(file);
    expect(parsed).not.toBeNull();
    expect(parsed!.digestHex).toBe(digestHex);
    expect(bytesToB64(parsed!.serializedTimestamp)).toBe(bytesToB64(body));
  });

  it("parseOtsFile rejects a non-OTS blob", () => {
    expect(parseOtsFile(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("scanAttestations detects pending and bitcoin + block height", () => {
    expect(scanAttestations(pendingSerialized())).toEqual({ bitcoin: false, pending: true });
    const b = scanAttestations(bitcoinSerialized(800123));
    expect(b.bitcoin).toBe(true);
    expect(b.bitcoinBlockHeight).toBe(800123);
  });

  it("parses the frozen timestampProof .ots fixture and matches its digest", () => {
    const tp = vectors.timestampProof;
    const parsed = parseOtsFile(b64ToBytes(tp.otsBase64));
    expect(parsed).not.toBeNull();
    expect(parsed!.digestHex).toBe(tp.digest);
    expect(scanAttestations(parsed!.serializedTimestamp).pending).toBe(true);
  });
});

describe("stampDigest (fetch mocked)", () => {
  it("submits the digest to calendars and assembles a pending .ots", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(pendingSerialized() as unknown as BodyInit, { status: 200 });
    }) as typeof fetch;
    const digestHex = "cd".repeat(32);
    const res = await stampDigest(digestHex);
    expect(res).not.toBeNull();
    expect(seen.every((u) => u.endsWith("/digest"))).toBe(true);
    expect(res!.attestation.pending).toBe(true);
    const parsed = parseOtsFile(b64ToBytes(res!.otsBase64))!;
    expect(parsed.digestHex).toBe(digestHex);
  });

  it("returns null when every calendar fails (best-effort, no throw)", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    expect(await stampDigest("ef".repeat(32))).toBeNull();
  });

  it("returns null when fetch itself throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await stampDigest("ab".repeat(32))).toBeNull();
  });
});

describe("upgradeOts (fetch mocked)", () => {
  it("upgrades a pending proof to a bitcoin attestation", async () => {
    const digestHex = "12".repeat(32);
    const pendingFile = bytesToB64(assembleOtsFile(digestHex, pendingSerialized()));
    globalThis.fetch = (async () =>
      new Response(bitcoinSerialized(800500) as unknown as BodyInit, {
        status: 200,
      })) as typeof fetch;
    const up = await upgradeOts(pendingFile);
    expect(up).not.toBeNull();
    expect(up!.upgraded).toBe(true);
    expect(up!.attestation.bitcoin).toBe(true);
    expect(up!.attestation.bitcoinBlockHeight).toBe(800500);
  });

  it("returns null when still pending (no bitcoin yet)", async () => {
    const digestHex = "34".repeat(32);
    const pendingFile = bytesToB64(assembleOtsFile(digestHex, pendingSerialized()));
    globalThis.fetch = (async () =>
      new Response(pendingSerialized() as unknown as BodyInit, { status: 200 })) as typeof fetch;
    expect(await upgradeOts(pendingFile)).toBeNull();
  });
});

describe("ledger: stampAnchor / readAnchorProofs / upgradeAnchorProof", () => {
  it("anchorDigest is sha256 of the canonical AnchorBody (commits same bytes as HMAC)", async () => {
    const d = await anchorDigest(ANCHOR);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: same body -> same digest.
    expect(await anchorDigest(ANCHOR)).toBe(d);
  });

  it("stampAnchor stamps the anchor digest and persists a pending proof", async () => {
    globalThis.fetch = (async () =>
      new Response(pendingSerialized() as unknown as BodyInit, { status: 200 })) as typeof fetch;
    const proof = await stampAnchor(ANCHOR);
    expect(proof).not.toBeNull();
    expect(proof!.type).toBe("opentimestamps");
    expect(proof!.status).toBe("pending");
    expect(proof!.digest).toBe(await anchorDigest(ANCHOR));
    expect(proof!.digestAlg).toBe("sha256");

    const all = await readAnchorProofs();
    expect(all[ANCHOR.seq]).toBeDefined();
    expect(all[ANCHOR.seq].digest).toBe(proof!.digest);

    const one = await readAnchorProof(ANCHOR.seq);
    expect(one!.otsBase64).toBe(proof!.otsBase64);
  });

  it("stampAnchor returns null (never throws) when calendars are down", async () => {
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await expect(stampAnchor(ANCHOR)).resolves.toBeNull();
    expect(await readAnchorProofs()).toEqual({});
  });

  it("upgradeAnchorProof flips pending -> bitcoin and is idempotent on a final proof", async () => {
    // 1. stamp pending
    globalThis.fetch = (async () =>
      new Response(pendingSerialized() as unknown as BodyInit, { status: 200 })) as typeof fetch;
    await stampAnchor(ANCHOR);

    // 2. upgrade: calendars now return a bitcoin attestation
    globalThis.fetch = (async () =>
      new Response(bitcoinSerialized(801000) as unknown as BodyInit, {
        status: 200,
      })) as typeof fetch;
    const up = await upgradeAnchorProof(ANCHOR.seq);
    expect(up).not.toBeNull();
    expect(up!.status).toBe("bitcoin");
    expect(up!.bitcoinBlockHeight).toBe(801000);
    expect(up!.upgradedAt).toBeTruthy();

    // 3. idempotent: a second upgrade on a final proof does not re-query / change it
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(bitcoinSerialized(999999) as unknown as BodyInit, { status: 200 });
    }) as typeof fetch;
    const again = await upgradeAnchorProof(ANCHOR.seq);
    expect(again!.status).toBe("bitcoin");
    expect(again!.bitcoinBlockHeight).toBe(801000); // unchanged
    expect(calls).toBe(0); // no calendar re-query for an already-final proof
  });

  it("upgradeAnchorProof returns null for an unknown seq", async () => {
    expect(await upgradeAnchorProof(9999)).toBeNull();
  });

  it("upgradeAnchorProof leaves a still-pending proof unchanged (no upgrade available)", async () => {
    globalThis.fetch = (async () =>
      new Response(pendingSerialized() as unknown as BodyInit, { status: 200 })) as typeof fetch;
    await stampAnchor(ANCHOR);
    // calendars still only return pending
    const res = await upgradeAnchorProof(ANCHOR.seq);
    expect(res!.status).toBe("pending");
    expect(res!.upgradedAt).toBeUndefined();
  });

  it("readAnchorProofs returns {} when nothing stamped", async () => {
    expect(await readAnchorProofs()).toEqual({});
  });
});
