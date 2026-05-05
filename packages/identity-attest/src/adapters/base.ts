import type { TrustLevel, VerificationSubject } from "../types";

/**
 * The contract every verification adapter implements.
 *
 * Adapters wrap a specific verification provider (WhatsApp OTP, email magic
 * link, Auth0, MercadoPago Identity, SID gov, etc.) and translate between
 * the lib's normalized API and the provider's specifics.
 *
 * # Adapter responsibilities
 *
 * 1. **Generate the secret** — for OTP: a 6-digit code; for magic-link: a
 *    UUID/JWT; for OAuth-style: a state nonce.
 * 2. **Deliver the challenge to the user** — send WhatsApp / email / redirect
 *    the user to the IdP. The adapter owns the channel.
 * 3. **Verify completion** — for OTP: compare submitted code; for magic-link:
 *    validate the callback token; for OAuth: exchange the code for an id_token.
 * 4. **Return claims** — optional structured data the provider exposed
 *    (name, email, KYC level, identity-document data, etc.).
 *
 * Adapters are pure orchestration — they don't write to the store or sign
 * attestations. The `AttestationClient` does that.
 */
export interface AttestAdapter {
  /** Stable identifier for this adapter (e.g., "whatsapp_otp"). */
  readonly id: string;

  /** Trust level this adapter confers when verification succeeds (0..1). */
  readonly trustLevel: TrustLevel;

  /**
   * Adapter-supplied challenge generator. For OTPs this is a 6-digit code;
   * for magic-links a URL-safe token. Called by `AttestationClient` at
   * request creation. Default suggested: `randomOtp(6)` for OTPs,
   * `randomToken(32)` for magic-links.
   */
  generateSecret(): string;

  /**
   * Deliver the verification challenge to the user. For OTP: send the code
   * via the channel (WhatsApp text). For magic-link: send the URL via email.
   * For OAuth: ignored (the user clicks a frontend link instead).
   *
   * Throws `AttestAdapterError` on transport failure. The lib retries the
   * delivery once with exponential backoff before giving up.
   */
  deliverChallenge(params: {
    requestId: string;
    subject: VerificationSubject;
    secret: string;
    /** For magic-link adapters, the callback URL the lib generated. */
    verificationUrl?: string;
    /** Free-form metadata the caller passed at request creation. */
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;

  /**
   * For magic-link / OAuth adapters: build the URL the user clicks. Returns
   * null for OTP-style adapters (where the secret is delivered in-band, not
   * as a clickable URL).
   */
  buildVerificationUrl?(params: {
    requestId: string;
    secret: string;
    callbackBaseUrl: string;
  }): string | null;

  /**
   * Verify a user's attempt. For OTP: compares submitted code to stored
   * secret. For magic-link: validates the callback token. For OAuth:
   * exchanges authorization code for id_token.
   *
   * Returns `{ verified: true, claims }` on success. Returns
   * `{ verified: false, reason }` on failure. Optional `claims` are
   * provider-supplied structured data attached to the issued attestation.
   */
  verify(params: {
    requestId: string;
    storedSecret: string;
    submitted: { code?: string; token?: string; oauthCode?: string };
    subject: VerificationSubject;
  }): Promise<
    | { verified: true; claims?: Record<string, unknown> }
    | { verified: false; reason: string }
  >;
}

/** Generate a random N-digit OTP code (default 6 digits). */
export function randomOtp(digits = 6): string {
  let s = "";
  for (let i = 0; i < digits; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

/** Generate a URL-safe random token (default 32 chars). */
export function randomToken(length = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
