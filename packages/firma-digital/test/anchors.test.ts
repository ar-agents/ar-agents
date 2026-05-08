import { describe, expect, it } from "vitest";
import { looksLikeArFirmaDigitalIssuer, looksLikeArRoot } from "../src";
import type { ParsedCert } from "../src";

function cert(overrides: Partial<ParsedCert>): ParsedCert {
  return {
    serial: "01",
    fingerprintSha256: "x",
    subject: {},
    issuer: {},
    notBefore: "2025-01-01T00:00:00Z",
    notAfter: "2027-01-01T00:00:00Z",
    isOntiIssued: false,
    isOntiRoot: false,
    publicKey: { algorithm: "RSA", bitLength: 2048 },
    signatureAlgorithm: { oid: "1.2.840.113549.1.1.11", name: "sha256WithRSA" },
    ...overrides,
  };
}

describe("looksLikeArFirmaDigitalIssuer", () => {
  it.each([
    [{ O: "Sistema Nacional de Firma Digital" }],
    [{ OU: "AC ONTI" }],
    [{ O: "ANSES Autoridad Certificante" }],
  ])("matches %j", (issuer) => {
    expect(looksLikeArFirmaDigitalIssuer(cert({ issuer }))).toBe(true);
  });

  it("does NOT match unrelated CAs", () => {
    expect(looksLikeArFirmaDigitalIssuer(cert({ issuer: { O: "Let's Encrypt" } }))).toBe(false);
  });

  it("matches against subject too (when issuer fields are empty)", () => {
    expect(looksLikeArFirmaDigitalIssuer(cert({ subject: { O: "ONTI" } }))).toBe(true);
  });
});

describe("looksLikeArRoot", () => {
  it("matches typical AC-Raíz CNs", () => {
    expect(looksLikeArRoot(cert({ commonName: "Autoridad Certificante Raíz de la República Argentina" }))).toBe(true);
    expect(looksLikeArRoot(cert({ subject: { CN: "AC RAIZ ARGENTINA" } }))).toBe(true);
  });

  it("does not match a leaf cert", () => {
    expect(looksLikeArRoot(cert({ commonName: "Juan Pérez" }))).toBe(false);
  });
});
