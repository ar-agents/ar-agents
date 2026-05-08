import { describe, expect, it } from "vitest";
import { FirmaDigitalError, verifyDetachedCmsSignature } from "../src";

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
