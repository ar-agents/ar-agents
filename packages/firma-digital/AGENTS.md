# Agent guide — `@ar-agents/firma-digital`

For agents at runtime: tool selection, result shapes, error patterns, AR Firma Digital context.

## When to pick this lib

- The user pastes a PEM cert and asks "who is this?" / "is this real?"
- The user has a `firma.p7s` detached signature plus a payload and wants to know "is this signed validly?"
- A sociedad-IA reference flow needs to verify the firmante of an incoming actum societario.
- An app needs to triage incoming signed docs to decide whether to proceed.

Do NOT pick this lib when:

- The user wants to **sign** a document. Signing requires hardware tokens — out of scope.
- The user has a **PAdES-LTV** PDF and needs full LTV verification. This lib does signature + chain only, no timestamp-token validation.
- The user needs to verify a generic web TLS cert. AR Firma Digital is a separate PKI from web SSL — wrong tool.

## Tool selection

| User intent                                                                 | Tool                          |
| --------------------------------------------------------------------------- | ----------------------------- |
| "Parsea este PEM" / "qué dice este cert"                                    | `firma_inspect_cert`          |
| "¿Esta cadena de certs es válida?"                                          | `firma_verify_chain`          |
| "¿Es Firma Digital argentina?" (boolean)                                    | `firma_is_onti_issued`        |
| "¿Esta firma sobre el archivo X es real?"                                   | `firma_verify_cms_signature`  |

## Result shape

```ts
// firma_inspect_cert → ParsedCert
{
  serial: string,
  fingerprintSha256: string,
  commonName?: string,
  subject: { CN, O, OU, ... },
  issuer: { CN, O, OU, ... },
  notBefore: string,           // ISO 8601
  notAfter: string,            // ISO 8601
  cuit?: string,               // 11 digits, normalized
  isOntiIssued: boolean,
  isOntiRoot: boolean,
  publicKey: { algorithm: "RSA" | "EC" | "other", bitLength?: number },
  signatureAlgorithm: { oid, name },  // e.g., "sha256WithRSA"
}

// firma_verify_chain → ChainVerificationResult
{
  valid: boolean,
  reason: string,              // SURFACE VERBATIM
  anchor?: ParsedCert,         // matched trust anchor (when valid)
  trace: Array<{ cert, verified, note }>,
}

// firma_verify_cms_signature → CmsSignatureVerificationResult
{
  valid: boolean,
  reason: string,
  signers: Array<{ cert, chainValid?, chainReason? }>,
}
```

## Error patterns

| Code                          | Meaning & next step                                                          |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `invalid_pem`                 | Input doesn't have BEGIN/END CERTIFICATE blocks. Ask the user to repaste.    |
| `cert_parse_failed`           | PEM looks valid but ASN.1 parsing fails. Likely truncated or corrupted.      |
| `cms_parse_failed`            | PKCS#7 / CMS message can't be parsed. Likely a PDF (use a PDF lib first).    |
| `signature_verification_failed` | Math is correct but signature doesn't verify. Either tampered or wrong cert.|
| `unsupported_algorithm`       | ECDSA / EdDSA / etc. — only RSA + SHA-256/384/512 today.                     |

## AR context for non-AR agents

- **Ley 25.506** (2001) created Argentine Firma Digital. Distinguishes *firma electrónica* (lower trust) from *firma digital* (full legal weight equivalent to ink).
- **AC-Raíz Argentina** is the root CA, run by ONTI (Oficina Nacional de Tecnologías de Información, now under Jefatura de Gabinete). Subordinate CAs include ANSES, AC ONTI, AC RAIZ ARGENTINA — all of which issue end-user certs.
- **CUIT in subject** — Argentine certs typically embed the holder's CUIT in `subject.serialNumber` (OID 2.5.4.5) as a string like `"CUIT 20-12345678-6"` or `"20123456786"`. The package's `extractCuit` tries both.
- **ARCA WSAA cert ≠ Firma Digital cert** — the X.509 cert AFIP/ARCA issues for SOAP web services (used by `@ar-agents/identity`'s WSAA path) is a SEPARATE PKI. ARCA-WSAA is for machine-to-machine auth; Firma Digital is for human/sociedad signatures with legal weight. Don't confuse them.
- **Subordinate CA rotation** — AR ONTI rotates AC-Raíz periodically. The heuristic pattern matching (subject DN substring) is the resilient layer; explicit fingerprint pinning is the strict layer. Default config uses heuristic only.

## What NOT to do

- DO NOT trust `cert.cuit` without separately validating it via `@ar-agents/identity`'s `validate_cuit`. Subject fields can be forged in self-signed certs.
- DO NOT skip the chain verification step in production flows. Inspecting alone tells you the cert is well-formed, NOT that it's trustworthy.
- DO NOT use this lib to sign — only to verify.
- DO NOT load a TLS web cert and expect AR ONTI matching. Different PKI; will return `isOntiIssued: false` correctly.
- DO NOT rely on `firma_verify_cms_signature` for PAdES-LTV PDFs. The lib doesn't validate timestamp tokens; long-term validity flags will be missed.
