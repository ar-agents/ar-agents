/**
 * Argentine Firma Digital — known trust anchors and recognized issuers.
 *
 * Verification of an AR Firma Digital chain works by matching either
 * (a) the cert's issuer DN against AR-ONTI subject DN patterns, or
 * (b) a known SHA-256 fingerprint of an AR-ONTI / AC-Raíz cert.
 *
 * The package ships a minimal default list. Production callers should
 * pass their own trust store with current AC-Raíz certs from
 * `https://www.argentina.gob.ar/jefatura/innovacion-publica/ic/ac-raiz`.
 *
 * # Why both DN patterns and fingerprints?
 *
 * Argentine government CAs rotate periodically — pinning ONLY by
 * fingerprint is brittle. The DN patterns catch the general "issued by
 * AR national PKI" case even when the specific cert hasn't been added
 * to our list.
 */

import type { ParsedCert } from "./types";

/**
 * DN attribute substrings that mark a cert as part of the AR Firma
 * Digital ecosystem. Match against `cert.subject.O` or
 * `cert.subject.OU` (case-insensitive).
 */
export const AR_FIRMA_DIGITAL_DN_PATTERNS: ReadonlyArray<string> = [
  "Sistema Nacional de Firma Digital",
  "Sistema Nacional De Firma Digital",
  "Autoridad Certificante Raíz",
  "Autoridad Certificante Raiz",
  "AC RAIZ ARGENTINA",
  "AC-RAIZ-ARGENTINA",
  "AC ONTI",
  "AC RAÍZ",
  "Oficina Nacional de Tecnologías de Información",
  "ONTI",
  "ANSES Autoridad Certificante",
  "ANSES AC",
];

/**
 * Common-name substrings that identify a root cert (not a subordinate).
 */
export const AR_ROOT_CN_PATTERNS: ReadonlyArray<string> = [
  "Autoridad Certificante Raíz",
  "Autoridad Certificante Raiz",
  "AC RAIZ ARGENTINA",
  "AC-RAIZ-ARGENTINA",
  "AC RAÍZ",
];

/**
 * SHA-256 fingerprints of known AR-ONTI / AC-Raíz certs. Empty by
 * default — callers can extend via `TrustStore`. Lowercase hex.
 */
export const AR_TRUSTED_FINGERPRINTS_SHA256: ReadonlyArray<string> = [];

export interface TrustStore {
  /** Pre-parsed trust anchors (PEM-decoded by the caller). */
  anchors: ParsedCert[];
  /** Additional DN patterns. Concatenated with `AR_FIRMA_DIGITAL_DN_PATTERNS`. */
  extraDnPatterns?: string[];
  /** Additional fingerprints. Concatenated with `AR_TRUSTED_FINGERPRINTS_SHA256`. */
  extraFingerprints?: string[];
}

/**
 * Heuristic — does this cert look like it was issued under AR Firma
 * Digital? Matches against subject + issuer DN attributes for any of
 * the well-known AR PKI patterns.
 */
export function looksLikeArFirmaDigitalIssuer(cert: ParsedCert): boolean {
  const haystack = [
    cert.issuer["O"] ?? "",
    cert.issuer["OU"] ?? "",
    cert.issuer["CN"] ?? "",
    cert.subject["O"] ?? "",
    cert.subject["OU"] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return AR_FIRMA_DIGITAL_DN_PATTERNS.some((p) => haystack.includes(p.toLowerCase()));
}

/** True when the subject CN matches an AR root pattern. */
export function looksLikeArRoot(cert: ParsedCert): boolean {
  const cn = (cert.commonName ?? cert.subject["CN"] ?? "").toLowerCase();
  return AR_ROOT_CN_PATTERNS.some((p) => cn.includes(p.toLowerCase()));
}
