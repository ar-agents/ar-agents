import forge from "node-forge";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FirmaDigitalError, parseCert, parseCertChain, verifyChain } from "../src";

/**
 * Test utility — generate an RSA keypair + a self-signed cert, return PEM
 * + the underlying forge cert object so child certs can be signed by it.
 */
function makeSelfSignedCert(opts: {
  cn: string;
  o?: string;
  ou?: string;
  serialNumber?: string;
  notBefore?: Date;
  notAfter?: Date;
  isCa?: boolean;
}): { pem: string; cert: forge.pki.Certificate; keys: forge.pki.rsa.KeyPair } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = opts.notBefore ?? new Date(Date.now() - 60_000);
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs: forge.pki.CertificateField[] = [{ name: "commonName", value: opts.cn }];
  if (opts.o) attrs.push({ name: "organizationName", value: opts.o });
  if (opts.ou) attrs.push({ name: "organizationalUnitName", value: opts.ou });
  // serialNumber attribute uses OID 2.5.4.5 — forge accepts `type` for OIDs.
  if (opts.serialNumber) attrs.push({ type: "2.5.4.5", value: opts.serialNumber });
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  if (opts.isCa) {
    cert.setExtensions([{ name: "basicConstraints", cA: true }]);
  }
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { pem: forge.pki.certificateToPem(cert), cert, keys };
}

function makeChildCert(opts: {
  parent: { cert: forge.pki.Certificate; keys: forge.pki.rsa.KeyPair };
  cn: string;
  o?: string;
  ou?: string;
  serialNumber?: string;
}): { pem: string; cert: forge.pki.Certificate; keys: forge.pki.rsa.KeyPair } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs: forge.pki.CertificateField[] = [{ name: "commonName", value: opts.cn }];
  if (opts.o) attrs.push({ name: "organizationName", value: opts.o });
  if (opts.ou) attrs.push({ name: "organizationalUnitName", value: opts.ou });
  if (opts.serialNumber) attrs.push({ type: "2.5.4.5", value: opts.serialNumber });
  cert.setSubject(attrs);
  cert.setIssuer(opts.parent.cert.subject.attributes);
  cert.sign(opts.parent.keys.privateKey, forge.md.sha256.create());
  return { pem: forge.pki.certificateToPem(cert), cert, keys };
}

describe("parseCert", () => {
  it("parses a self-signed cert with CN, O, OU and serialNumber", () => {
    const { pem } = makeSelfSignedCert({
      cn: "Juan Pérez",
      o: "Sistema Nacional de Firma Digital",
      ou: "AC ONTI",
      serialNumber: "CUIT 20-12345678-6",
    });
    const parsed = parseCert(pem);
    expect(parsed.commonName).toBe("Juan Pérez");
    expect(parsed.subject["O"]).toContain("Firma Digital");
    expect(parsed.subject["OU"]).toBe("AC ONTI");
    expect(parsed.cuit).toBe("20123456786");
    expect(parsed.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.publicKey.algorithm).toBe("RSA");
    expect(parsed.publicKey.bitLength).toBe(2048);
    expect(parsed.signatureAlgorithm.name).toBe("sha256WithRSA");
  });

  it("flags an AR-ONTI-issued cert via subject.O", () => {
    const { pem } = makeSelfSignedCert({
      cn: "leaf",
      o: "Sistema Nacional de Firma Digital",
    });
    const parsed = parseCert(pem);
    expect(parsed.isOntiIssued).toBe(true);
  });

  it("flags an AC-Raíz CN as a root", () => {
    const { pem } = makeSelfSignedCert({
      cn: "Autoridad Certificante Raíz de la República Argentina",
      o: "Sistema Nacional de Firma Digital",
      isCa: true,
    });
    const parsed = parseCert(pem);
    expect(parsed.isOntiRoot).toBe(true);
    expect(parsed.isOntiIssued).toBe(true);
  });

  it("does NOT flag an unrelated cert as ONTI", () => {
    const { pem } = makeSelfSignedCert({ cn: "test", o: "Some Random Org" });
    const parsed = parseCert(pem);
    expect(parsed.isOntiIssued).toBe(false);
    expect(parsed.isOntiRoot).toBe(false);
    expect(parsed.cuit).toBeUndefined();
  });

  it("throws invalid_pem on garbage input", () => {
    expect(() => parseCert("not a pem")).toThrow(FirmaDigitalError);
  });

  it("parseCertChain extracts multiple PEM blocks", () => {
    const a = makeSelfSignedCert({ cn: "a" }).pem;
    const b = makeSelfSignedCert({ cn: "b" }).pem;
    const chain = parseCertChain(`${a}\n${b}`);
    expect(chain).toHaveLength(2);
    expect(chain[0]!.commonName).toBe("a");
    expect(chain[1]!.commonName).toBe("b");
  });

  it("parseCertChain throws when no CERTIFICATE blocks present", () => {
    expect(() => parseCertChain("hello")).toThrow(FirmaDigitalError);
  });
});

describe("verifyChain", () => {
  it("validates a leaf → root chain when issuer signs subject", () => {
    const root = makeSelfSignedCert({
      cn: "Autoridad Certificante Raíz",
      o: "Sistema Nacional de Firma Digital",
      isCa: true,
    });
    const leaf = makeChildCert({ parent: root, cn: "Empresa Cliente", o: "ACME SA" });
    const chain = `${leaf.pem}\n${root.pem}`;
    // valid:true now REQUIRES a pinned trust anchor (not a name heuristic).
    const r = verifyChain(chain, { trustAnchors: [parseCert(root.pem)] });
    expect(r.valid).toBe(true);
    expect(r.trace.length).toBe(2);
    expect(r.anchor?.commonName).toBe("Autoridad Certificante Raíz");
  });

  it("REJECTS an AR-ONTI-looking self-signed root that is not a pinned anchor (forgeable-DN bypass closed)", () => {
    const root = makeSelfSignedCert({
      cn: "Autoridad Certificante Raíz",
      o: "Sistema Nacional de Firma Digital",
      isCa: true,
    });
    const leaf = makeChildCert({ parent: root, cn: "Empresa Cliente" });
    // No trustAnchors; the legacy acceptArOntiRoot flag must NOT grant trust.
    const r = verifyChain(`${leaf.pem}\n${root.pem}`, { acceptArOntiRoot: true });
    expect(r.valid).toBe(false);
    expect(r.looksLikeArRoot).toBe(true); // informational classification only
    expect(r.reason).toMatch(/name heuristic|trustAnchors|untrusted/i);
  });

  it("rejects a chain where a non-CA cert signs another cert", () => {
    const root = makeSelfSignedCert({ cn: "Root CA", isCa: true });
    const intermediate = makeChildCert({ parent: root, cn: "Intermediate (not a CA)" });
    const leaf = makeChildCert({ parent: intermediate, cn: "leaf" });
    const r = verifyChain(`${leaf.pem}\n${intermediate.pem}\n${root.pem}`, {
      trustAnchors: [parseCert(root.pem)],
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not a valid CA|basicConstraints|keyCertSign/i);
  });

  it("rejects a chain whose cert uses a weak (SHA-1) signature algorithm", () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const attrs: forge.pki.CertificateField[] = [{ name: "commonName", value: "SHA1 Root" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{ name: "basicConstraints", cA: true }]);
    cert.sign(keys.privateKey, forge.md.sha1.create()); // weak
    const pem = forge.pki.certificateToPem(cert);
    const r = verifyChain(pem, { trustAnchors: [parseCert(pem)] });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/weak|disallowed|algorithm/i);
  });

  it("rejects a chain with mismatched issuer DN", () => {
    const root1 = makeSelfSignedCert({ cn: "Root1", isCa: true });
    const root2 = makeSelfSignedCert({ cn: "Root2", isCa: true });
    const leafSignedByRoot1 = makeChildCert({ parent: root1, cn: "leaf" });
    const wrongChain = `${leafSignedByRoot1.pem}\n${root2.pem}`;
    const r = verifyChain(wrongChain);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/(Issuer DN|does not match|not a recognized)/i);
  });

  it("rejects when the chain root is unknown and not AR-ONTI-looking", () => {
    const root = makeSelfSignedCert({ cn: "Some Random Root", isCa: true });
    const leaf = makeChildCert({ parent: root, cn: "leaf" });
    const r = verifyChain(`${leaf.pem}\n${root.pem}`, { acceptArOntiRoot: true });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not in trust store|not recognized|trust anchor/i);
  });

  it("accepts a configured trust anchor by fingerprint", () => {
    const root = makeSelfSignedCert({ cn: "Custom Trusted Root", isCa: true });
    const leaf = makeChildCert({ parent: root, cn: "leaf" });
    const rootParsed = parseCert(root.pem);
    const r = verifyChain(`${leaf.pem}\n${root.pem}`, { trustAnchors: [rootParsed] });
    expect(r.valid).toBe(true);
    expect(r.anchor?.fingerprintSha256).toBe(rootParsed.fingerprintSha256);
  });

  it("rejects an expired leaf", () => {
    const root = makeSelfSignedCert({
      cn: "Autoridad Certificante Raíz",
      o: "Sistema Nacional de Firma Digital",
      isCa: true,
    });
    const leaf = makeChildCert({ parent: root, cn: "old leaf" });
    // verifyChain with a future "now" past leaf.validity.notAfter
    const future = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    const r = verifyChain(`${leaf.pem}\n${root.pem}`, { now: future });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });

  it("returns a structured trace per cert", () => {
    const root = makeSelfSignedCert({
      cn: "Autoridad Certificante Raíz",
      o: "Sistema Nacional de Firma Digital",
      isCa: true,
    });
    const leaf = makeChildCert({ parent: root, cn: "leaf" });
    const r = verifyChain(`${leaf.pem}\n${root.pem}`);
    expect(r.trace[0]!.cert.commonName).toBe("leaf");
    expect(r.trace[0]!.verified).toBe(true);
    expect(r.trace[1]!.cert.commonName).toContain("Autoridad");
  });

  it("returns an empty trace + reason when input has no PEM blocks", () => {
    const r = verifyChain("hello");
    expect(r.valid).toBe(false);
    expect(r.trace).toEqual([]);
  });
});
