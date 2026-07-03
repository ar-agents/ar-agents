/**
 * Signed Constancia Oracle attestations.
 *
 * This is what makes "Firmada" literally true and builds the
 * signed-attestation-over-AR-data moat: every verification result is an
 * Ed25519-signed statement anyone can verify against the public key published
 * at `/.well-known/sociedad-ia/keys` (offline, no trust in this server).
 *
 * # Honesty is the whole point
 *
 * The signature attests to EXACTLY what was checked, never more:
 *
 *   - `checkDigit` (the free tier) is ALWAYS attested: pass/fail of the mod-11
 *     algorithm. This confirms the number is well-formed, nothing else.
 *   - `goodStanding` (the premium tier) is attested ONLY when a real ARCA
 *     verdict was produced. When the ARCA backend is dormant, the field is
 *     absent and the signed `statement` says nothing about fiscal standing.
 *
 * So a valid signature over a free-tier attestation proves "ar-agents checked
 * this CUIT's check digit at time T and got this result", which is true and
 * verifiable. It does NOT imply good standing. That distinction is the
 * product's credibility.
 */

import {
  type Ed25519Signature,
  operatorKeyId,
  operatorPublicKeySpki,
  signCanonical,
  verifyCanonical,
} from "./ed25519";

export interface ConstanciaGoodStanding {
  /** Which real backend produced the verdict. */
  source: "padron-soap" | "browse-skill";
  /** Régimen / condición as normalized by the fetcher. */
  condicion: string;
  /** Denominación (nombre / razón social), when present. */
  denominacion?: string;
  /** Estado (e.g. "ACTIVO"), when present. */
  estado?: string;
}

/**
 * The signed body. Field order is irrelevant (the canonical serializer sorts
 * keys); absent optionals are simply not signed. Keep this shape stable, a
 * change would invalidate previously issued signatures.
 */
export interface ConstanciaAttestationBody {
  kind: "ar-agents.constancia.attestation";
  version: 1;
  issuedAt: string;
  issuer: { name: "ar-agents"; url: "https://ar-agents.ar" };
  /** Bare 11-digit CUIT. */
  cuit: string;
  /** Pretty `XX-XXXXXXXX-X`. */
  cuitFormatted: string;
  /** The always-attested free-tier verdict. */
  checkDigit: { valid: boolean; algorithm: "mod-11" };
  personType: "fisica" | "juridica" | "desconocida";
  /** Present ONLY when a real ARCA verdict was produced. */
  goodStanding?: ConstanciaGoodStanding;
  /** Human-readable statement of exactly what is signed. AR Spanish. */
  statement: string;
}

export interface ConstanciaAttestation {
  body: ConstanciaAttestationBody;
  signature: Ed25519Signature;
  /** SPKI base64url of the signing key, embedded for offline verification. */
  publicKey: string;
  alg: "Ed25519";
}

/** Optional explicit keys, for tests (otherwise env keys are used). */
export interface AttestationKeys {
  privateKeyPkcs8B64url: string;
  publicKeySpkiB64url: string;
  keyId: string;
}

export interface BuildConstanciaAttestationInput {
  /** Bare 11-digit CUIT. */
  cuit: string;
  /** mod-11 check-digit result. */
  checkDigitValid: boolean;
  /** Real ARCA verdict, when available; omit for the free tier. */
  goodStanding?: ConstanciaGoodStanding | null;
  /** Override the timestamp (tests / determinism). Defaults to now. */
  issuedAt?: string;
  /** Override the signing keys (tests). Defaults to env keys. */
  keys?: AttestationKeys;
}

/** Pretty-format a bare CUIT as `XX-XXXXXXXX-X`, or return it unchanged. */
function formatCuit(bare: string): string {
  return /^\d{11}$/.test(bare)
    ? `${bare.slice(0, 2)}-${bare.slice(2, 10)}-${bare.slice(10)}`
    : bare;
}

/** Infer persona física vs jurídica from the CUIT prefix. */
function personTypeFromCuit(bare: string): ConstanciaAttestationBody["personType"] {
  if (!/^\d{11}$/.test(bare)) return "desconocida";
  const prefix = bare.slice(0, 2);
  return prefix === "30" || prefix === "33" || prefix === "34"
    ? "juridica"
    : "fisica";
}

/** Build the honest, human-readable statement that the signature covers. */
function buildStatement(
  cuitFormatted: string,
  issuedAt: string,
  checkDigitValid: boolean,
  goodStanding?: ConstanciaGoodStanding | null,
): string {
  const base = `ar-agents firma este resultado. Al ${issuedAt}, el CUIT ${cuitFormatted} ${
    checkDigitValid ? "pasa" : "no pasa"
  } el dígito verificador (mod-11).`;
  if (!goodStanding) return base;
  const nombre = goodStanding.denominacion ? `, ${goodStanding.denominacion}` : "";
  return `${base} Situación registrada en ARCA: ${goodStanding.condicion}${nombre}.`;
}

/**
 * Build and Ed25519-sign a constancia attestation. Returns null when no
 * signing key is configured (so callers degrade to an unsigned result rather
 * than crash).
 */
export async function buildConstanciaAttestation(
  input: BuildConstanciaAttestationInput,
): Promise<ConstanciaAttestation | null> {
  const publicKey = input.keys?.publicKeySpkiB64url ?? operatorPublicKeySpki();
  if (!publicKey) return null;
  const keyId = input.keys?.keyId ?? operatorKeyId();

  const bare = input.cuit;
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const cuitFormatted = formatCuit(bare);
  const goodStanding = input.goodStanding ?? undefined;

  const body: ConstanciaAttestationBody = {
    kind: "ar-agents.constancia.attestation",
    version: 1,
    issuedAt,
    issuer: { name: "ar-agents", url: "https://ar-agents.ar" },
    cuit: bare,
    cuitFormatted,
    checkDigit: { valid: input.checkDigitValid, algorithm: "mod-11" },
    personType: personTypeFromCuit(bare),
    statement: buildStatement(
      cuitFormatted,
      issuedAt,
      input.checkDigitValid,
      goodStanding,
    ),
    // goodStanding attached below ONLY when real, so it is never signed empty.
  };
  if (goodStanding) body.goodStanding = goodStanding;

  const signature = await signCanonical(
    body,
    keyId,
    input.keys?.privateKeyPkcs8B64url,
  );
  if (!signature) return null;

  return { body, signature, publicKey, alg: "Ed25519" };
}

export interface AttestationVerification {
  valid: boolean;
  reason: string;
  keyId: string | null;
}

/**
 * Verify an attestation's signature against its embedded public key. This
 * proves the body was signed by the holder of that key and has not been
 * altered. Whether that key is one you trust is a separate check (compare
 * `attestation.publicKey` to the published `/.well-known/sociedad-ia/keys`).
 */
export async function verifyConstanciaAttestation(
  attestation: ConstanciaAttestation,
): Promise<AttestationVerification> {
  const keyId = attestation?.signature?.keyId ?? null;
  if (
    !attestation ||
    typeof attestation !== "object" ||
    !attestation.body ||
    !attestation.signature ||
    !attestation.publicKey
  ) {
    return { valid: false, reason: "malformed_attestation", keyId };
  }
  if (attestation.body.kind !== "ar-agents.constancia.attestation") {
    return { valid: false, reason: "wrong_kind", keyId };
  }
  const ok = await verifyCanonical(
    attestation.body,
    attestation.signature,
    attestation.publicKey,
  );
  return {
    valid: ok,
    reason: ok ? "signature_valid" : "signature_invalid",
    keyId,
  };
}
