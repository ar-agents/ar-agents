import forge from "node-forge";

/**
 * Generate a self-signed cert + key pair for testing PKCS#7 signing locally.
 * This is NOT registered with AFIP — it's only for verifying the CMS-signing
 * machinery works end-to-end against `node-forge`.
 */
export function generateTestCertAndKey(): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: "commonName", value: "ar-agents-test" },
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: "Test" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}
