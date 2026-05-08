import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  computeCodeChallenge,
  generateCodeVerifier,
  generateRandomToken,
} from "../src";

describe("base64UrlEncode / base64UrlDecode", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128, 64]);
    const round = base64UrlDecode(base64UrlEncode(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });

  it("uses URL-safe alphabet (no +, /, =)", () => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i * 4;
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("decodes inputs with and without padding", () => {
    expect(base64UrlDecode("aGVsbG8")).toEqual(base64UrlDecode("aGVsbG8="));
  });
});

describe("generateCodeVerifier", () => {
  it("returns a string of the expected length range (RFC 7636: 43–128)", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("uses only unreserved-base64url chars", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns different values on each call", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe("computeCodeChallenge", () => {
  it("matches the RFC 7636 worked example", async () => {
    // From RFC 7636 Appendix B:
    //   verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    //   challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await computeCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("returns base64url with no +, /, =", async () => {
    const challenge = await computeCodeChallenge(generateCodeVerifier());
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe("generateRandomToken", () => {
  it("returns 256 bits of entropy by default (~43 chars base64url)", () => {
    const t = generateRandomToken();
    expect(t.length).toBeGreaterThanOrEqual(42);
    expect(t.length).toBeLessThanOrEqual(44);
  });

  it("returns different values on each call", () => {
    const a = generateRandomToken();
    const b = generateRandomToken();
    expect(a).not.toBe(b);
  });
});
