import { beforeAll, describe, expect, it } from "vitest";
import {
  buildConstanciaAttestation,
  verifyConstanciaAttestation,
  type AttestationKeys,
} from "../src/lib/constancia-attestation";

const CUIT = "20123456786"; // fictional 20-12345678-6

function b64url(buf: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(buf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let keys: AttestationKeys;

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pk8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const spki = await crypto.subtle.exportKey("spki", kp.publicKey);
  keys = {
    privateKeyPkcs8B64url: b64url(pk8),
    publicKeySpkiB64url: b64url(spki),
    keyId: "test-key-1",
  };
});

describe("constancia attestation", () => {
  it("round-trips: a freshly built attestation verifies", async () => {
    const att = await buildConstanciaAttestation({
      cuit: CUIT,
      checkDigitValid: true,
      issuedAt: "2026-07-01T00:00:00.000Z",
      keys,
    });
    expect(att).not.toBeNull();
    const v = await verifyConstanciaAttestation(att!);
    expect(v.valid).toBe(true);
    expect(v.keyId).toBe("test-key-1");
    expect(att!.body.checkDigit).toEqual({ valid: true, algorithm: "mod-11" });
    expect(att!.body.personType).toBe("fisica");
  });

  it("free tier is honest: no goodStanding field, statement says nothing fiscal", async () => {
    const att = await buildConstanciaAttestation({
      cuit: CUIT,
      checkDigitValid: true,
      goodStanding: null,
      keys,
    });
    expect(att!.body.goodStanding).toBeUndefined();
    expect(att!.body.statement).not.toMatch(/ARCA/);
    expect(att!.body.statement).toContain("dígito verificador");
    expect(await verifyConstanciaAttestation(att!)).toMatchObject({ valid: true });
  });

  it("premium tier: signs the real verdict and names it in the statement", async () => {
    const att = await buildConstanciaAttestation({
      cuit: CUIT,
      checkDigitValid: true,
      goodStanding: {
        source: "padron-soap",
        condicion: "monotributo",
        denominacion: "PEREZ JUAN",
      },
      keys,
    });
    expect(att!.body.goodStanding).toMatchObject({
      source: "padron-soap",
      condicion: "monotributo",
    });
    expect(att!.body.statement).toContain("ARCA");
    expect(await verifyConstanciaAttestation(att!)).toMatchObject({ valid: true });
  });

  it("is tamper-evident: mutating the signed claim fails verification", async () => {
    const att = await buildConstanciaAttestation({
      cuit: CUIT,
      checkDigitValid: true,
      keys,
    });
    // Flip the very thing the signature is supposed to protect.
    const tampered = {
      ...att!,
      body: {
        ...att!.body,
        checkDigit: { ...att!.body.checkDigit, valid: false },
      },
    };
    const v = await verifyConstanciaAttestation(tampered);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("signature_invalid");
  });

  it("rejects a wrong-kind body", async () => {
    const att = await buildConstanciaAttestation({
      cuit: CUIT,
      checkDigitValid: true,
      keys,
    });
    const wrong = {
      ...att!,
      body: { ...att!.body, kind: "something.else" as never },
    };
    expect(await verifyConstanciaAttestation(wrong)).toMatchObject({
      valid: false,
      reason: "wrong_kind",
    });
  });

  it("returns null when no signing key is configured", async () => {
    const prevPub = process.env.AUDIT_ED25519_PUBLIC_KEY;
    const prevPriv = process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    try {
      const att = await buildConstanciaAttestation({
        cuit: CUIT,
        checkDigitValid: true,
      });
      expect(att).toBeNull();
    } finally {
      if (prevPub !== undefined) process.env.AUDIT_ED25519_PUBLIC_KEY = prevPub;
      if (prevPriv !== undefined) process.env.AUDIT_ED25519_PRIVATE_KEY = prevPriv;
    }
  });
});
