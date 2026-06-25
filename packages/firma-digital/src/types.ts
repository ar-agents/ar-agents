/**
 * Public types for `@ar-agents/firma-digital`.
 *
 * This package is for VERIFICATION of Argentine Firma Digital (Ley
 * 25.506). It does NOT sign — signing requires a hardware token (eToken,
 * smartcard) or a managed-CSP service that exposes a remote-signing API.
 * The verification primitives are useful in agent flows where a user
 * pastes a signed PDF / detached signature and the agent has to decide
 * whether to trust it.
 */

/**
 * Parsed X.509 certificate. Returned by `parseCert()`.
 *
 * `subject` and `issuer` are flattened maps of OID-named attributes
 * (CN, O, OU, C, serialNumber, etc.). Argentine certs frequently carry
 * a CUIT in `serialNumber` and the holder's full name in `CN`.
 */
export interface ParsedCert {
  /** Hex serial number (with leading zeros if any). */
  serial: string;
  /** SHA-256 fingerprint, lowercase hex with no separators. */
  fingerprintSha256: string;
  /** Common Name from subject DN, when present. */
  commonName?: string;
  /** Subject DN attributes flattened. Argentine CUIT often in `serialNumber`. */
  subject: Record<string, string>;
  /** Issuer DN attributes flattened. */
  issuer: Record<string, string>;
  /** Validity not-before in ISO 8601. */
  notBefore: string;
  /** Validity not-after in ISO 8601. */
  notAfter: string;
  /**
   * CUIT extracted from `subject.serialNumber`. Argentine convention
   * stores it as `CUIT 20-12345678-6` or `20123456786` — we normalize.
   */
  cuit?: string;
  /** When `true`, the cert was issued by a recognized AR ONTI / AC-Raíz CA. */
  isOntiIssued: boolean;
  /** When `true`, this is itself an AR ONTI / AC-Raíz root certificate. */
  isOntiRoot: boolean;
  /** Public key info: algorithm + bit length. */
  publicKey: { algorithm: "RSA" | "EC" | "other"; bitLength?: number };
  /** Signature algorithm OID + friendly name. */
  signatureAlgorithm: { oid: string; name: string };
}

export interface ChainVerificationResult {
  valid: boolean;
  /** Plain-language explanation. Surface verbatim. */
  reason: string;
  /**
   * The trust anchor that was matched (if any). Set ONLY when valid:true, and
   * only via a configured trust anchor (a pinned fingerprint) — never via a
   * name heuristic.
   */
  anchor?: ParsedCert;
  /**
   * INFORMATIONAL ONLY. True when the root's DN looks like an AR ONTI / AC-Raíz
   * root by name. A triage hint; it NEVER establishes trust (DN strings are
   * forgeable). `valid` is decided solely by the configured trust anchors.
   */
  looksLikeArRoot?: boolean;
  /** Per-cert verification trace, leaf → root. */
  trace: Array<{
    cert: ParsedCert;
    verified: boolean;
    note: string;
  }>;
}

export interface CmsSignatureVerificationResult {
  valid: boolean;
  reason: string;
  /** Signers whose signature verified against the data. */
  signers: Array<{
    cert: ParsedCert;
    /** Set when a chain validation was attempted alongside signature verification. */
    chainValid?: boolean;
    /** When chainValid is false, the reason. */
    chainReason?: string;
  }>;
}
