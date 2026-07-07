import { describe, it, expect } from "vitest";
import {
  base64urlEncode,
  base64urlDecode,
  base64urlDecodeToString,
  sha256,
  sha256Base64url,
  generateAp2KeyPair,
  signCompactJws,
  verifyCompactJws,
  decodeJwsUnverified,
  importPublicJwk,
  AP2_ALGS,
  NON_DETERMINISTIC_ALGS,
  SdJwtError,
} from "../src";

describe("base64url helpers", () => {
  it("encodes and decodes a string round-trip", () => {
    const s = "hello world";
    const enc = base64urlEncode(s);
    expect(enc).not.toContain("+");
    expect(enc).not.toContain("/");
    expect(enc).not.toContain("=");
    expect(base64urlDecodeToString(enc)).toBe(s);
  });

  it("encodes and decodes Uint8Array round-trip", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
    const enc = base64urlEncode(bytes);
    expect(Array.from(base64urlDecode(enc))).toEqual(Array.from(bytes));
  });
});

describe("sha256 + sha256Base64url", () => {
  it("computes SHA-256 of an empty string", async () => {
    const enc = await sha256Base64url("");
    // Known value: SHA-256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(enc).toBe("47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU");
  });

  it("computes deterministic hashes for given input", async () => {
    const a = await sha256Base64url("hello");
    const b = await sha256Base64url("hello");
    expect(a).toBe(b);
  });

  it("produces 32-byte digest", async () => {
    const bytes = await sha256("hello");
    expect(bytes.byteLength).toBe(32);
  });
});

describe("generateAp2KeyPair", () => {
  it("generates an ES256 key pair by default", async () => {
    const { publicJwk, alg } = await generateAp2KeyPair();
    expect(alg).toBe("ES256");
    expect(publicJwk.kty).toBe("EC");
    if (publicJwk.kty === "EC") expect(publicJwk.crv).toBe("P-256");
  });

  it("supports EdDSA for KB-JWT signing", async () => {
    const { publicJwk, alg } = await generateAp2KeyPair("EdDSA");
    expect(alg).toBe("EdDSA");
    expect(publicJwk.kty).toBe("OKP");
  });
});

describe("signCompactJws + verifyCompactJws", () => {
  it("signs and verifies a JWT round-trip", async () => {
    const { privateKey, publicKey } = await generateAp2KeyPair();
    const jws = await signCompactJws(
      { sub: "naza", iat: 1717000000 },
      privateKey,
      { alg: "ES256", typ: "JWT" },
    );
    expect(jws.split(".").length).toBe(3);
    const verified = await verifyCompactJws(jws, publicKey);
    expect(verified.payload.sub).toBe("naza");
    expect(verified.protectedHeader.alg).toBe("ES256");
    expect(verified.protectedHeader.typ).toBe("JWT");
  });

  it("rejects a JWS signed by a different key", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const { publicKey: otherPublicKey } = await generateAp2KeyPair();
    const jws = await signCompactJws({ sub: "x" }, privateKey, { alg: "ES256" });
    await expect(verifyCompactJws(jws, otherPublicKey)).rejects.toThrow();
  });

  it("respects custom audience and issuer claims", async () => {
    const { privateKey, publicKey } = await generateAp2KeyPair();
    const jws = await signCompactJws(
      { iss: "merchant", aud: "agent", sub: "x" },
      privateKey,
      { alg: "ES256" },
    );
    const ok = await verifyCompactJws(jws, publicKey, {
      audience: "agent",
      issuer: "merchant",
    });
    expect(ok.payload.sub).toBe("x");
    await expect(
      verifyCompactJws(jws, publicKey, { audience: "wrong-aud" }),
    ).rejects.toThrow();
  });
});

describe("decodeJwsUnverified", () => {
  it("returns header + payload without verifying signature", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const jws = await signCompactJws(
      { foo: "bar" },
      privateKey,
      { alg: "ES256", typ: "kb+sd-jwt" },
    );
    const decoded = decodeJwsUnverified(jws);
    expect(decoded.protectedHeader.alg).toBe("ES256");
    expect(decoded.protectedHeader.typ).toBe("kb+sd-jwt");
    expect(decoded.payload.foo).toBe("bar");
  });

  it("throws on malformed JWS", () => {
    expect(() => decodeJwsUnverified("not.a.jws.too.many.dots")).toThrow();
    expect(() => decodeJwsUnverified("only.two")).toThrow();
  });

  it("throws the typed SdJwtError (not a raw SyntaxError) on a non-JSON header", () => {
    const header = base64urlEncode("this is not json");
    const payload = base64urlEncode(JSON.stringify({ ok: true }));
    const err = tryCatch(() => decodeJwsUnverified(`${header}.${payload}.sig`));
    expect(err).toBeInstanceOf(SdJwtError);
    expect(String(err)).toMatch(/protected header/);
  });

  it("throws the typed SdJwtError (not a raw SyntaxError) on a non-JSON payload", () => {
    const header = base64urlEncode(JSON.stringify({ alg: "ES256" }));
    const payload = base64urlEncode("still not json");
    const err = tryCatch(() => decodeJwsUnverified(`${header}.${payload}.sig`));
    expect(err).toBeInstanceOf(SdJwtError);
    expect(String(err)).toMatch(/payload/);
  });

  it("throws the typed SdJwtError on segments that are not valid base64url at all", () => {
    const err = tryCatch(() => decodeJwsUnverified("!!!.???.sig"));
    expect(err).toBeInstanceOf(SdJwtError);
  });
});

function tryCatch(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err;
  }
}

describe("importPublicJwk", () => {
  it("imports a generated public JWK and verifies a signature with it", async () => {
    const { privateKey, publicJwk } = await generateAp2KeyPair();
    const jws = await signCompactJws(
      { hello: "world" },
      privateKey,
      { alg: "ES256" },
    );
    const importedPublic = await importPublicJwk(publicJwk, "ES256");
    const ok = await verifyCompactJws(jws, importedPublic);
    expect(ok.payload.hello).toBe("world");
  });
});

describe("constants", () => {
  it("AP2_ALGS contains ES256 + ES384 + ES512 + RS256 + EdDSA", () => {
    expect(AP2_ALGS).toEqual(["ES256", "ES384", "ES512", "RS256", "EdDSA"]);
  });

  it("NON_DETERMINISTIC_ALGS excludes EdDSA", () => {
    expect(NON_DETERMINISTIC_ALGS).not.toContain("EdDSA");
    expect(NON_DETERMINISTIC_ALGS).toContain("ES256");
  });
});
