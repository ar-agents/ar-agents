import { z } from "zod";

/**
 * Trust level a verification method confers, on a 0-1 scale.
 *
 * The agent uses this to gate sensitive actions: "for this $50k charge I
 * need attestation with trust >= 0.7". Higher levels typically require more
 * friction for the human (vs lower levels which are quick to obtain).
 *
 * Suggested mapping (each adapter declares its own trust level):
 * - 0.3: phone-owned (controls a number — WhatsApp/SMS OTP)
 * - 0.5: email-owned (controls an email — magic link)
 * - 0.7: federated identity (Auth0/Cognito/Okta — has an account)
 * - 0.85: KYC-verified (MercadoPago Identity / fintech that did KYC)
 * - 0.95: gov-verified (SID/MiArgentina — official identity)
 * - 1.0: in-person verified (out of agent scope)
 */
export type TrustLevel = number; // 0..1

/** Verification method identifier, free-form so adapters can register their own. */
export type VerificationMethod =
  | "whatsapp_otp"
  | "sms_otp"
  | "email_otp"
  | "email_magic_link"
  | "auth0"
  | "cognito"
  | "magic_link_sdk"
  | "mercadopago_identity"
  | "sid_gov"
  | "mi_argentina"
  | (string & {}); // allow custom

/** Lifecycle status of a verification request. */
export const VerificationStatusSchema = z.enum([
  "pending", // Request created, waiting for user action
  "verified", // User completed verification, attestation issued
  "failed", // User attempted but failed (wrong code, etc.)
  "expired", // Request timed out
  "cancelled", // Explicitly cancelled by agent or user
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * Subject of the verification — what we're trying to prove the user controls.
 *
 * For phone OTP: `{ type: "phone", value: "+5491112345678" }`
 * For email magic: `{ type: "email", value: "user@example.com" }`
 * For OAuth identity: `{ type: "oauth", value: "oidc-sub-or-email" }`
 */
export const VerificationSubjectSchema = z.object({
  type: z.enum(["phone", "email", "oauth", "dni", "cuit", "custom"]),
  value: z.string(),
});
export type VerificationSubject = z.infer<typeof VerificationSubjectSchema>;

/**
 * Optional structured claims the verifier can attach to the attestation.
 * E.g., Auth0 returns `name`, `email_verified`, `sub`. MercadoPago Identity
 * returns identity-document data when KYC level allows.
 */
export type AttestationClaims = Record<string, string | number | boolean | null>;

/** A pending verification request. Returned when the agent kicks off a flow. */
export const VerificationRequestSchema = z.object({
  /** UUID assigned at creation. The agent uses this to poll status / fetch attestation. */
  requestId: z.string(),
  /** When the request was created (ISO 8601). */
  createdAt: z.string(),
  /** When this request expires if not completed (ISO 8601). Default 15 min. */
  expiresAt: z.string(),
  /** Verification method chosen. */
  method: z.string(),
  /** Subject being verified. */
  subject: VerificationSubjectSchema,
  /** Trust level this method confers if completed successfully. */
  trustLevel: z.number().min(0).max(1),
  /** Current lifecycle status. */
  status: VerificationStatusSchema,
  /**
   * For OTP flows: the secret code the user must echo back. The lib stores
   * this; the agent never sees it (it's surfaced ONLY in the channel — e.g.,
   * sent via WhatsApp). For magic-link flows: undefined (the URL carries the
   * one-time token).
   */
  challenge: z.string().nullable(),
  /**
   * For magic-link flows: the URL the user clicks. Undefined for OTP.
   */
  verificationUrl: z.string().url().nullable(),
  /** Optional caller-supplied correlation id (your-system reference). */
  externalReference: z.string().nullable(),
  /** Free-form metadata the caller can attach. */
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;

/**
 * The signed attestation issued when verification completes successfully.
 * Persist this — it's the proof the agent presents later when proving
 * "I verified this user at this trust level on this date".
 */
export const AttestationSchema = z.object({
  /** Same as VerificationRequest.requestId. */
  requestId: z.string(),
  /** Verifier identifier — which adapter / provider issued this. */
  verifier: z.string(),
  /** Verification method used. */
  method: z.string(),
  /** Trust level conferred. */
  trustLevel: z.number().min(0).max(1),
  /** Subject that was verified. */
  subject: VerificationSubjectSchema,
  /** Optional structured claims from the verifier (name, email_verified, etc.). */
  claims: z.record(z.string(), z.unknown()).nullable(),
  /** When the verification completed. */
  verifiedAt: z.string(),
  /** When the attestation expires (suggested 30 days; agent decides re-verification cadence). */
  expiresAt: z.string(),
  /**
   * HMAC signature over `${requestId}|${verifier}|${trustLevel}|${verifiedAt}`
   * with the package's signing secret. Lets a recipient verify the attestation
   * wasn't tampered with after issuance.
   */
  signature: z.string(),
  /** Optional caller-supplied correlation id. */
  externalReference: z.string().nullable(),
});
export type Attestation = z.infer<typeof AttestationSchema>;
