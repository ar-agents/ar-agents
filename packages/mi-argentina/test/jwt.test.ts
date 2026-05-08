import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  decodeJwt,
  IdTokenInvalidError,
  verifyIdToken,
  type JwksDocument,
} from "../src";

/**
 * Generate an RSA-2048 keypair, export the public half to JWK, and return
 * a helper that signs (header, claims) into a compact JWT.
 */
async function makeSigner(kid = "test-key"): Promise<{
  jwks: JwksDocument;
  sign: (header: Record<string, unknown>, claims: Record<string, unknown>) => Promise<string>;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pubJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as Record<
    string,
    unknown
  >;

  const jwks: JwksDocument = {
    keys: [
      {
        kty: "RSA",
        kid,
        alg: "RS256",
        use: "sig",
        n: String(pubJwk["n"]),
        e: String(pubJwk["e"]),
      },
    ],
  };

  return {
    jwks,
    async sign(header, claims) {
      const fullHeader = { alg: "RS256", typ: "JWT", kid, ...header };
      const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullHeader)));
      const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
      const signedInput = new TextEncoder().encode(`${headerB64}.${claimsB64}`);
      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keyPair.privateKey,
        signedInput,
      );
      return `${headerB64}.${claimsB64}.${base64UrlEncode(new Uint8Array(sig))}`;
    },
  };
}

describe("decodeJwt", () => {
  it("throws on non-3-part input", () => {
    expect(() => decodeJwt("a.b")).toThrow(IdTokenInvalidError);
  });

  it("throws on malformed base64 / non-JSON", () => {
    expect(() => decodeJwt("notbase64.notbase64.notbase64")).toThrow(IdTokenInvalidError);
  });
});

describe("verifyIdToken", () => {
  it("verifies a valid RS256 token end-to-end", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "user-1",
        aud: "client-1",
        iat: now,
        exp: now + 600,
        nonce: "nonce-1",
      },
    );
    const result = await verifyIdToken(jwt, jwks, {
      expectedIssuer: "https://issuer.test",
      expectedAudience: "client-1",
      expectedNonce: "nonce-1",
    });
    expect(result.claims.sub).toBe("user-1");
  });

  it("rejects when signature is tampered", async () => {
    const { jwks, sign } = await makeSigner();
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      },
    );
    const tampered = jwt.slice(0, -2) + "AA";
    await expect(
      verifyIdToken(tampered, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("rejects expired tokens", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: now - 3600,
        exp: now - 1800,
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/expired/);
  });

  it("rejects mismatched issuer", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://wrong.test",
        sub: "u",
        aud: "client-1",
        iat: now,
        exp: now + 60,
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/issuer mismatch/);
  });

  it("rejects mismatched audience (string aud)", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "other-client",
        iat: now,
        exp: now + 60,
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/audience mismatch/);
  });

  it("accepts array aud when expected is among entries", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: ["other-client", "client-1"],
        iat: now,
        exp: now + 60,
      },
    );
    const v = await verifyIdToken(jwt, jwks, {
      expectedIssuer: "https://issuer.test",
      expectedAudience: "client-1",
    });
    expect(v.claims.sub).toBe("u");
  });

  it("rejects mismatched nonce", async () => {
    const { jwks, sign } = await makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: now,
        exp: now + 60,
        nonce: "good",
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
        expectedNonce: "bad",
      }),
    ).rejects.toThrow(/nonce mismatch/);
  });

  it("rejects unsupported algorithms", async () => {
    const { jwks, sign } = await makeSigner();
    const jwt = await sign(
      { alg: "HS256" },
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: 0,
        exp: 99999999999,
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/unsupported alg/);
  });

  it("rejects when kid is missing", async () => {
    const { jwks, sign } = await makeSigner();
    const jwt = await sign(
      { kid: "" },
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: 0,
        exp: 99999999999,
      },
    );
    await expect(
      verifyIdToken(jwt, jwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/missing kid/);
  });

  it("rejects when no JWKS key matches kid", async () => {
    const { sign } = await makeSigner("real-kid");
    const otherJwks: JwksDocument = {
      keys: [{ kty: "RSA", kid: "different", alg: "RS256", n: "x", e: "AQAB" }],
    };
    const jwt = await sign(
      {},
      {
        iss: "https://issuer.test",
        sub: "u",
        aud: "client-1",
        iat: 0,
        exp: 99999999999,
      },
    );
    await expect(
      verifyIdToken(jwt, otherJwks, {
        expectedIssuer: "https://issuer.test",
        expectedAudience: "client-1",
      }),
    ).rejects.toThrow(/no JWKS key matches/);
  });
});
