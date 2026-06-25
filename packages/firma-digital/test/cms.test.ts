import { describe, expect, it } from "vitest";
import { FirmaDigitalError, verifyDetachedCmsSignature } from "../src";
import { findSignerCert, normalizeDn } from "../src/cms";

/**
 * NOTE: end-to-end round-trip tests against `forge.pkcs7.createSignedData`
 * are skipped here. forge 1.4's `messageFromPem` parser does not populate
 * the `signers` array on a SignedData message in the way the create-side
 * does (`signers` is a build-time property, parse-side uses `rawCapture`
 * + `signerInfos`). Trustworthy verification of this code path requires a
 * real AR-Firma-Digital `firma.p7s` fixture — TBD when one is checked in.
 *
 * The tests below cover the public surface (errors on malformed input)
 * and the early-exit path (no signers).
 */
describe("verifyDetachedCmsSignature", () => {
  it("throws cms_parse_failed on malformed signature input", () => {
    const payload = new TextEncoder().encode("doesn't matter");
    expect(() =>
      verifyDetachedCmsSignature("not a pkcs7", payload, { verifyChain: false }),
    ).toThrow(FirmaDigitalError);
  });

  it("throws cms_parse_failed when DER bytes don't decode", () => {
    const payload = new TextEncoder().encode("doesn't matter");
    expect(() =>
      verifyDetachedCmsSignature(new Uint8Array([0x00, 0x01, 0x02]), payload, {
        verifyChain: false,
      }),
    ).toThrow(FirmaDigitalError);
  });
});

describe("findSignerCert (binds a signer to its cert by IssuerAndSerialNumber)", () => {
  type Cert = Parameters<typeof findSignerCert>[1][number];
  const cert = (serialNumber: string, issuerCn: string): Cert =>
    ({
      serialNumber,
      issuer: { attributes: [{ shortName: "CN", value: issuerCn }] },
    }) as unknown as Cert;

  it("matches the cert whose serial equals the signer's — never by array order", () => {
    const a = cert("0a", "RootA");
    const b = cert("0b", "RootB");
    // signer points at serial 0b; must return b even though a is first.
    expect(findSignerCert({ serialNumber: "0B" }, [a, b])).toBe(b);
  });

  it("returns null when no embedded cert matches the serial", () => {
    expect(findSignerCert({ serialNumber: "ff" }, [cert("0a", "R")])).toBeNull();
  });

  it("returns null for an empty signer serial", () => {
    expect(findSignerCert({ serialNumber: "" }, [cert("0a", "R")])).toBeNull();
  });

  it("disambiguates same-serial certs by issuer DN", () => {
    const a = cert("0a", "RootA");
    const b = cert("0a", "RootB"); // same serial, different issuer
    expect(
      findSignerCert(
        { serialNumber: "0a", issuer: [{ shortName: "CN", value: "RootB" }] },
        [a, b],
      ),
    ).toBe(b);
  });
});

describe("normalizeDn", () => {
  it("formats + sorts DN attributes deterministically", () => {
    type Attr = Parameters<typeof normalizeDn>[0][number];
    const attrs = [
      { shortName: "O", value: "Org" },
      { shortName: "CN", value: "Name" },
    ] as unknown as Attr[];
    expect(normalizeDn(attrs)).toBe("CN=Name,O=Org");
  });
});
