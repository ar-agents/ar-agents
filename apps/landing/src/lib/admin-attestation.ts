/**
 * Constitution-time KYC seam (Phase 2 #6).
 *
 * Today an administrator is purely SELF-ATTESTED: they declare a CUIT + accept
 * art. 102. That is valid pre-law, but mass use / legal validity wants a
 * possession proof that the human controls the identity. `@ar-agents/identity-
 * attest` already issues signed `Attestation`s (WhatsApp/SMS/email OTP, MercadoPago
 * identity, gov SID, ...). This module is the VERIFY half wired into constitution:
 * given a presented attestation, it confirms the signature, freshness, trust
 * level, and whether the verified subject IS the declared CUIT, and returns a
 * compact summary that gets bound into the signed constitution record.
 *
 * DELIVERY of the challenge (sending the OTP) is integration-gated — WhatsApp
 * needs Meta Business Verification, email needs an SMTP/provider, MercadoPago
 * needs a prod token. So this seam is wired + tested but not yet exercised
 * end-to-end by the live UI; it is the day-1-ready KYC upgrade path. Until a
 * delivery adapter + the request/verify endpoints exist, constitution falls back
 * to self-attestation (unchanged behavior) unless IDENTITY_ATTEST_REQUIRED=true.
 *
 * Verification reuses the package's own `AttestationClient.verifyAttestationSignature`
 * (no reimplemented crypto, no drift). Edge-safe: the package's core is Web-Crypto.
 */

import { AttestationClient, type AttestAdapter, type Attestation } from "@ar-agents/identity-attest";
import { canonicalCuit } from "./incorporate";
import type { ChannelAttestationSummary } from "./audit";

/** Default minimum trust to accept (0.3 = controls-a-phone; see identity-attest TrustLevel). */
const DEFAULT_MIN_TRUST = 0.3;

function signingSecret(): string | null {
  const s = process.env.IDENTITY_ATTEST_SECRET?.trim();
  // The client requires >= 16 chars; treat anything shorter as unconfigured
  // rather than booting a client that throws.
  return s && s.length >= 16 ? s : null;
}

/** Whether the KYC verify seam is configured (a signing secret is present). */
export function attestationConfigured(): boolean {
  return signingSecret() !== null;
}

/** Whether a verified attestation is MANDATORY to constitute (opt-in via env). */
export function attestationRequired(): boolean {
  return process.env.IDENTITY_ATTEST_REQUIRED?.trim() === "true";
}

function minTrust(): number {
  const raw = Number(process.env.IDENTITY_ATTEST_MIN_TRUST);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MIN_TRUST;
}

// The client constructor requires >= 1 adapter, but verifyAttestationSignature
// never touches an adapter. This stub satisfies the contract and refuses to do
// anything else, so it can't accidentally be used to mint or deliver.
const VERIFY_ONLY_ADAPTER: AttestAdapter = {
  id: "_verify_only",
  trustLevel: 0,
  generateSecret() {
    throw new Error("verify-only adapter cannot generate");
  },
  async deliverChallenge() {
    throw new Error("verify-only adapter cannot deliver");
  },
  async verify() {
    throw new Error("verify-only adapter cannot verify");
  },
};

function looksLikeAttestation(a: unknown): a is Attestation {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.requestId === "string" &&
    typeof o.verifier === "string" &&
    typeof o.method === "string" &&
    typeof o.trustLevel === "number" &&
    typeof o.verifiedAt === "string" &&
    typeof o.expiresAt === "string" &&
    typeof o.signature === "string" &&
    typeof o.subject === "object" &&
    o.subject !== null &&
    typeof (o.subject as Record<string, unknown>).type === "string" &&
    typeof (o.subject as Record<string, unknown>).value === "string"
  );
}

export type VerifyAttestationResult =
  | { ok: true; summary: ChannelAttestationSummary }
  | { ok: false; error: string };

/**
 * Verify a presented attestation for a constituting administrator.
 * - signature valid (HMAC, via the package), else `firma_invalida`
 * - not expired, else `attestacion_vencida`
 * - trustLevel >= configured minimum, else `confianza_insuficiente`
 * On success returns a compact summary, with `subjectMatchesCuit` true only when
 * the verified subject is the declared CUIT (the strong identity case).
 */
export async function verifyPresentedAttestation(params: {
  attestation: unknown;
  expectedCuit: string;
}): Promise<VerifyAttestationResult> {
  const secret = signingSecret();
  if (!secret) return { ok: false, error: "attestation_no_configurada" };
  if (!looksLikeAttestation(params.attestation)) {
    return { ok: false, error: "attestacion_malformada" };
  }
  const att = params.attestation;

  const client = new AttestationClient({
    signingSecret: secret,
    adapters: { _verify_only: VERIFY_ONLY_ADAPTER },
  });
  try {
    await client.verifyAttestationSignature(att);
  } catch {
    return { ok: false, error: "firma_invalida" };
  }

  if (Date.parse(att.expiresAt) <= Date.now()) {
    return { ok: false, error: "attestacion_vencida" };
  }
  if (att.trustLevel < minTrust()) {
    return { ok: false, error: "confianza_insuficiente" };
  }

  // An identity-subject (cuit/dni) attestation MUST be for the declared CUIT —
  // a proof about someone else's identity is not acceptable as this admin's KYC.
  // A channel-subject (phone/email/oauth) proves only channel control and is
  // recorded with subjectMatchesCuit=false (the policy threshold decides if that
  // is sufficient).
  const subjectIsIdentity = att.subject.type === "cuit" || att.subject.type === "dni";
  const subjectMatchesCuit =
    subjectIsIdentity && canonicalCuit(att.subject.value) === params.expectedCuit;
  if (subjectIsIdentity && !subjectMatchesCuit) {
    return { ok: false, error: "attestacion_otro_cuit" };
  }

  return {
    ok: true,
    summary: {
      method: att.method,
      trustLevel: att.trustLevel,
      subjectType: att.subject.type,
      subjectMatchesCuit,
      verifiedAt: att.verifiedAt,
    },
  };
}
