/**
 * X.509 certificate parsing and chain verification using `node-forge`.
 *
 * # Why node-forge
 *
 * Web Crypto can verify RSA signatures but doesn't parse X.509 certs
 * directly. `node-forge` does the ASN.1 + DN flattening that this lib
 * needs. Bundle size: ~250KB unminified. We treat that as acceptable
 * given this lib runs server-side (verifying signed contratos
 * societarios is not a hot-path browser concern).
 */

import forge from "node-forge";
import { looksLikeArFirmaDigitalIssuer, looksLikeArRoot } from "./anchors";
import { FirmaDigitalError } from "./errors";
import type { ChainVerificationResult, ParsedCert } from "./types";

/**
 * Parse a single PEM-encoded certificate into a `ParsedCert`.
 *
 * Throws `FirmaDigitalError("invalid_pem" | "cert_parse_failed")` on bad
 * input.
 */
export function parseCert(pem: string): ParsedCert {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(pem);
  } catch (err) {
    if (/PEM/i.test(String(err))) {
      throw new FirmaDigitalError("invalid_pem", "Input is not a valid PEM-encoded certificate.", err);
    }
    throw new FirmaDigitalError(
      "cert_parse_failed",
      `Could not parse X.509 certificate: ${(err as Error).message}`,
      err,
    );
  }
  return summarize(cert);
}

/** Parse a stack of PEM-encoded certs concatenated in one string. */
export function parseCertChain(pemBundle: string): ParsedCert[] {
  const blocks = pemBundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks) {
    throw new FirmaDigitalError("invalid_pem", "No PEM CERTIFICATE blocks found in input.");
  }
  return blocks.map(parseCert);
}

/**
 * Walk a chain leaf → root, verifying each cert was signed by the next.
 * Anchored either via a `TrustStore` (caller-provided) or via the
 * built-in AR ONTI heuristics.
 *
 * - Verifies issuer-by-subject linking and signature.
 * - Verifies validity dates against `now` (caller may override).
 * - Returns a per-cert trace explaining the decision.
 */
export function verifyChain(
  chainPem: string,
  options: {
    trustAnchors?: ParsedCert[];
    /** ISO 8601 reference time. Defaults to `new Date()`. */
    now?: Date;
    /**
     * @deprecated SECURITY no-op. A DN name heuristic must never establish
     * trust (DN strings are forgeable). This flag no longer grants validity:
     * `valid:true` always requires a configured `trustAnchors` fingerprint
     * match. The result's `looksLikeArRoot` is set for triage only.
     */
    acceptArOntiRoot?: boolean;
  } = {},
): ChainVerificationResult {
  const now = options.now ?? new Date();

  let forgeChain: forge.pki.Certificate[];
  try {
    const blocks = chainPem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    if (!blocks) {
      return {
        valid: false,
        reason: "No PEM CERTIFICATE blocks found in input.",
        trace: [],
      };
    }
    forgeChain = blocks.map((b) => forge.pki.certificateFromPem(b));
  } catch (err) {
    return {
      valid: false,
      reason: `Could not parse chain: ${(err as Error).message}`,
      trace: [],
    };
  }

  const summarized = forgeChain.map(summarize);
  const trace: ChainVerificationResult["trace"] = [];

  // Reject weak signature algorithms (SHA-1/MD5-era) anywhere in the chain.
  for (let i = 0; i < forgeChain.length; i++) {
    const oid = forgeChain[i]!.signatureOid ?? "";
    if (!STRONG_SIG_OIDS.has(oid)) {
      const note = `cert[${i}] uses a disallowed/weak signature algorithm (${oidToFriendlyName(oid)}).`;
      trace.push({ cert: summarized[i]!, verified: false, note });
      return { valid: false, reason: note, trace };
    }
  }

  // Validity window check.
  for (let i = 0; i < forgeChain.length; i++) {
    const cert = forgeChain[i]!;
    const parsed = summarized[i]!;
    const validFrom = cert.validity.notBefore.getTime();
    const validTo = cert.validity.notAfter.getTime();
    const t = now.getTime();
    if (t < validFrom) {
      trace.push({ cert: parsed, verified: false, note: "Cert not yet valid (notBefore in the future)." });
      return { valid: false, reason: trace[trace.length - 1]!.note, trace };
    }
    if (t > validTo) {
      trace.push({ cert: parsed, verified: false, note: "Cert expired (notAfter in the past)." });
      return { valid: false, reason: trace[trace.length - 1]!.note, trace };
    }
  }

  // Issuer-signs-subject walk.
  for (let i = 0; i < forgeChain.length - 1; i++) {
    const subject = forgeChain[i]!;
    const issuer = forgeChain[i + 1]!;
    if (!subject.issuer.hash || subject.issuer.hash !== issuer.subject.hash) {
      const note = `Issuer DN of cert[${i}] does not match subject of cert[${i + 1}].`;
      trace.push({ cert: summarized[i]!, verified: false, note });
      return { valid: false, reason: note, trace };
    }
    // The signing cert MUST be a CA (basicConstraints cA + keyCertSign): an
    // end-entity certificate may never sign another certificate.
    if (!isCaCert(issuer)) {
      const note = `cert[${i + 1}] is not a valid CA (needs basicConstraints cA + keyCertSign) yet signs cert[${i}].`;
      trace.push({ cert: summarized[i + 1]!, verified: false, note });
      return { valid: false, reason: note, trace };
    }
    let verified = false;
    try {
      verified = issuer.verify(subject);
    } catch {
      verified = false;
    }
    if (!verified) {
      const note = `Signature of cert[${i}] does NOT verify against issuer cert[${i + 1}] public key.`;
      trace.push({ cert: summarized[i]!, verified: false, note });
      return { valid: false, reason: note, trace };
    }
    trace.push({
      cert: summarized[i]!,
      verified: true,
      note: `Signed by cert[${i + 1}] (${issuer.subject.getField("CN")?.value ?? "no CN"}).`,
    });
  }

  // Anchor — the last cert MUST match a CONFIGURED trust anchor (pinned by
  // SHA-256 fingerprint). A DN name heuristic NEVER establishes trust.
  const root = forgeChain[forgeChain.length - 1]!;
  const rootParsed = summarized[summarized.length - 1]!;
  const heuristicRoot = rootParsed.isOntiRoot || looksLikeArRoot(rootParsed);
  const anchorMatch = (options.trustAnchors ?? []).find(
    (a) => a.fingerprintSha256 === rootParsed.fingerprintSha256,
  );
  if (anchorMatch) {
    trace.push({
      cert: rootParsed,
      verified: true,
      note: "Root matches a configured trust anchor (pinned fingerprint).",
    });
    return {
      valid: true,
      reason: "Chain valid against configured trust store.",
      anchor: anchorMatch,
      looksLikeArRoot: heuristicRoot,
      trace,
    };
  }
  // No configured anchor: the root is UNTRUSTED regardless of how its DN looks.
  let selfSigned = false;
  try {
    selfSigned = root.verify(root);
  } catch {
    selfSigned = false;
  }
  const note = selfSigned
    ? heuristicRoot
      ? "Root is self-signed and its DN looks like an AR ONTI / AC-Raíz root, but a name heuristic cannot establish trust (DN strings are forgeable). Pin the AC-Raíz SHA-256 fingerprint via trustAnchors to validate."
      : "Root is self-signed and does NOT match any configured trust anchor — untrusted. Provide the issuing root via trustAnchors."
    : "Root cert is not self-signed and not in the trust store (chain is incomplete or untrusted).";
  trace.push({ cert: rootParsed, verified: false, note });
  return { valid: false, reason: note, looksLikeArRoot: heuristicRoot, trace };
}

/** Convert a forge.pki.Certificate into the public ParsedCert shape. */
function summarize(cert: forge.pki.Certificate): ParsedCert {
  const subject = flattenDn(cert.subject);
  const issuer = flattenDn(cert.issuer);

  const cn = subject["CN"];
  const cuit = extractCuit(subject);

  const fingerprintSha256 = sha256Hex(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

  const publicKeyInfo = describePublicKey(cert.publicKey);
  const sigOid = cert.signatureOid ?? "";

  const out: ParsedCert = {
    serial: cert.serialNumber,
    fingerprintSha256,
    subject,
    issuer,
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    isOntiIssued: false, // filled below
    isOntiRoot: false, // filled below
    publicKey: publicKeyInfo,
    signatureAlgorithm: { oid: sigOid, name: oidToFriendlyName(sigOid) },
  };
  if (cn) out.commonName = cn;
  if (cuit) out.cuit = cuit;

  out.isOntiIssued = looksLikeArFirmaDigitalIssuer(out);
  out.isOntiRoot = looksLikeArRoot(out);

  return out;
}

function flattenDn(dn: forge.pki.CertificateField[] | { attributes: forge.pki.CertificateField[] } | { getField: (n: string) => forge.pki.CertificateField | null; attributes: forge.pki.CertificateField[] }): Record<string, string> {
  const attrs =
    Array.isArray(dn) ? dn : "attributes" in dn && Array.isArray(dn.attributes) ? dn.attributes : [];
  const out: Record<string, string> = {};
  for (const a of attrs) {
    const key = a.shortName ?? a.name;
    if (typeof key === "string" && a.value !== undefined && a.value !== null) {
      out[key] = String(a.value);
    }
  }
  return out;
}

function extractCuit(subject: Record<string, string>): string | undefined {
  // Argentine convention: serialNumber may carry "CUIT 20-12345678-6" or
  // just "20123456786". Some certs put it in "OID 2.5.4.5" (== serialNumber).
  const candidates = [subject["serialNumber"], subject["UID"], subject["title"], subject["description"]];
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/(2[03457]|3[034])[\s.-]?(\d{8})[\s.-]?(\d)/);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
  }
  return undefined;
}

function describePublicKey(pk: forge.pki.PublicKey): ParsedCert["publicKey"] {
  if ("n" in pk && "e" in pk) {
    const bitLength = (pk.n as forge.jsbn.BigInteger).bitLength();
    return { algorithm: "RSA", bitLength };
  }
  return { algorithm: "other" };
}

// Allowed signature algorithms for chain validation: SHA-256/384/512 with RSA,
// or ECDSA P-256/384/521. SHA-1/MD5-era OIDs are intentionally excluded and are
// rejected during verifyChain (they are no longer collision-resistant).
const STRONG_SIG_OIDS: ReadonlySet<string> = new Set<string>([
  "1.2.840.113549.1.1.11", // sha256WithRSA
  "1.2.840.113549.1.1.12", // sha384WithRSA
  "1.2.840.113549.1.1.13", // sha512WithRSA
  "1.2.840.10045.4.3.2", // ecdsaWithSHA256
  "1.2.840.10045.4.3.3", // ecdsaWithSHA384
  "1.2.840.10045.4.3.4", // ecdsaWithSHA512
]);

// A certificate may sign other certificates only if it is a CA: basicConstraints
// cA === true, and (when a keyUsage extension is present) keyCertSign asserted.
function isCaCert(cert: forge.pki.Certificate): boolean {
  const bc = cert.getExtension("basicConstraints") as { cA?: boolean } | undefined;
  if (!bc || bc.cA !== true) return false;
  const ku = cert.getExtension("keyUsage") as { keyCertSign?: boolean } | undefined;
  if (ku && ku.keyCertSign !== true) return false;
  return true;
}

const SIG_OID_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.5": "sha1WithRSA",
  "1.2.840.113549.1.1.11": "sha256WithRSA",
  "1.2.840.113549.1.1.12": "sha384WithRSA",
  "1.2.840.113549.1.1.13": "sha512WithRSA",
  "1.2.840.10045.4.3.2": "ecdsaWithSHA256",
  "1.2.840.10045.4.3.3": "ecdsaWithSHA384",
  "1.2.840.10045.4.3.4": "ecdsaWithSHA512",
};

function oidToFriendlyName(oid: string): string {
  return SIG_OID_NAMES[oid] ?? oid;
}

function sha256Hex(bytes: string): string {
  const md = forge.md.sha256.create();
  md.update(bytes);
  return md.digest().toHex();
}
