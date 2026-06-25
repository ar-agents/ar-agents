/**
 * Argentine Firma Digital — trust anchors and (separately) issuer classification.
 *
 * TRUST is established ONLY by pinned SHA-256 fingerprints of AC-Raíz / ONTI
 * certs (a `TrustStore` the caller provides — `verifyChain`'s `trustAnchors`).
 * DN/CN name matching below is CLASSIFICATION METADATA ONLY: DN strings are
 * attacker-forgeable (anyone can mint a self-signed cert whose subject says
 * "Autoridad Certificante Raíz"), so a name match must NEVER make a chain valid.
 * The `looksLike*` helpers feed the informational `looksLikeArRoot` flag / the
 * `isOnti*` summary fields for triage; chain validity ignores them entirely.
 *
 * The package ships an EMPTY default fingerprint list — production callers MUST
 * pass current AC-Raíz certs from
 * `https://www.argentina.gob.ar/jefatura/innovacion-publica/ic/ac-raiz`.
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
