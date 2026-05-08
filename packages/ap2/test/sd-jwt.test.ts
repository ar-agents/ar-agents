import { describe, it, expect } from "vitest";
import {
  encodeDisclosure,
  decodeDisclosure,
  generateSalt,
  digestOfDisclosure,
  parseSdJwt,
  serializeSdJwt,
  computeSdHash,
  resolveDisclosures,
  buildIssuerPayload,
  buildKbJwt,
  verifyKbJwt,
  signCompactJws,
  generateAp2KeyPair,
  base64urlEncode,
  base64urlDecodeToString,
  SdJwtError,
} from "../src";

describe("disclosure encoding", () => {
  it("round-trips an object disclosure", () => {
    const enc = encodeDisclosure({
      salt: "salt_abc",
      name: "amount",
      value: { amount: 19900, currency: "USD" },
    });
    const decoded = decodeDisclosure(enc);
    expect("name" in decoded && decoded.name).toBe("amount");
    if ("name" in decoded) {
      expect(decoded.salt).toBe("salt_abc");
      expect(decoded.value).toEqual({ amount: 19900, currency: "USD" });
    }
  });

  it("round-trips an array disclosure", () => {
    const enc = encodeDisclosure({ salt: "s1", value: { id: "merchant_1" } });
    const decoded = decodeDisclosure(enc);
    expect("name" in decoded).toBe(false);
    if (!("name" in decoded)) {
      expect(decoded.salt).toBe("s1");
      expect(decoded.value).toEqual({ id: "merchant_1" });
    }
  });

  it("rejects a malformed disclosure", () => {
    expect(() => decodeDisclosure(base64urlEncode("not json"))).toThrow();
    // 4-tuple is invalid
    expect(() => decodeDisclosure(base64urlEncode("[1,2,3,4]"))).toThrow();
  });
});

describe("generateSalt", () => {
  it("returns base64url-encoded random bytes", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("digestOfDisclosure", () => {
  it("computes a deterministic sha-256 base64url digest", async () => {
    const enc = encodeDisclosure({ salt: "s", name: "n", value: 1 });
    const d1 = await digestOfDisclosure(enc);
    const d2 = await digestOfDisclosure(enc);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects unsupported algorithms", async () => {
    const enc = encodeDisclosure({ salt: "s", name: "n", value: 1 });
    await expect(digestOfDisclosure(enc, "sha-512")).rejects.toThrow(SdJwtError);
  });
});

describe("parseSdJwt + serializeSdJwt", () => {
  it("parses a presentation with disclosures + KB-JWT", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const issuerJwt = await signCompactJws({ vct: "x" }, privateKey, {
      alg: "ES256",
    });
    const kbJwt = await signCompactJws({ aud: "y" }, privateKey, {
      alg: "ES256",
      typ: "kb+sd-jwt",
    });
    const d1 = base64urlEncode(JSON.stringify(["s1", "name", "v"]));
    const d2 = base64urlEncode(JSON.stringify(["s2", "name", "v"]));
    const presentation = `${issuerJwt}~${d1}~${d2}~${kbJwt}`;
    const parts = parseSdJwt(presentation);
    expect(parts.issuerJwt).toBe(issuerJwt);
    expect(parts.disclosures).toEqual([d1, d2]);
    expect(parts.kbJwt).toBe(kbJwt);
  });

  it("parses a presentation without KB-JWT (trailing ~)", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const issuerJwt = await signCompactJws({ vct: "x" }, privateKey, {
      alg: "ES256",
    });
    const presentation = `${issuerJwt}~`;
    const parts = parseSdJwt(presentation);
    expect(parts.issuerJwt).toBe(issuerJwt);
    expect(parts.disclosures).toEqual([]);
    expect(parts.kbJwt).toBeUndefined();
  });

  it("serializes back to compact form", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const issuerJwt = await signCompactJws({ vct: "x" }, privateKey, {
      alg: "ES256",
    });
    const d1 = base64urlEncode(JSON.stringify(["s1", "n", "v"]));
    const out = serializeSdJwt({
      issuerJwt,
      disclosures: [d1],
      kbJwt: undefined,
    });
    expect(out).toBe(`${issuerJwt}~${d1}~`);
  });

  it("throws when the input has no tilde", () => {
    expect(() => parseSdJwt("just.a.jws")).toThrow(SdJwtError);
  });
});

describe("computeSdHash", () => {
  it("reconstructs the canonical sd_hash input", async () => {
    const issuerJwt = "eyJ.eyJ.signature";
    const d1 = "disclosure_1";
    const d2 = "disclosure_2";
    const sdHash = await computeSdHash({ issuerJwt, disclosures: [d1, d2] });
    expect(sdHash).toMatch(/^[A-Za-z0-9_-]+$/);

    // Same input → same hash.
    const again = await computeSdHash({ issuerJwt, disclosures: [d1, d2] });
    expect(sdHash).toBe(again);
  });

  it("differs when disclosures change", async () => {
    const issuerJwt = "eyJ.eyJ.sig";
    const a = await computeSdHash({ issuerJwt, disclosures: ["a"] });
    const b = await computeSdHash({ issuerJwt, disclosures: ["b"] });
    expect(a).not.toBe(b);
  });
});

describe("buildIssuerPayload + resolveDisclosures", () => {
  it("issuer redacts disclosable paths into _sd digests, resolver materializes them", async () => {
    const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
      payload: {
        constraints: [{ type: "checkout.allowed_merchants", allowed: [] }],
        cnf: { jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" } },
      },
      disclosablePaths: ["constraints"],
      vct: "mandate.checkout.open.1",
    });
    expect(issuerPayload.constraints).toBeUndefined();
    expect(Array.isArray(issuerPayload._sd)).toBe(true);
    expect(issuerPayload._sd_alg).toBe("sha-256");
    expect(encodedDisclosures.length).toBe(1);

    const resolved = await resolveDisclosures(issuerPayload, encodedDisclosures);
    expect(resolved.constraints).toEqual([
      { type: "checkout.allowed_merchants", allowed: [] },
    ]);
    expect(resolved._sd).toBeUndefined();
    expect(resolved._sd_alg).toBeUndefined();
  });

  it("resolver skips undisclosed entries (selective disclosure)", async () => {
    const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
      payload: { a: 1, b: 2 },
      disclosablePaths: ["a", "b"],
      vct: "test.vct",
    });
    expect(encodedDisclosures.length).toBe(2);
    const resolved = await resolveDisclosures(issuerPayload, [encodedDisclosures[0]!]);
    expect(resolved.a).toBe(1);
    expect(resolved.b).toBeUndefined();
  });
});

describe("KB-JWT", () => {
  it("builds and verifies a KB-JWT round-trip", async () => {
    const { privateKey, publicJwk } = await generateAp2KeyPair();
    // Reload public key as CryptoKey for verifier (importPublicJwk).
    const { importPublicJwk } = await import("../src");
    const publicKey = await importPublicJwk(publicJwk, "ES256");
    const sdHash = "abc-sd-hash";
    const kbJwt = await buildKbJwt(privateKey, {
      audience: "merchant",
      nonce: "nonce-1",
      sdHash,
      alg: "ES256",
    });
    const verified = await verifyKbJwt(kbJwt, publicKey, {
      audience: "merchant",
      nonce: "nonce-1",
      sdHash,
    });
    expect(verified.payload.aud).toBe("merchant");
    expect(verified.payload.nonce).toBe("nonce-1");
    expect(verified.payload.sd_hash).toBe(sdHash);
  });

  it("rejects KB-JWT with wrong nonce", async () => {
    const { privateKey, publicJwk } = await generateAp2KeyPair();
    const { importPublicJwk } = await import("../src");
    const publicKey = await importPublicJwk(publicJwk, "ES256");
    const kbJwt = await buildKbJwt(privateKey, {
      audience: "merchant",
      nonce: "nonce-1",
      sdHash: "x",
      alg: "ES256",
    });
    await expect(
      verifyKbJwt(kbJwt, publicKey, {
        audience: "merchant",
        nonce: "DIFFERENT",
        sdHash: "x",
      }),
    ).rejects.toThrow(SdJwtError);
  });

  it("rejects KB-JWT with wrong sd_hash", async () => {
    const { privateKey, publicJwk } = await generateAp2KeyPair();
    const { importPublicJwk } = await import("../src");
    const publicKey = await importPublicJwk(publicJwk, "ES256");
    const kbJwt = await buildKbJwt(privateKey, {
      audience: "merchant",
      nonce: "n",
      sdHash: "expected",
      alg: "ES256",
    });
    await expect(
      verifyKbJwt(kbJwt, publicKey, {
        audience: "merchant",
        nonce: "n",
        sdHash: "DIFFERENT",
      }),
    ).rejects.toThrow(SdJwtError);
  });
});

// Smoke check the base64url helpers stay exported.
describe("public re-exports", () => {
  it("base64url helpers are accessible", () => {
    expect(typeof base64urlEncode).toBe("function");
    expect(typeof base64urlDecodeToString).toBe("function");
  });
});
