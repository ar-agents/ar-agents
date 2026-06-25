/**
 * CMS / PKCS#7 detached-signature verification.
 *
 * The intended use case: the user produces a `firma.p7s` (DER or PEM
 * encoded) detached signature over a document, and we want to check
 * (a) the signature mathematically verifies, (b) the signer cert chain
 * anchors at AR-ONTI.
 *
 * # Limitations
 *
 * - Only RSA-with-SHAxxx is supported (ECDSA is rare in AR Firma
 *   Digital today; can be added when needed).
 * - PAdES-LTV / timestamp-token validation is NOT implemented. For
 *   long-term signatures verify timestamps separately.
 * - This code path uses `node-forge`. The bundle ships ~250KB of
 *   `node-forge` regardless — accepted trade-off for server-side use.
 */

import forge from "node-forge";
import type { ParsedCert, CmsSignatureVerificationResult, ChainVerificationResult } from "./types";
import { FirmaDigitalError } from "./errors";
import { verifyChain } from "./x509";

/**
 * Verify a detached PKCS#7 / CMS signature against a payload.
 *
 * @param signaturePemOrDer The detached signature, PEM or DER (auto-detected).
 * @param payload Bytes the signature was computed over.
 * @param options.verifyChain When true (default), also walks the signer chain
 *   and reports `chainValid` per signer. The trust anchors for the chain
 *   default to the AR ONTI heuristic; pass `trustAnchors` to override.
 */
export function verifyDetachedCmsSignature(
  signaturePemOrDer: string | Uint8Array,
  payload: Uint8Array,
  options: {
    verifyChain?: boolean;
    trustAnchors?: ParsedCert[];
    now?: Date;
  } = {},
): CmsSignatureVerificationResult {
  const wantChain = options.verifyChain ?? true;

  // node-forge's TypeScript surface omits `signers` and `verify()`; we
  // alias to a wider runtime shape. The runtime has them.
  type ForgeP7 = forge.pkcs7.PkcsSignedData & {
    signers: unknown[];
    certificates: forge.pki.Certificate[];
    content: forge.util.ByteBuffer;
    verify: () => boolean;
  };
  let p7: ForgeP7;
  try {
    if (typeof signaturePemOrDer === "string") {
      p7 = forge.pkcs7.messageFromPem(signaturePemOrDer) as unknown as ForgeP7;
    } else {
      const buf = forge.util.createBuffer(uint8ArrayToString(signaturePemOrDer));
      const asn1 = forge.asn1.fromDer(buf);
      p7 = forge.pkcs7.messageFromAsn1(asn1) as unknown as ForgeP7;
    }
  } catch (err) {
    throw new FirmaDigitalError(
      "cms_parse_failed",
      `Could not parse PKCS#7 / CMS message: ${(err as Error).message}`,
      err,
    );
  }

  if (!p7.signers || p7.signers.length === 0) {
    return {
      valid: false,
      reason: "CMS message has no signers.",
      signers: [],
    };
  }

  // forge.pkcs7's `verify()` expects the detached content to be set on the
  // message before calling. The shape it stores is `content` as a util.ByteBuffer.
  // For RSA-only signatures this is enough; ECDSA needs more work.
  p7.content = forge.util.createBuffer(uint8ArrayToString(payload));

  // Verify the message signature once (forge's verify() checks every signerInfo
  // and returns true only if all of them verify against the payload).
  let sigValid = false;
  let sigError: string | null = null;
  try {
    sigValid = p7.verify();
  } catch (err) {
    sigValid = false;
    sigError = (err as Error).message;
  }

  const certs = p7.certificates ?? [];
  const signerResults: CmsSignatureVerificationResult["signers"] = [];
  let allChainsValid = true;

  for (let i = 0; i < p7.signers.length; i++) {
    // Resolve THIS signer's certificate by its IssuerAndSerialNumber, never by
    // array position — array order does not bind a cert to a signerInfo.
    const signer = p7.signers[i] as { serialNumber?: string; issuer?: unknown };
    const signerCertForge = findSignerCert(signer, certs);
    if (!signerCertForge) {
      allChainsValid = false;
      signerResults.push({
        cert: emptyCertStub(),
        ...(wantChain
          ? {
              chainValid: false,
              chainReason:
                "No embedded certificate matches this signer's IssuerAndSerialNumber.",
            }
          : {}),
      });
      continue;
    }
    const signerParsed = parseCertFromForge(signerCertForge);

    let chainValid: boolean | undefined;
    let chainReason: string | undefined;
    if (wantChain) {
      const result = walkSignerChain(signerCertForge, certs, options);
      chainValid = result.valid;
      chainReason = result.reason;
      if (!chainValid) allChainsValid = false;
    }
    signerResults.push({
      cert: signerParsed,
      ...(chainValid !== undefined ? { chainValid } : {}),
      ...(chainReason !== undefined ? { chainReason } : {}),
    });
  }

  // Top-level validity = signature verifies AND (when requested) every signer's
  // chain anchors at a configured trust anchor. A valid signature with an
  // untrusted/missing chain is NOT authentic.
  const valid = sigValid && (!wantChain || allChainsValid);
  if (!valid) {
    const reason = !sigValid
      ? sigError
        ? `Signature does not verify: ${sigError}`
        : "Signature does not verify against the supplied payload."
      : "Signature verifies but signer certificate chain validation failed (see per-signer chainReason).";
    return { valid: false, reason, signers: signerResults };
  }
  return {
    valid: true,
    reason: `All ${signerResults.length} signer(s) verified${wantChain ? " with valid chains" : ""}.`,
    signers: signerResults,
  };
}

/**
 * Resolve a CMS signerInfo to its embedded certificate by IssuerAndSerialNumber.
 * Matching by serial (disambiguated by issuer DN) binds the cert to the signer;
 * array position does NOT. Returns null when no embedded cert matches.
 */
function findSignerCert(
  signer: { serialNumber?: string; issuer?: unknown },
  certs: forge.pki.Certificate[],
): forge.pki.Certificate | null {
  const sn = (signer.serialNumber ?? "").toLowerCase().replace(/^0+/, "");
  if (!sn) return null;
  const matches = certs.filter(
    (c) => (c.serialNumber ?? "").toLowerCase().replace(/^0+/, "") === sn,
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    // Disambiguate same-serial certs by issuer DN (compare attribute sets).
    const want = normalizeDn((signer.issuer ?? []) as forge.pki.CertificateField[]);
    return matches.find((c) => normalizeDn(c.issuer.attributes) === want) ?? null;
  }
  return null;
}

function normalizeDn(attrs: forge.pki.CertificateField[]): string {
  return attrs
    .map((a) => `${a.shortName ?? a.name ?? a.type}=${String(a.value ?? "")}`)
    .sort()
    .join(",");
}

function walkSignerChain(
  signer: forge.pki.Certificate,
  allCerts: forge.pki.Certificate[],
  options: { trustAnchors?: ParsedCert[]; now?: Date },
): ChainVerificationResult {
  // Build a chain by walking issuer-by-subject from the signer.
  const chain: forge.pki.Certificate[] = [signer];
  let current = signer;
  for (let depth = 0; depth < 10; depth++) {
    const issuer = allCerts.find(
      (c) => c !== current && c.subject.hash === current.issuer.hash,
    );
    if (!issuer || issuer === current) break;
    chain.push(issuer);
    current = issuer;
    if (issuer.subject.hash === issuer.issuer.hash) break; // self-signed root reached
  }
  const chainPem = chain.map((c) => forge.pki.certificateToPem(c)).join("\n");
  return verifyChain(chainPem, options);
}

function parseCertFromForge(cert: forge.pki.Certificate): ParsedCert {
  // Convert via PEM round-trip to reuse the existing summarizer in x509.ts
  // without re-implementing summary logic here. Faster than re-parsing
  // because forge already has the structure in memory.
  const pem = forge.pki.certificateToPem(cert);
  // Lazy require to avoid a circular import — the test surface still works.
  // Note: in x509.ts, `parseCert` calls `certificateFromPem` then summarizes;
  // we just call it here. Pulling it through the module index would make
  // circular imports easier to maintain — keep this local for clarity.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseCert } = require("./x509") as typeof import("./x509");
  return parseCert(pem);
}

function emptyCertStub(): ParsedCert {
  return {
    serial: "",
    fingerprintSha256: "",
    subject: {},
    issuer: {},
    notBefore: "",
    notAfter: "",
    isOntiIssued: false,
    isOntiRoot: false,
    publicKey: { algorithm: "other" },
    signatureAlgorithm: { oid: "", name: "" },
  };
}

function uint8ArrayToString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
