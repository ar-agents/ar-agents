// Auth0 adapter — uses node:crypto for PKCE challenge generation. The
// `AttestAdapter.generateSecret()` interface is currently sync, while
// Web Crypto's `subtle.digest` is async. This adapter is therefore
// **NOT Edge-Runtime compatible** — it requires Node 18+. The main
// `@ar-agents/identity-attest` bundle (AttestationClient + WhatsApp OTP +
// Email Magic Link) IS Edge-safe; only this Auth0 + MagicLink adapter
// pull `node:crypto`. A future v0.3 will move them to subpaths.
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AttestAdapter } from "./base";
import { AttestAdapterError } from "../errors";
import type { VerificationSubject } from "../types";

/**
 * Verifies identity via Auth0 OAuth2 Authorization Code flow with PKCE.
 *
 * The agent gives the user a verification URL pointing at Auth0's `/authorize`.
 * User logs in (Universal Login: Google, Apple, SMS, password, MFA, etc.).
 * Auth0 redirects back to the configured callback with `code` + `state`.
 * The adapter exchanges `code` for `id_token`, verifies the JWT signature
 * against Auth0's JWKS, and returns standard OIDC profile claims.
 *
 * # Trust level
 *
 * - **0.7** (default): proves user controls the credential bound to the
 *   Auth0 account (Google/email/phone). Strong against casual impersonation,
 *   weak against state actors / sophisticated SIM-swap.
 * - **0.85** (when MFA was completed): pass `enforceMfa: true` to require
 *   step-up MFA. Auth0 issues `amr: ["mfa", ...]` claim; adapter verifies
 *   server-side and bumps trust automatically.
 *
 * # PKCE state management
 *
 * For every verification request, the adapter generates a random `code_verifier`
 * + the corresponding `code_challenge`. The verifier is stored in the
 * `AttestationStore`'s internal state so the callback handler can recover it.
 * The lib's `AttestationClient` already wires this — adapters just declare
 * how to build/verify.
 *
 * # Why this exists
 *
 * Most apps already have Auth0 / Cognito / Okta. The agent doesn't need to
 * issue OTPs itself — it can lean on the existing identity stack and just
 * ask "verify the user is logged in." This is the cheapest path from "agent
 * needs trust" to "user proves it."
 */

export interface Auth0AdapterOptions {
  /** Tenant domain, e.g., "your-tenant.us.auth0.com". */
  domain: string;
  /** Auth0 application client ID. */
  clientId: string;
  /** Auth0 application client secret. */
  clientSecret: string;
  /** Where Auth0 redirects after auth. Must match an Allowed Callback URL. */
  redirectUri: string;
  /** OIDC scopes — default "openid profile email". */
  scope?: string;
  /** Optional API audience for getting an access_token usable on your API. */
  audience?: string;
  /**
   * If true, requires MFA via `acr_values` and bumps trust to 0.85 on success.
   * Auth0 tenant must have MFA configured for this to actually trigger.
   */
  enforceMfa?: boolean;
}

export class Auth0Adapter implements AttestAdapter {
  readonly id = "auth0";
  readonly trustLevel = 0.7;

  private readonly domain: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scope: string;
  private readonly audience: string | undefined;
  private readonly enforceMfa: boolean;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(options: Auth0AdapterOptions) {
    this.domain = options.domain;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
    this.scope = options.scope ?? "openid profile email";
    this.audience = options.audience;
    this.enforceMfa = options.enforceMfa ?? false;
    this.jwks = createRemoteJWKSet(new URL(`https://${this.domain}/.well-known/jwks.json`));
  }

  /**
   * Generate a `code_verifier` + `code_challenge` pair (PKCE). The verifier
   * is the secret stored; the challenge goes into the URL.
   *
   * Format: `<code_verifier>:<code_challenge>` so we can split in
   * buildVerificationUrl + verify.
   */
  generateSecret(): string {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    return `${codeVerifier}:${codeChallenge}`;
  }

  buildVerificationUrl(params: { requestId: string; secret: string }): string {
    const [, codeChallenge] = params.secret.split(":");
    const url = new URL(`https://${this.domain}/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("scope", this.scope);
    url.searchParams.set("state", params.requestId);
    url.searchParams.set("code_challenge", codeChallenge!);
    url.searchParams.set("code_challenge_method", "S256");
    if (this.audience) url.searchParams.set("audience", this.audience);
    if (this.enforceMfa) {
      url.searchParams.set(
        "acr_values",
        "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
      );
    }
    return url.toString();
  }

  async deliverChallenge(): Promise<void> {
    // No-op: Auth0 delivers the challenge by hosting the login UI itself.
    // The agent just hands the user the verification_url.
  }

  async verify(params: {
    storedSecret: string;
    submitted: { token?: string; oauthCode?: string };
    subject: VerificationSubject;
  }): Promise<
    | { verified: true; claims?: Record<string, unknown> }
    | { verified: false; reason: string }
  > {
    const code = params.submitted.oauthCode ?? params.submitted.token;
    if (!code) {
      return { verified: false, reason: "Missing oauth authorization code in callback" };
    }
    const [codeVerifier] = params.storedSecret.split(":");
    if (!codeVerifier) {
      return { verified: false, reason: "Stored PKCE verifier is malformed" };
    }

    let tokenRes: Response;
    try {
      tokenRes = await fetch(`https://${this.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          code_verifier: codeVerifier,
          redirect_uri: this.redirectUri,
        }),
      });
    } catch (err) {
      throw new AttestAdapterError(
        this.id,
        `Auth0 token exchange network error: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      return {
        verified: false,
        reason: `Auth0 token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`,
      };
    }
    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      return { verified: false, reason: "Auth0 returned no id_token" };
    }

    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(tokenJson.id_token, this.jwks, {
        issuer: `https://${this.domain}/`,
        audience: this.clientId,
      });
      payload = verified.payload as Record<string, unknown>;
    } catch (err) {
      return {
        verified: false,
        reason: `Auth0 id_token verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const amr = (payload.amr as string[] | undefined) ?? [];
    const mfaCompleted = amr.includes("mfa");
    if (this.enforceMfa && !mfaCompleted) {
      return { verified: false, reason: "MFA was required but not completed (amr did not include 'mfa')" };
    }

    // Bind the verified identity to the REQUESTED subject: a valid id_token for a
    // DIFFERENT account must not satisfy a verification request for this subject.
    if (params.subject.type === "oauth") {
      if (payload.sub !== params.subject.value) {
        return { verified: false, reason: "Auth0 'sub' does not match the requested oauth subject." };
      }
    } else if (params.subject.type === "email") {
      if (payload.email !== params.subject.value) {
        return { verified: false, reason: "Auth0 'email' does not match the requested subject." };
      }
      if (payload.email_verified !== true) {
        return { verified: false, reason: "Auth0 email is not verified (email_verified !== true)." };
      }
    } else {
      return {
        verified: false,
        reason: `Auth0 adapter only attests 'oauth' or 'email' subjects, not '${params.subject.type}'.`,
      };
    }

    return {
      verified: true,
      claims: {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
        amr,
        mfa_completed: mfaCompleted,
        // Bump effective trust if MFA — caller can read this and override
        effective_trust_level: mfaCompleted ? 0.85 : this.trustLevel,
      },
    };
  }
}
