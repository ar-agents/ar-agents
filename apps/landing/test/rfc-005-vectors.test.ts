/**
 * RFC-005 v1 conformance test suite.
 *
 * Proves the Ed25519 sign + verify implementation in
 * apps/landing/src/lib/ed25519.ts produces the exact byte-for-byte
 * signatures listed in /public/test-vectors/rfc-005-v1.json.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  signEntryAsymmetric,
  verifyEntryAsymmetric,
  type Ed25519Signature,
} from "../src/lib/ed25519";
import type { AuditEntry } from "../src/lib/audit";

interface VectorsFile {
  spec: string;
  version: string;
  publishedAt: string;
  keypair: {
    keyId: string;
    alg: "ed25519";
    publicKey: string;
    privateKey: string;
  };
  vectors: Array<{
    id: string;
    description: string;
    entry: Omit<AuditEntry, "hmac"> & { signature?: Ed25519Signature };
    expectedSignature: Ed25519Signature;
    mustDifferFrom?: string;
  }>;
}

const vectorsPath = resolve(
  __dirname,
  "../public/test-vectors/rfc-005-v1.json",
);
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorsFile;

describe("RFC-005 v1 conformance, Ed25519 reference implementation", () => {
  it("loads the vectors file", () => {
    expect(vectors.spec).toBe("https://ar-agents.ar/rfcs/005");
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(3);
    expect(vectors.keypair.alg).toBe("ed25519");
  });

  it("vector-1: signing the base entry produces the expected signature", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-1-base-entry")!;
    const sig = await signEntryAsymmetric(
      v.entry,
      vectors.keypair.keyId,
      vectors.keypair.privateKey,
    );
    expect(sig).not.toBeNull();
    expect(sig!.alg).toBe("ed25519");
    expect(sig!.keyId).toBe(vectors.keypair.keyId);
    expect(sig!.value).toBe(v.expectedSignature.value);
  });

  it("vector-2: deeply-nested input produces the expected signature", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-2-nested-input")!;
    const sig = await signEntryAsymmetric(
      v.entry,
      vectors.keypair.keyId,
      vectors.keypair.privateKey,
    );
    expect(sig!.value).toBe(v.expectedSignature.value);
  });

  it("vector-3: mutation produces a different signature", async () => {
    const v1 = vectors.vectors.find((x) => x.id === "vector-1-base-entry")!;
    const v3 = vectors.vectors.find((x) => x.id === "vector-3-mutated-must-differ")!;
    const sig1 = await signEntryAsymmetric(
      v1.entry,
      vectors.keypair.keyId,
      vectors.keypair.privateKey,
    );
    const sig3 = await signEntryAsymmetric(
      v3.entry,
      vectors.keypair.keyId,
      vectors.keypair.privateKey,
    );
    expect(sig3!.value).toBe(v3.expectedSignature.value);
    expect(sig3!.value).not.toBe(sig1!.value);
  });

  it("verifyEntryAsymmetric round-trip: signed entry verifies, mutated does not", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-1-base-entry")!;
    const sig = await signEntryAsymmetric(
      v.entry,
      vectors.keypair.keyId,
      vectors.keypair.privateKey,
    );
    const signedEntry = { ...v.entry, hmac: null, signature: sig } as AuditEntry & {
      signature: Ed25519Signature;
    };
    expect(await verifyEntryAsymmetric(signedEntry, vectors.keypair.publicKey)).toBe(true);

    const mutated = { ...signedEntry, output: { pong: 999 } } as typeof signedEntry;
    expect(await verifyEntryAsymmetric(mutated, vectors.keypair.publicKey)).toBe(false);
  });

  it("without a private key, signEntryAsymmetric returns null", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-1-base-entry")!;
    // Call without privateKeyPkcs8B64url override + with env unset.
    const saved = process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    try {
      const sig = await signEntryAsymmetric(v.entry, vectors.keypair.keyId);
      expect(sig).toBeNull();
    } finally {
      if (saved !== undefined) process.env.AUDIT_ED25519_PRIVATE_KEY = saved;
    }
  });

  it("env-driven sign matches explicit-arg sign", async () => {
    const v = vectors.vectors.find((x) => x.id === "vector-1-base-entry")!;
    const saved = process.env.AUDIT_ED25519_PRIVATE_KEY;
    process.env.AUDIT_ED25519_PRIVATE_KEY = vectors.keypair.privateKey;
    try {
      const sig = await signEntryAsymmetric(v.entry, vectors.keypair.keyId);
      expect(sig!.value).toBe(v.expectedSignature.value);
    } finally {
      if (saved === undefined) delete process.env.AUDIT_ED25519_PRIVATE_KEY;
      else process.env.AUDIT_ED25519_PRIVATE_KEY = saved;
    }
  });
});
